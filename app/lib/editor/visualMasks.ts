/** Native bounded clipping & feathered masking geometry. All points are local media fractions, never SVG or executable code. */
export const VISUAL_MASK_KINDS = [
  'split',
  'filmstrip',
  'circle',
  'rectangle',
  'rounded-rect',
  'heart',
  'star',
  'diamond',
  'polygon',
  'stepped',
  'torn-paper',
] as const;

export type VisualMaskKind = (typeof VISUAL_MASK_KINDS)[number];

export interface MaskPoint {
  x: number;
  y: number;
}

export interface MaskKeyframe {
  sourceTime: number;
  progress: number;
  x?: number;
  y?: number;
  scale?: number;
  width?: number;
  height?: number;
  rotation?: number;
  feather?: number;
  opacity?: number;
  easing?: 'linear' | 'smooth' | 'ease-out';
}

export interface VisualMask {
  kind: VisualMaskKind;
  progress?: number;
  keyframes?: MaskKeyframe[];
  direction?: 'left' | 'right' | 'up' | 'down';
  radius?: number;
  points?: MaskPoint[];
  steps?: number;
  seed?: number;
  roughness?: number;
  /** Feather blur softness in 720p pixels (0..100). */
  feather?: number;
  /** Mask opacity (0..1, default 1). */
  opacity?: number;
  /** Invert inside/outside of mask cutout. */
  invert?: boolean;
  /** Normalized media center X/Y offsets (-1..1, default 0). */
  x?: number;
  y?: number;
  /** Uniform scale multiplier (0.05..4, default 1). */
  scale?: number;
  /** Normalized box width/height fractions (0.05..2) for shape sizing. */
  width?: number;
  height?: number;
  /** Clockwise rotation in degrees (-3600..3600). */
  rotation?: number;
}

export interface VisualMaskMeta {
  id: VisualMaskKind;
  name: string;
  description: string;
}

export const VISUAL_MASK_CATALOG: readonly VisualMaskMeta[] = [
  { id: 'split', name: 'Split Line', description: 'Straight half-plane horizon cut rotatable to any angle' },
  { id: 'filmstrip', name: 'Filmstrip', description: 'Parallel cinema bar band cut across the frame' },
  { id: 'circle', name: 'Circle', description: 'Soft or crisp circular/elliptical spotlight aperture' },
  { id: 'rectangle', name: 'Rectangle', description: 'Resizable rectangular cutout frame with optional corner radius' },
  { id: 'rounded-rect', name: 'Rounded Box', description: 'Smooth rounded-corner card frame' },
  { id: 'heart', name: 'Heart', description: 'Classic smooth Bezier heart cutout' },
  { id: 'star', name: 'Star', description: 'Crisp 5-point geometric star mask' },
  { id: 'diamond', name: 'Diamond', description: 'Symmetrical diamond facet cutout' },
  { id: 'torn-paper', name: 'Torn Paper', description: 'Seeded organic torn-paper reveal edge' },
  { id: 'stepped', name: 'Stepped', description: 'Stair-stepped editorial strip wipe' },
  { id: 'polygon', name: 'Polygon', description: 'Custom 3–24 vertex geometric polygon' },
];

export interface EvaluatedMaskState {
  progress: number;
  x: number;
  y: number;
  scale: number;
  width?: number;
  height?: number;
  rotation: number;
  feather: number;
  opacity: number;
}

const PROTOTYPE_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const clampRange = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Invalid clipping mask.');
  const record = value as Record<string, unknown>;
  for (const k of Object.keys(record)) {
    if (PROTOTYPE_KEYS.has(k)) throw Error('Unsupported clipping mask field.');
  }
  return record;
}

function number(value: unknown, min: number, max: number) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw Error('Clipping mask value is outside its supported range.');
  }
  return value;
}

function fields(raw: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(raw).some((k) => PROTOTYPE_KEYS.has(k) || !allowed.includes(k))) {
    throw Error('Unsupported clipping mask field.');
  }
}

const cross = (a: MaskPoint, b: MaskPoint, c: MaskPoint) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);

function validatePolygon(points: MaskPoint[]) {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    if (Math.hypot(a.x - b.x, a.y - b.y) < 1e-6) throw Error('Polygon vertices must be distinct.');
    area += a.x * b.y - b.x * a.y;
    for (let j = i + 1; j < points.length; j++) {
      if (j === i + 1 || (i === 0 && j === points.length - 1)) continue;
      const c = points[j];
      const d = points[(j + 1) % points.length];
      const intersects =
        cross(a, b, c) * cross(a, b, d) <= 0 &&
        cross(c, d, a) * cross(c, d, b) <= 0 &&
        Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x)) <= Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x)) &&
        Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y)) <= Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y));
      if (intersects) throw Error('Polygon edges must not intersect.');
    }
  }
  if (Math.abs(area) < 0.0001) throw Error('A clipping polygon needs a visible area.');
}

const COMMON_MASK_FIELDS = [
  'kind',
  'progress',
  'keyframes',
  'direction',
  'feather',
  'opacity',
  'invert',
  'x',
  'y',
  'scale',
  'width',
  'height',
  'rotation',
];

const KEYFRAME_FIELDS = [
  'sourceTime',
  'progress',
  'x',
  'y',
  'scale',
  'width',
  'height',
  'rotation',
  'feather',
  'opacity',
  'easing',
];

export function readVisualMask(value: unknown): VisualMask {
  const raw = object(value);
  const kind = raw.kind;
  if (!VISUAL_MASK_KINDS.includes(String(kind) as VisualMaskKind)) {
    throw Error('Unsupported clipping mask kind.');
  }
  const extra =
    kind === 'rounded-rect' || kind === 'rectangle'
      ? ['radius']
      : kind === 'polygon'
      ? ['points']
      : kind === 'stepped'
      ? ['steps']
      : kind === 'torn-paper'
      ? ['seed', 'roughness']
      : [];
  fields(raw, [...COMMON_MASK_FIELDS, ...extra]);

  const mask: VisualMask = { kind: kind as VisualMaskKind };
  if (raw.progress !== undefined) mask.progress = number(raw.progress, 0, 1);
  if (raw.direction !== undefined) {
    if (!['left', 'right', 'up', 'down'].includes(String(raw.direction))) {
      throw Error('Unsupported mask reveal direction.');
    }
    mask.direction = raw.direction as VisualMask['direction'];
  }
  if (raw.radius !== undefined) mask.radius = number(raw.radius, 0, 0.5);
  if (raw.steps !== undefined) {
    mask.steps = number(raw.steps, 2, 16);
    if (!Number.isInteger(mask.steps)) throw Error('Mask steps must be an integer.');
  }
  if (raw.seed !== undefined) {
    mask.seed = number(raw.seed, 0, 4294967295);
    if (!Number.isInteger(mask.seed)) throw Error('Mask seed must be an integer.');
  }
  if (raw.roughness !== undefined) mask.roughness = number(raw.roughness, 0, 0.15);
  if (raw.feather !== undefined) mask.feather = number(raw.feather, 0, 100);
  if (raw.opacity !== undefined) mask.opacity = number(raw.opacity, 0, 1);
  if (raw.invert !== undefined) {
    if (typeof raw.invert !== 'boolean') throw Error('Mask invert must be boolean.');
    mask.invert = raw.invert;
  }
  if (raw.x !== undefined) mask.x = number(raw.x, -1, 1);
  if (raw.y !== undefined) mask.y = number(raw.y, -1, 1);
  if (raw.scale !== undefined) mask.scale = number(raw.scale, 0.05, 4);
  if (raw.width !== undefined) mask.width = number(raw.width, 0.05, 2);
  if (raw.height !== undefined) mask.height = number(raw.height, 0.05, 2);
  if (raw.rotation !== undefined) mask.rotation = number(raw.rotation, -3600, 3600);

  if (kind === 'polygon') {
    if (!Array.isArray(raw.points) || raw.points.length < 3 || raw.points.length > 24) {
      throw Error('Use three to twenty-four polygon vertices.');
    }
    mask.points = raw.points.map((pt) => {
      const p = object(pt);
      fields(p, ['x', 'y']);
      return { x: number(p.x, 0, 1), y: number(p.y, 0, 1) };
    });
    validatePolygon(mask.points);
  }
  if (raw.keyframes !== undefined) {
    if (!Array.isArray(raw.keyframes) || !raw.keyframes.length || raw.keyframes.length > 48) {
      throw Error('Use one to forty-eight mask keyframes.');
    }
    mask.keyframes = raw.keyframes
      .map((val) => {
        const f = object(val);
        fields(f, KEYFRAME_FIELDS);
        if (f.easing !== undefined && !['linear', 'smooth', 'ease-out'].includes(String(f.easing))) {
          throw Error('Unsupported mask easing.');
        }
        return {
          sourceTime: number(f.sourceTime, 0, 86400),
          progress: number(f.progress, 0, 1),
          ...(f.x !== undefined ? { x: number(f.x, -1, 1) } : {}),
          ...(f.y !== undefined ? { y: number(f.y, -1, 1) } : {}),
          ...(f.scale !== undefined ? { scale: number(f.scale, 0.05, 4) } : {}),
          ...(f.width !== undefined ? { width: number(f.width, 0.05, 2) } : {}),
          ...(f.height !== undefined ? { height: number(f.height, 0.05, 2) } : {}),
          ...(f.rotation !== undefined ? { rotation: number(f.rotation, -3600, 3600) } : {}),
          ...(f.feather !== undefined ? { feather: number(f.feather, 0, 100) } : {}),
          ...(f.opacity !== undefined ? { opacity: number(f.opacity, 0, 1) } : {}),
          ...(f.easing === undefined ? {} : { easing: f.easing as MaskKeyframe['easing'] }),
        };
      })
      .sort((a, b) => a.sourceTime - b.sourceTime);
    if (mask.keyframes.some((f, i) => i > 0 && f.sourceTime - mask.keyframes![i - 1].sourceTime < 1e-7)) {
      throw Error('Mask keyframe times must be unique.');
    }
  }
  return mask;
}

function interpolateScalar(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function easeMaskProgress(p: number, kind?: MaskKeyframe['easing']): number {
  if (kind === 'smooth') return p * p * (3 - 2 * p);
  if (kind === 'ease-out') return 1 - Math.pow(1 - p, 3);
  return p;
}

/** Source clock survives clip moves, trims, splits and playback-speed changes. */
export function evaluateMaskAt(mask: VisualMask, sourceTime: number): EvaluatedMaskState {
  const base: EvaluatedMaskState = {
    progress: mask.progress ?? 1,
    x: mask.x ?? 0,
    y: mask.y ?? 0,
    scale: mask.scale ?? 1,
    ...(mask.width !== undefined ? { width: mask.width } : {}),
    ...(mask.height !== undefined ? { height: mask.height } : {}),
    rotation: mask.rotation ?? 0,
    feather: mask.feather ?? 0,
    opacity: mask.opacity ?? 1,
  };
  const frames = mask.keyframes;
  if (!frames?.length) return base;
  let beforeIdx = -1;
  for (let i = 0; i < frames.length; i++) {
    if (frames[i].sourceTime <= sourceTime) beforeIdx = i;
    else break;
  }
  const before = beforeIdx >= 0 ? frames[beforeIdx] : frames[0];
  const after = beforeIdx >= 0 && beforeIdx + 1 < frames.length ? frames[beforeIdx + 1] : undefined;

  if (beforeIdx < 0) {
    return {
      progress: frames[0].progress,
      x: frames[0].x ?? base.x,
      y: frames[0].y ?? base.y,
      scale: frames[0].scale ?? base.scale,
      ...(frames[0].width !== undefined || base.width !== undefined ? { width: frames[0].width ?? base.width } : {}),
      ...(frames[0].height !== undefined || base.height !== undefined ? { height: frames[0].height ?? base.height } : {}),
      rotation: frames[0].rotation ?? base.rotation,
      feather: frames[0].feather ?? base.feather,
      opacity: frames[0].opacity ?? base.opacity,
    };
  }
  if (!after) {
    return {
      progress: before.progress,
      x: before.x ?? base.x,
      y: before.y ?? base.y,
      scale: before.scale ?? base.scale,
      ...(before.width !== undefined || base.width !== undefined ? { width: before.width ?? base.width } : {}),
      ...(before.height !== undefined || base.height !== undefined ? { height: before.height ?? base.height } : {}),
      rotation: before.rotation ?? base.rotation,
      feather: before.feather ?? base.feather,
      opacity: before.opacity ?? base.opacity,
    };
  }
  const tRaw = clamp01((sourceTime - before.sourceTime) / (after.sourceTime - before.sourceTime));
  const q = easeMaskProgress(tRaw, after.easing);
  const bW = before.width ?? base.width;
  const aW = after.width ?? base.width;
  const bH = before.height ?? base.height;
  const aH = after.height ?? base.height;

  return {
    progress: clamp01(interpolateScalar(before.progress, after.progress, q)),
    x: clampRange(interpolateScalar(before.x ?? base.x, after.x ?? base.x, q), -1, 1),
    y: clampRange(interpolateScalar(before.y ?? base.y, after.y ?? base.y, q), -1, 1),
    scale: clampRange(interpolateScalar(before.scale ?? base.scale, after.scale ?? base.scale, q), 0.05, 4),
    ...(bW !== undefined && aW !== undefined ? { width: clampRange(interpolateScalar(bW, aW, q), 0.05, 2) } : {}),
    ...(bH !== undefined && aH !== undefined ? { height: clampRange(interpolateScalar(bH, aH, q), 0.05, 2) } : {}),
    rotation: clampRange(interpolateScalar(before.rotation ?? base.rotation, after.rotation ?? base.rotation, q), -3600, 3600),
    feather: clampRange(interpolateScalar(before.feather ?? base.feather, after.feather ?? base.feather, q), 0, 100),
    opacity: clamp01(interpolateScalar(before.opacity ?? base.opacity, after.opacity ?? base.opacity, q)),
  };
}

/** Backwards-compatible scalar progress helper on source clock. */
export function maskProgressAt(mask: VisualMask, sourceTime: number) {
  return evaluateMaskAt(mask, sourceTime).progress;
}

function random(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/** Direction identifies the entering edge: left/right/top(up)/bottom(down). Endpoints are exactly empty/full. */
export function maskRevealPolygon(mask: VisualMask, progress: number): MaskPoint[] {
  const p = clamp01(progress);
  if (p === 1) {
    return [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ];
  }
  if (p === 0) {
    return [
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 0, y: 0 },
    ];
  }
  const edge: MaskPoint[] = [];
  if (mask.kind === 'stepped') {
    const steps = mask.steps ?? 6;
    for (let i = 0; i < steps; i++) {
      const x = clamp01(p * 1.35 - (0.35 * i) / (steps - 1));
      edge.push({ x, y: i / steps }, { x, y: (i + 1) / steps });
    }
  } else if (mask.kind === 'torn-paper') {
    const next = random(mask.seed ?? 1);
    const roughness = mask.roughness ?? 0.06;
    const envelope = Math.sin(p * Math.PI);
    for (let i = 0; i <= 32; i++) {
      const y = i / 32;
      edge.push({ x: clamp01(p + ((next() * 2 - 1) * roughness + (y - 0.5) * 0.45) * envelope), y });
    }
  } else {
    edge.push({ x: p, y: 0 }, { x: p, y: 1 });
  }
  const poly = [{ x: 0, y: 0 }, ...edge, { x: 0, y: 1 }];
  return poly.map(({ x, y }) =>
    mask.direction === 'right'
      ? { x: 1 - x, y }
      : mask.direction === 'up'
      ? { x: y, y: x }
      : mask.direction === 'down'
      ? { x: y, y: 1 - x }
      : { x, y }
  );
}

function polygon(ctx: CanvasRenderingContext2D, points: MaskPoint[], width: number, height: number) {
  ctx.beginPath();
  points.forEach((p, i) => {
    const x = (p.x - 0.5) * width;
    const y = (p.y - 0.5) * height;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
}

function buildShapePath(
  ctx: CanvasRenderingContext2D,
  mask: VisualMask,
  width: number,
  height: number,
  state: EvaluatedMaskState
) {
  const { progress, scale, rotation, x, y } = state;
  const cx = x * width * 0.5;
  const cy = y * height * 0.5;
  const hasTransform =
    Math.abs(cx) > 0.01 || Math.abs(cy) > 0.01 || Math.abs(rotation) > 0.01 || Math.abs(scale - 1) > 0.001;
  if (hasTransform) {
    ctx.save();
    ctx.translate(cx, cy);
    if (Math.abs(rotation) > 0.01) ctx.rotate((rotation * Math.PI) / 180);
    if (Math.abs(scale - 1) > 0.001) ctx.scale(scale, scale);
  }

  const boxW = width * (state.width ?? (mask.kind === 'rounded-rect' || mask.kind === 'rectangle' ? 0.8 : 0.72)) * progress;
  const boxH = height * (state.height ?? (mask.kind === 'rounded-rect' || mask.kind === 'rectangle' ? 0.8 : 0.72)) * progress;

  switch (mask.kind) {
    case 'split': {
      // Half-plane reveal along centerline; defaults to top half visible and wipes downward by progress
      const diag = Math.hypot(width, height) * 1.6;
      const halfSpan = Math.max(1, diag * clamp01(progress) * 0.65);
      ctx.beginPath();
      ctx.rect(-diag, -halfSpan, diag * 2, halfSpan);
      break;
    }
    case 'filmstrip': {
      const diag = Math.hypot(width, height) * 1.4;
      const bandH = height * (state.height ?? 0.42) * progress;
      ctx.beginPath();
      ctx.rect(-diag, -bandH / 2, diag * 2, Math.max(0.5, bandH));
      break;
    }
    case 'circle': {
      if (state.width !== undefined || state.height !== undefined) {
        const rx = Math.max(0.5, (width * (state.width ?? 0.7) * progress) / 2);
        const ry = Math.max(0.5, (height * (state.height ?? 0.7) * progress) / 2);
        ctx.beginPath();
        if (typeof ctx.ellipse === 'function') {
          ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
        } else {
          ctx.arc(0, 0, Math.min(rx, ry), 0, Math.PI * 2);
        }
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, Math.min(width, height) * 0.5 * progress, 0, Math.PI * 2);
      }
      break;
    }
    case 'rectangle':
    case 'rounded-rect': {
      const rw = mask.kind === 'rounded-rect' && state.width === undefined && !hasTransform ? width : Math.max(1, boxW);
      const rh = mask.kind === 'rounded-rect' && state.height === undefined && !hasTransform ? height : Math.max(1, boxH);
      const radius = mask.kind === 'rectangle' ? Math.min(rw, rh) * (mask.radius ?? 0) : Math.min(rw, rh) * (mask.radius ?? 0.15);
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(-rw / 2, -rh / 2, rw, rh, Math.max(0, radius));
      } else {
        ctx.rect(-rw / 2, -rh / 2, rw, rh);
      }
      break;
    }
    case 'diamond': {
      const hw = Math.max(0.5, (width * (state.width ?? 0.72) * progress) / 2);
      const hh = Math.max(0.5, (height * (state.height ?? 0.72) * progress) / 2);
      ctx.beginPath();
      ctx.moveTo(0, -hh);
      ctx.lineTo(hw, 0);
      ctx.lineTo(0, hh);
      ctx.lineTo(-hw, 0);
      ctx.closePath();
      break;
    }
    case 'star': {
      const outerR = Math.min(width, height) * 0.45 * progress * (state.width ?? 1);
      const innerR = outerR * 0.42;
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? outerR : innerR;
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const px = Math.cos(a) * r;
        const py = Math.sin(a) * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      break;
    }
    case 'heart': {
      const s = Math.min(width, height) * 0.42 * progress * (state.width ?? 1);
      ctx.beginPath();
      ctx.moveTo(0, s * 0.35);
      ctx.bezierCurveTo(-s * 0.05, -s * 0.2, -s * 1.15, -s * 0.1, -s * 0.9, s * 0.45);
      ctx.bezierCurveTo(-s * 0.75, s * 0.9, -s * 0.1, s * 1.05, 0, s * 1.25);
      ctx.bezierCurveTo(s * 0.1, s * 1.05, s * 0.75, s * 0.9, s * 0.9, s * 0.45);
      ctx.bezierCurveTo(s * 1.15, -s * 0.1, s * 0.05, -s * 0.2, 0, s * 0.35);
      ctx.translate(0, -s * 0.55);
      ctx.closePath();
      break;
    }
    case 'polygon': {
      polygon(ctx, mask.points!, width, height);
      break;
    }
    case 'stepped':
    case 'torn-paper': {
      polygon(ctx, maskRevealPolygon(mask, progress), width, height);
      break;
    }
  }

  if (hasTransform) {
    ctx.restore();
  }
}

type MaskRaster = HTMLCanvasElement | OffscreenCanvas;
type MaskContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
interface MaskScratch {
  media: MaskRaster;
  alpha: MaskRaster;
  mediaCtx: MaskContext;
  alphaCtx: MaskContext;
}
const maskScratchCache = new WeakMap<CanvasRenderingContext2D, MaskScratch>();

function getMaskScratch(ctx: CanvasRenderingContext2D, w: number, h: number): MaskScratch | null {
  if (typeof OffscreenCanvas === 'undefined' && typeof document === 'undefined') return null;
  let entry = maskScratchCache.get(ctx);
  if (!entry) {
    const make = (): MaskRaster =>
      typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(1, 1) : document.createElement('canvas');
    const media = make();
    const alpha = make();
    const mediaCtx = media.getContext('2d') as MaskContext | null;
    const alphaCtx = alpha.getContext('2d') as MaskContext | null;
    if (!mediaCtx || !alphaCtx) return null;
    entry = { media, alpha, mediaCtx, alphaCtx };
    maskScratchCache.set(ctx, entry);
  }
  const rw = Math.max(2, Math.ceil(w));
  const rh = Math.max(2, Math.ceil(h));
  if (entry.media.width !== rw || entry.media.height !== rh) {
    entry.media.width = rw;
    entry.media.height = rh;
  }
  if (entry.alpha.width !== rw || entry.alpha.height !== rh) {
    entry.alpha.width = rw;
    entry.alpha.height = rh;
  }
  return entry;
}

/** Clips the real media/card and its accents using exact source-clock path geometry. Callers own save/restore. */
export function applyVisualMask(
  ctx: CanvasRenderingContext2D,
  mask: VisualMask,
  width: number,
  height: number,
  sourceTime: number
) {
  const state = evaluateMaskAt(mask, sourceTime);
  // Preserve legacy circle / rounded-rect / stepped / torn-paper behavior identically
  if (
    mask.kind === 'rounded-rect' &&
    state.x === 0 &&
    state.y === 0 &&
    state.scale === 1 &&
    state.rotation === 0 &&
    state.width === undefined &&
    state.height === undefined
  ) {
    ctx.beginPath();
    ctx.roundRect(-width / 2, -height / 2, width, height, Math.min(width, height) * (mask.radius ?? 0.15));
    ctx.clip();
    if (state.progress < 1) {
      polygon(ctx, maskRevealPolygon(mask, state.progress), width, height);
      ctx.clip();
    }
    return;
  }
  buildShapePath(ctx, mask, width, height, state);
  ctx.clip();
}

/**
 * Full-fidelity mask compositor supporting crisp clip fast-path + soft feathering, mask opacity,
 * geometric transforms, keyframe interpolation, and inverted masking without visual artifacts.
 */
export function drawMaskedMedia(
  ctx: CanvasRenderingContext2D,
  mask: VisualMask,
  width: number,
  height: number,
  sourceTime: number,
  drawFn: (targetCtx: CanvasRenderingContext2D) => void
) {
  const state = evaluateMaskAt(mask, sourceTime);
  const needsComposite = state.feather > 0.1 || state.opacity < 0.999 || Boolean(mask.invert);
  if (!needsComposite) {
    ctx.save();
    applyVisualMask(ctx, mask, width, height, sourceTime);
    drawFn(ctx);
    ctx.restore();
    return;
  }

  const scratch = getMaskScratch(ctx, width, height);
  if (!scratch) {
    // Headless Node mock fallback (no OffscreenCanvas/DOM)
    ctx.save();
    ctx.globalAlpha *= state.opacity;
    applyVisualMask(ctx, mask, width, height, sourceTime);
    drawFn(ctx);
    ctx.restore();
    return;
  }

  const rw = scratch.media.width;
  const rh = scratch.media.height;
  const { mediaCtx, alphaCtx } = scratch;

  mediaCtx.save();
  mediaCtx.setTransform(1, 0, 0, 1, 0, 0);
  mediaCtx.clearRect(0, 0, rw, rh);
  mediaCtx.translate(rw / 2, rh / 2);
  drawFn(mediaCtx as unknown as CanvasRenderingContext2D);
  mediaCtx.restore();

  const unit = Math.min(rw, rh) / 720;
  const blurPx = state.feather * Math.max(0.35, unit);

  alphaCtx.save();
  alphaCtx.setTransform(1, 0, 0, 1, 0, 0);
  alphaCtx.clearRect(0, 0, rw, rh);
  alphaCtx.globalAlpha = state.opacity;
  if (blurPx > 0.1 && 'filter' in alphaCtx) {
    alphaCtx.filter = `blur(${blurPx.toFixed(1)}px)`;
  }
  if (mask.invert) {
    alphaCtx.fillStyle = '#ffffff';
    alphaCtx.fillRect(0, 0, rw, rh);
    alphaCtx.globalCompositeOperation = 'destination-out';
    alphaCtx.globalAlpha = 1;
    alphaCtx.translate(rw / 2, rh / 2);
    buildShapePath(alphaCtx as unknown as CanvasRenderingContext2D, mask, rw, rh, state);
    alphaCtx.fillStyle = '#000000';
    alphaCtx.fill();
  } else {
    alphaCtx.translate(rw / 2, rh / 2);
    buildShapePath(alphaCtx as unknown as CanvasRenderingContext2D, mask, rw, rh, state);
    alphaCtx.fillStyle = '#ffffff';
    alphaCtx.fill();
  }
  alphaCtx.restore();

  mediaCtx.save();
  mediaCtx.setTransform(1, 0, 0, 1, 0, 0);
  mediaCtx.globalCompositeOperation = 'destination-in';
  mediaCtx.drawImage(scratch.alpha as CanvasImageSource, 0, 0);
  mediaCtx.restore();

  ctx.drawImage(scratch.media as CanvasImageSource, -width / 2, -height / 2, width, height);
}
