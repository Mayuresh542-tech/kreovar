import { addText, addClip, addTrack, changeText } from './operations';
import { applyMotionPreset, type MotionPreset } from './keyframes';
import { type EditorProject, clamp, dimensions } from './model';

export const LEGACY_GRAPHIC_KINDS = ['label', 'lower-third', 'stat', 'callout'] as const;
export const RICH_GRAPHIC_KINDS = [
  'stat-counter',
  'progress-ring',
  'bar-chart',
  'comparison',
  'checklist',
  'step-flow',
  'notification',
  'pointer-callout',
  'quote-card',
  'kinetic-badge',
] as const;

export const GRAPHIC_KINDS = [...LEGACY_GRAPHIC_KINDS, ...RICH_GRAPHIC_KINDS] as const;
export type GraphicKind = (typeof GRAPHIC_KINDS)[number];

export const GRAPHIC_THEMES = ['clean-light', 'frosted-glass', 'editorial-paper', 'dark-slate'] as const;
export type GraphicTheme = (typeof GRAPHIC_THEMES)[number];

export const GRAPHIC_ICONS = [
  'none',
  'rocket',
  'chart',
  'dollar',
  'rupee',
  'check',
  'warning',
  'bolt',
  'clock',
  'star',
  'target',
  'flame',
  'user',
  'sparkles',
] as const;
export type GraphicIcon = (typeof GRAPHIC_ICONS)[number];

export interface GraphicBar {
  label: string;
  value: number;
  displayValue?: string;
  color?: string;
}

export interface GraphicComparison {
  leftTitle: string;
  leftValue: string;
  rightTitle: string;
  rightValue: string;
}

export interface MotionGraphic {
  kind: GraphicKind;
  accent: string;
  panel: string;
  theme?: GraphicTheme;
  subtitle?: string;
  icon?: GraphicIcon;
  value?: number;
  prefix?: string;
  suffix?: string;
  items?: string[];
  bars?: GraphicBar[];
  comparison?: GraphicComparison;
  targetX?: number;
  targetY?: number;
}

export interface MotionGraphicOptions {
  theme?: GraphicTheme;
  panel?: string;
  subtitle?: string;
  icon?: GraphicIcon;
  value?: number;
  prefix?: string;
  suffix?: string;
  items?: string[];
  bars?: GraphicBar[];
  comparison?: GraphicComparison;
  targetX?: number;
  targetY?: number;
  x?: number;
  y?: number;
  scale?: number;
  allowNewTrack?: boolean;
}

const THEME_PANELS: Record<GraphicTheme, string> = {
  'clean-light': '#fbfbfdf2',
  'frosted-glass': '#ffffffd9',
  'editorial-paper': '#faf8f2f5',
  'dark-slate': '#111827e8',
};

const HEX6 = /^#[\da-f]{6}$/i;
const HEX6_OR_8 = /^#[\da-f]{6}([\da-f]{2})?$/i;

function isRichKind(kind: GraphicKind): boolean {
  return (RICH_GRAPHIC_KINDS as readonly string[]).includes(kind);
}

function readShortText(value: unknown, max: number): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.length > max) throw Error('Invalid motion graphic.');
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

export function readMotionGraphic(value: unknown): MotionGraphic {
  const g = value as MotionGraphic;
  if (!g || !GRAPHIC_KINDS.includes(g.kind) || !HEX6.test(g.accent) || !HEX6_OR_8.test(g.panel)) {
    throw Error('Invalid motion graphic.');
  }
  const out: MotionGraphic = { kind: g.kind, accent: g.accent, panel: g.panel };
  if (g.theme !== undefined) {
    if (!GRAPHIC_THEMES.includes(g.theme)) throw Error('Invalid motion graphic.');
    out.theme = g.theme;
  }
  const subtitle = readShortText(g.subtitle, 120);
  if (subtitle) out.subtitle = subtitle;
  if (g.icon !== undefined) {
    if (!GRAPHIC_ICONS.includes(g.icon)) throw Error('Invalid motion graphic.');
    out.icon = g.icon;
  }
  if (g.value !== undefined) {
    if (typeof g.value !== 'number' || !Number.isFinite(g.value) || Math.abs(g.value) > 1e9) {
      throw Error('Invalid motion graphic.');
    }
    out.value = g.value;
  }
  const prefix = readShortText(g.prefix, 12);
  if (prefix) out.prefix = prefix;
  const suffix = readShortText(g.suffix, 16);
  if (suffix) out.suffix = suffix;
  if (g.items !== undefined) {
    if (!Array.isArray(g.items) || g.items.length > 6) throw Error('Invalid motion graphic.');
    out.items = g.items.map((item) => {
      if (typeof item !== 'string' || !item.trim() || item.length > 80) throw Error('Invalid motion graphic.');
      return item.trim();
    });
  }
  if (g.bars !== undefined) {
    if (!Array.isArray(g.bars) || g.bars.length > 5) throw Error('Invalid motion graphic.');
    out.bars = g.bars.map((bar) => {
      if (
        !bar ||
        typeof bar !== 'object' ||
        typeof bar.label !== 'string' ||
        !bar.label.trim() ||
        bar.label.length > 40 ||
        typeof bar.value !== 'number' ||
        !Number.isFinite(bar.value) ||
        bar.value < 0 ||
        bar.value > 1e9
      ) {
        throw Error('Invalid motion graphic.');
      }
      if (bar.color !== undefined && !HEX6.test(bar.color)) throw Error('Invalid motion graphic.');
      const displayValue = readShortText(bar.displayValue, 24);
      return {
        label: bar.label.trim(),
        value: bar.value,
        ...(displayValue ? { displayValue } : {}),
        ...(bar.color ? { color: bar.color } : {}),
      };
    });
  }
  if (g.comparison !== undefined) {
    const cmp = g.comparison;
    if (
      !cmp ||
      typeof cmp !== 'object' ||
      typeof cmp.leftTitle !== 'string' ||
      !cmp.leftTitle.trim() ||
      cmp.leftTitle.length > 40 ||
      typeof cmp.leftValue !== 'string' ||
      !cmp.leftValue.trim() ||
      cmp.leftValue.length > 60 ||
      typeof cmp.rightTitle !== 'string' ||
      !cmp.rightTitle.trim() ||
      cmp.rightTitle.length > 40 ||
      typeof cmp.rightValue !== 'string' ||
      !cmp.rightValue.trim() ||
      cmp.rightValue.length > 60
    ) {
      throw Error('Invalid motion graphic.');
    }
    out.comparison = {
      leftTitle: cmp.leftTitle.trim(),
      leftValue: cmp.leftValue.trim(),
      rightTitle: cmp.rightTitle.trim(),
      rightValue: cmp.rightValue.trim(),
    };
  }
  if (g.targetX !== undefined) {
    if (typeof g.targetX !== 'number' || !Number.isFinite(g.targetX) || g.targetX < -0.5 || g.targetX > 0.5) {
      throw Error('Invalid motion graphic.');
    }
    out.targetX = g.targetX;
  }
  if (g.targetY !== undefined) {
    if (typeof g.targetY !== 'number' || !Number.isFinite(g.targetY) || g.targetY < -0.5 || g.targetY > 0.5) {
      throw Error('Invalid motion graphic.');
    }
    out.targetY = g.targetY;
  }
  return out;
}

export function addMotionGraphic(
  p: EditorProject,
  kind: GraphicKind,
  text: string,
  startTime: number,
  duration: number,
  accent?: string,
  motion: MotionPreset = 'slide-up',
  options: MotionGraphicOptions = {}
): EditorProject {
  const hasRichPayload =
    isRichKind(kind) ||
    options.theme !== undefined ||
    options.subtitle !== undefined ||
    options.icon !== undefined ||
    options.value !== undefined ||
    options.prefix !== undefined ||
    options.suffix !== undefined ||
    (options.items !== undefined && options.items.length > 0) ||
    (options.bars !== undefined && options.bars.length > 0) ||
    options.comparison !== undefined;

  const resolvedTheme: GraphicTheme | undefined =
    options.theme ?? (hasRichPayload ? 'clean-light' : undefined);
  const resolvedPanel = options.panel ?? (resolvedTheme ? THEME_PANELS[resolvedTheme] : '#111827e8');
  const resolvedAccent = accent ?? (hasRichPayload ? '#7c3aed' : '#c8ff00');

  const graphic = readMotionGraphic({
    kind,
    accent: resolvedAccent,
    panel: resolvedPanel,
    ...(resolvedTheme ? { theme: resolvedTheme } : {}),
    ...(options.subtitle !== undefined ? { subtitle: options.subtitle } : {}),
    ...(options.icon !== undefined ? { icon: options.icon } : {}),
    ...(options.value !== undefined ? { value: options.value } : {}),
    ...(options.prefix !== undefined ? { prefix: options.prefix } : {}),
    ...(options.suffix !== undefined ? { suffix: options.suffix } : {}),
    ...(options.items !== undefined ? { items: options.items } : {}),
    ...(options.bars !== undefined ? { bars: options.bars } : {}),
    ...(options.comparison !== undefined ? { comparison: options.comparison } : {}),
    ...(options.targetX !== undefined ? { targetX: options.targetX } : {}),
    ...(options.targetY !== undefined ? { targetY: options.targetY } : {}),
  });

  if (
    !text.trim() ||
    text.length > 120 ||
    !Number.isFinite(startTime) ||
    startTime < 0 ||
    !Number.isFinite(duration) ||
    duration < 0.5 ||
    duration > 12 ||
    startTime + duration > 60
  ) {
    throw Error('Keep graphics short and inside the 60-second edit.');
  }

  const [width, height] = dimensions[p.settings.aspectRatio];
  const size = Math.round(
    Math.min(width, height) * (kind === 'stat' || kind === 'stat-counter' ? 0.085 : 0.047)
  );

  const visibleTextTracks = p.trackOrder
    .map((id) => p.tracks[id])
    .filter((t) => t && t.kind === 'text' && !t.hidden && !t.locked);
  if (!visibleTextTracks.length) {
    throw Error('Add or unlock a visible text track for graphics.');
  }

  const isFreeAtTime = (trackId: string) =>
    !Object.values(p.clips).some(
      (old) =>
        old.trackId === trackId &&
        old.startTime < startTime + duration &&
        old.startTime + old.duration > startTime
    );

  let workingProject = p;
  let track = visibleTextTracks.find((t) => isFreeAtTime(t.id));
  if (!track) {
    if (!options.allowNewTrack) {
      throw Error('The text track is occupied at this graphic time.');
    }
    const withNewTrack = addTrack(workingProject, 'text');
    const newTrackId = withNewTrack.trackOrder.at(-1)!;
    const rawNewTrack = withNewTrack.tracks[newTrackId];
    const graphicsCount = visibleTextTracks.filter((t) => t.name.startsWith('Graphics')).length;
    workingProject = {
      ...withNewTrack,
      tracks: {
        ...withNewTrack.tracks,
        [newTrackId]: {
          ...rawNewTrack,
          name: graphicsCount ? `Graphics ${graphicsCount + 1}` : 'Graphics',
        },
      },
    };
    track = workingProject.tracks[newTrackId];
  }

  const isVertical = p.settings.aspectRatio === '9:16' || p.settings.aspectRatio === '4:5';
  const existingGraphicCount = Object.values(workingProject.clips).filter((old) => Boolean(old.graphic)).length;
  const isCompactTopKind =
    kind === 'stat-counter' ||
    kind === 'progress-ring' ||
    kind === 'notification' ||
    kind === 'kinetic-badge';

  let defaultX = 0;
  let defaultY = kind === 'lower-third' ? 0.22 : -0.26;
  let defaultScale = 1;

  if (hasRichPayload) {
    if (isVertical) {
      defaultX = 0;
      defaultY =
        kind === 'lower-third'
          ? 0.20
          : kind === 'pointer-callout' && options.targetY !== undefined
            ? options.targetY > 0
              ? -0.36
              : 0.17
            : isCompactTopKind
              ? -0.37
              : 0.17;
      defaultScale = isCompactTopKind ? 0.84 : 0.86;
    } else {
      defaultX = kind === 'lower-third' ? -0.20 : existingGraphicCount % 2 === 0 ? 0.28 : -0.28;
      defaultY = kind === 'lower-third' ? 0.26 : -0.04;
      defaultScale = 0.84;
    }
  }

  const x = options.x !== undefined && Number.isFinite(options.x) ? clamp(options.x, -0.45, 0.45) : defaultX;
  const y = options.y !== undefined && Number.isFinite(options.y) ? clamp(options.y, -0.45, 0.45) : defaultY;
  const scale =
    options.scale !== undefined && Number.isFinite(options.scale) ? clamp(options.scale, 0.4, 1.8) : defaultScale;

  const textColor = resolvedTheme && resolvedTheme !== 'dark-slate' ? '#0f172a' : '#ffffff';
  const next = addText(
    workingProject,
    text,
    startTime,
    {
      font: 'Inter',
      size,
      weight: kind === 'stat' || kind === 'stat-counter' ? 800 : 600,
      color: textColor,
      background: 'transparent',
      maxWidth: kind === 'lower-third' ? 0.65 : 0.58,
    },
    false,
    duration,
    track.id
  );
  const id = Object.keys(next.clips).find((cid) => !workingProject.clips[cid])!;
  const c = next.clips[id];
  const positioned: EditorProject = {
    ...next,
    clips: {
      ...next.clips,
      [id]: {
        ...c,
        graphic,
        transform: { ...c.transform, x, y, scale },
      },
    },
  };
  return applyMotionPreset(positioned, id, motion);
}

export function changeMotionGraphic(
  p: EditorProject,
  id: string,
  patch: Partial<MotionGraphic> & { text?: string }
): EditorProject {
  const c = p.clips[id];
  if (!c?.graphic || p.tracks[c.trackId]?.locked) {
    throw Error('Select an unlocked motion graphic.');
  }
  const { text: nextText, ...graphicPatch } = patch;
  let next = p;
  if (typeof nextText === 'string' && nextText.trim() && c.contentId && p.textLayers[c.contentId]) {
    next = changeText(next, id, nextText.trim().slice(0, 120));
  }
  const updatedClip = next.clips[id];
  const nextTheme = graphicPatch.theme ?? updatedClip.graphic!.theme;
  const nextPanel =
    graphicPatch.panel ??
    (graphicPatch.theme ? THEME_PANELS[graphicPatch.theme] : updatedClip.graphic!.panel);
  const merged = readMotionGraphic({
    ...updatedClip.graphic,
    ...graphicPatch,
    ...(nextTheme ? { theme: nextTheme } : {}),
    panel: nextPanel,
  });
  return {
    ...next,
    clips: {
      ...next.clips,
      [id]: { ...updatedClip, graphic: merged },
    },
  };
}

export function addAnimatedOverlay(
  p: EditorProject,
  assetId: string,
  trackId: string,
  startTime: number,
  duration: number,
  motion: MotionPreset = 'pop'
) {
  const asset = p.assets[assetId],
    track = p.tracks[trackId];
  if (
    !asset ||
    asset.kind !== 'image' ||
    !track ||
    !['overlay', 'image'].includes(track.kind) ||
    track.hidden ||
    track.locked
  ) {
    throw Error('Choose an image and a visible unlocked image/overlay track.');
  }
  if (
    !Number.isFinite(startTime) ||
    startTime < 0 ||
    !Number.isFinite(duration) ||
    duration < 0.5 ||
    duration > 12 ||
    startTime + duration > 60
  ) {
    throw Error('Keep image overlays inside the 60-second edit.');
  }
  if (
    track.clipIds.some((id) => {
      const c = p.clips[id];
      return c.startTime < startTime + duration && c.startTime + c.duration > startTime;
    })
  ) {
    throw Error('The overlay track is occupied at this time.');
  }
  const next = addClip(p, assetId, trackId, startTime, {
    duration,
    sourceEnd: duration,
    transform: { x: 0.25, y: -0.06, scale: 0.32, rotation: 0, opacity: 1 },
    volume: 0,
  });
  const id = Object.keys(next.clips).find((cid) => !p.clips[cid])!;
  return applyMotionPreset(next, id, motion);
}

// ---------- Canvas2D Procedural Renderer ----------

export interface GraphicDrawContext {
  title?: string;
  frameWidth?: number;
  frameHeight?: number;
  duration?: number;
  font?: string;
}

export interface GraphicDrawResult {
  width: number;
  height: number;
  handlesText?: boolean;
}

interface ThemePalette {
  bg: string;
  border: string;
  title: string;
  muted: string;
  trackBg: string;
  innerCardBg: string;
  shadow: string;
}

function paletteFor(g: MotionGraphic): ThemePalette {
  const theme = g.theme ?? 'dark-slate';
  switch (theme) {
    case 'clean-light':
      return {
        bg: g.panel || '#fbfbfdf2',
        border: 'rgba(15, 23, 42, 0.10)',
        title: '#0f172a',
        muted: '#475569',
        trackBg: 'rgba(15, 23, 42, 0.08)',
        innerCardBg: 'rgba(15, 23, 42, 0.035)',
        shadow: 'rgba(15, 23, 42, 0.14)',
      };
    case 'frosted-glass':
      return {
        bg: g.panel || '#ffffffd9',
        border: 'rgba(255, 255, 255, 0.85)',
        title: '#0f172a',
        muted: '#334155',
        trackBg: 'rgba(15, 23, 42, 0.10)',
        innerCardBg: 'rgba(255, 255, 255, 0.55)',
        shadow: 'rgba(15, 23, 42, 0.18)',
      };
    case 'editorial-paper':
      return {
        bg: g.panel || '#faf8f2f5',
        border: 'rgba(28, 25, 23, 0.15)',
        title: '#1c1917',
        muted: '#57534e',
        trackBg: 'rgba(28, 25, 23, 0.09)',
        innerCardBg: 'rgba(28, 25, 23, 0.04)',
        shadow: 'rgba(28, 25, 23, 0.14)',
      };
    case 'dark-slate':
    default:
      return {
        bg: g.panel || '#111827e8',
        border: 'rgba(255, 255, 255, 0.12)',
        title: '#f8fafc',
        muted: '#cbd5e1',
        trackBg: 'rgba(255, 255, 255, 0.14)',
        innerCardBg: 'rgba(255, 255, 255, 0.06)',
        shadow: 'rgba(0, 0, 0, 0.32)',
      };
  }
}

const easeOutCubic = (t: number) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
const easeOutBack = (t: number) => {
  const c = clamp(t, 0, 1) - 1;
  return 1 + 2.5 * c * c * c + 1.5 * c * c;
};
const progressWindow = (time: number, start: number, span: number) =>
  span <= 0 ? 1 : easeOutCubic((time - start) / span);

function safeStroke(ctx: CanvasRenderingContext2D) {
  if (typeof ctx.stroke === 'function') ctx.stroke();
}

function safeClosePath(ctx: CanvasRenderingContext2D) {
  if (typeof ctx.closePath === 'function') ctx.closePath();
}

function safeCircle(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, start = 0, end = Math.PI * 2) {
  if (typeof ctx.arc === 'function') {
    ctx.arc(cx, cy, r, start, end);
  } else {
    ctx.roundRect(cx - r, cy - r, r * 2, r * 2, r);
  }
}

function drawRoundedCard(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
  palette: ThemePalette
) {
  ctx.save();
  ctx.shadowColor = palette.shadow;
  ctx.shadowBlur = Math.max(8, Math.round(h * 0.14));
  ctx.shadowOffsetY = Math.max(2, Math.round(h * 0.04));
  ctx.fillStyle = palette.bg;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.strokeStyle = palette.border;
  ctx.lineWidth = Math.max(1, Math.min(2, h * 0.012));
  safeStroke(ctx);
  ctx.restore();
}

function drawVectorIcon(
  ctx: CanvasRenderingContext2D,
  icon: GraphicIcon,
  cx: number,
  cy: number,
  size: number,
  fg: string,
  badgeBg?: string
) {
  if (!icon || icon === 'none') return;
  ctx.save();
  if (badgeBg) {
    ctx.fillStyle = badgeBg;
    ctx.beginPath();
    safeCircle(ctx, cx, cy, size * 0.56);
    ctx.fill();
  }
  const r = size * 0.3;
  ctx.strokeStyle = fg;
  ctx.fillStyle = fg;
  ctx.lineWidth = Math.max(1.8, size * 0.085);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();

  switch (icon) {
    case 'check':
      ctx.moveTo(cx - r * 0.72, cy + r * 0.05);
      ctx.lineTo(cx - r * 0.18, cy + r * 0.6);
      ctx.lineTo(cx + r * 0.78, cy - r * 0.52);
      safeStroke(ctx);
      break;
    case 'chart':
      ctx.moveTo(cx - r * 0.85, cy + r * 0.55);
      ctx.lineTo(cx - r * 0.25, cy - r * 0.05);
      ctx.lineTo(cx + r * 0.18, cy + r * 0.25);
      ctx.lineTo(cx + r * 0.82, cy - r * 0.55);
      safeStroke(ctx);
      ctx.beginPath();
      ctx.moveTo(cx + r * 0.38, cy - r * 0.55);
      ctx.lineTo(cx + r * 0.82, cy - r * 0.55);
      ctx.lineTo(cx + r * 0.82, cy - r * 0.1);
      safeStroke(ctx);
      break;
    case 'rocket':
      ctx.moveTo(cx - r * 0.65, cy + r * 0.65);
      ctx.lineTo(cx + r * 0.68, cy - r * 0.68);
      safeStroke(ctx);
      ctx.beginPath();
      ctx.moveTo(cx + r * 0.15, cy - r * 0.68);
      ctx.lineTo(cx + r * 0.68, cy - r * 0.68);
      ctx.lineTo(cx + r * 0.68, cy - r * 0.15);
      safeStroke(ctx);
      break;
    case 'bolt':
      ctx.moveTo(cx + r * 0.18, cy - r * 0.85);
      ctx.lineTo(cx - r * 0.55, cy + r * 0.08);
      ctx.lineTo(cx + r * 0.05, cy + r * 0.08);
      ctx.lineTo(cx - r * 0.18, cy + r * 0.85);
      ctx.lineTo(cx + r * 0.58, cy - r * 0.08);
      ctx.lineTo(cx - r * 0.05, cy - r * 0.08);
      safeClosePath(ctx);
      ctx.fill();
      break;
    case 'warning':
      ctx.moveTo(cx, cy - r * 0.82);
      ctx.lineTo(cx + r * 0.85, cy + r * 0.7);
      ctx.lineTo(cx - r * 0.85, cy + r * 0.7);
      safeClosePath(ctx);
      safeStroke(ctx);
      ctx.beginPath();
      ctx.moveTo(cx, cy - r * 0.25);
      ctx.lineTo(cx, cy + r * 0.25);
      safeStroke(ctx);
      break;
    case 'clock':
      safeCircle(ctx, cx, cy, r * 0.82);
      safeStroke(ctx);
      ctx.beginPath();
      ctx.moveTo(cx, cy - r * 0.45);
      ctx.lineTo(cx, cy);
      ctx.lineTo(cx + r * 0.4, cy + r * 0.2);
      safeStroke(ctx);
      break;
    case 'target':
      safeCircle(ctx, cx, cy, r * 0.85);
      safeStroke(ctx);
      ctx.beginPath();
      safeCircle(ctx, cx, cy, r * 0.42);
      safeStroke(ctx);
      break;
    case 'user':
      safeCircle(ctx, cx, cy - r * 0.28, r * 0.36);
      safeStroke(ctx);
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.65, cy + r * 0.72);
      ctx.lineTo(cx - r * 0.35, cy + r * 0.28);
      ctx.lineTo(cx + r * 0.35, cy + r * 0.28);
      ctx.lineTo(cx + r * 0.65, cy + r * 0.72);
      safeStroke(ctx);
      break;
    case 'star':
    case 'sparkles':
      for (let i = 0; i < 8; i++) {
        const angle = (i * Math.PI) / 4;
        const rad = i % 2 === 0 ? r * 0.85 : r * 0.36;
        const px = cx + Math.cos(angle) * rad;
        const py = cy + Math.sin(angle) * rad;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      safeClosePath(ctx);
      ctx.fill();
      break;
    case 'dollar':
    case 'rupee':
    case 'flame':
    default: {
      const glyph = icon === 'dollar' ? '$' : icon === 'rupee' ? '₹' : '✦';
      ctx.font = `800 ${Math.round(size * 0.55)}px Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(glyph, cx, cy + 1);
      break;
    }
  }
  ctx.restore();
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (!text || ctx.measureText(text).width <= maxWidth) return text;
  let out = text;
  while (out.length > 3 && ctx.measureText(out + '…').width > maxWidth) {
    out = out.slice(0, -1);
  }
  return out.trimEnd() + '…';
}

function parseNumericFromText(text: string): { value: number; prefix: string; suffix: string; label: string } {
  const match = text.match(/([+$₹€£-]?)(\d+(?:\.\d+)?)([%xXkKmMbB+]*)/);
  if (!match) return { value: 100, prefix: '', suffix: '', label: text };
  const num = Number.parseFloat(match[2]);
  const remainder = text.replace(match[0], '').trim();
  return {
    value: Number.isFinite(num) ? num : 100,
    prefix: match[1] || '',
    suffix: match[3] || '',
    label: remainder || text,
  };
}

function formatAnimatedNumber(target: number, progress: number): string {
  const current = target * progress;
  const hasDecimals = Math.abs(target % 1) > 1e-4;
  if (hasDecimals) return current.toFixed(1);
  return Math.round(current).toLocaleString('en-US');
}

function shouldUseRichRenderer(g: MotionGraphic): boolean {
  return (
    isRichKind(g.kind) ||
    g.theme !== undefined ||
    g.subtitle !== undefined ||
    (g.icon !== undefined && g.icon !== 'none') ||
    g.value !== undefined ||
    (g.items !== undefined && g.items.length > 0) ||
    (g.bars !== undefined && g.bars.length > 0) ||
    g.comparison !== undefined
  );
}

/** Original code-drawn Canvas2D vector graphics; zero external images or DOM dependencies. */
export function drawGraphicPanel(
  ctx: CanvasRenderingContext2D,
  g: MotionGraphic,
  width: number,
  height: number,
  time: number,
  context: GraphicDrawContext = {}
): GraphicDrawResult {
  if (!shouldUseRichRenderer(g)) {
    const pad = Math.max(12, height * 0.16),
      x = -width / 2 - pad,
      y = -height / 2 - pad,
      w = width + pad * 2,
      h = height + pad * 2;
    ctx.save();
    ctx.fillStyle = g.panel;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, Math.min(20, h * 0.16));
    ctx.fill();
    ctx.fillStyle = g.accent;
    if (g.kind === 'lower-third') {
      const wipe = progressWindow(time, 0, 0.35);
      ctx.fillRect(x, y, Math.max(5, pad * 0.3), h * wipe);
      ctx.fillRect(x, y + h - 3, w * wipe, 3);
    } else if (g.kind === 'stat') {
      ctx.fillRect(x + pad, y + h - 6, Math.max(2, (w - pad * 2) * progressWindow(time, 0, 0.7)), 5);
    } else if (g.kind === 'callout') {
      ctx.beginPath();
      ctx.moveTo(x + w * 0.15, y + h);
      ctx.lineTo(x + w * 0.15 + pad, y + h + pad);
      ctx.lineTo(x + w * 0.15 + pad * 1.6, y + h);
      ctx.fill();
    } else {
      ctx.fillRect(x + pad, y + 5, Math.min(w - pad * 2, 48) * progressWindow(time, 0, 0.35), 4);
    }
    ctx.restore();
    return { width: w, height: h, handlesText: false };
  }

  const minDim = Math.max(280, Math.min(context.frameWidth || 1080, context.frameHeight || 1920));
  const titleText = (context.title || '').trim();
  const palette = paletteFor(g);
  const family = context.font || 'Inter, system-ui, sans-serif';
  const radius = Math.round(minDim * 0.022);

  ctx.save();

  switch (g.kind) {
    case 'stat':
    case 'stat-counter': {
      const parsed = parseNumericFromText(titleText);
      const target = g.value ?? parsed.value;
      const prefix = g.prefix ?? parsed.prefix;
      const suffix = g.suffix ?? parsed.suffix;
      const label = g.subtitle || (g.value !== undefined ? titleText : parsed.label);
      const cardW = Math.round(minDim * 0.56);
      const cardH = Math.round(minDim * 0.175);
      const pad = Math.round(minDim * 0.024);
      drawRoundedCard(ctx, -cardW / 2, -cardH / 2, cardW, cardH, radius, palette);

      const iconSize = g.icon && g.icon !== 'none' ? Math.round(minDim * 0.056) : 0;
      const iconPop = easeOutBack(progressWindow(time, 0.04, 0.25));
      if (iconSize) {
        ctx.save();
        const ix = -cardW / 2 + pad + iconSize * 0.5;
        const iy = -cardH / 2 + pad + iconSize * 0.5;
        ctx.translate(ix, iy);
        ctx.scale(iconPop, iconPop);
        drawVectorIcon(ctx, g.icon!, 0, 0, iconSize, '#ffffff', g.accent);
        ctx.restore();
      }

      const countProg = progressWindow(time, 0.08, 0.72);
      const numStr = `${prefix}${formatAnimatedNumber(target, countProg)}${suffix}`;
      const numLeft = -cardW / 2 + pad + (iconSize ? iconSize + pad * 0.7 : 0);
      ctx.fillStyle = palette.title;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.font = `800 ${Math.round(minDim * 0.058)}px ${family}`;
      ctx.fillText(fitText(ctx, numStr, cardW - pad * 2 - (iconSize ? iconSize + pad : 0)), numLeft, -cardH * 0.14);

      if (label) {
        ctx.globalAlpha = progressWindow(time, 0.16, 0.35);
        ctx.fillStyle = palette.muted;
        ctx.font = `600 ${Math.round(minDim * 0.025)}px ${family}`;
        ctx.fillText(fitText(ctx, label, cardW - pad * 2), -cardW / 2 + pad, cardH * 0.20);
        ctx.globalAlpha = 1;
      }

      const barY = cardH / 2 - Math.round(minDim * 0.014);
      const barW = cardW - pad * 2;
      ctx.fillStyle = palette.trackBg;
      ctx.beginPath();
      ctx.roundRect(-cardW / 2 + pad, barY, barW, 5, 3);
      ctx.fill();
      ctx.fillStyle = g.accent;
      ctx.beginPath();
      ctx.roundRect(-cardW / 2 + pad, barY, Math.max(4, barW * progressWindow(time, 0.1, 0.75)), 5, 3);
      ctx.fill();

      ctx.restore();
      return { width: cardW, height: cardH, handlesText: true };
    }

    case 'progress-ring': {
      const parsed = parseNumericFromText(titleText);
      const pct = clamp(g.value ?? parsed.value, 0, 100);
      const cardW = Math.round(minDim * 0.62);
      const cardH = Math.round(minDim * 0.175);
      const pad = Math.round(minDim * 0.024);
      drawRoundedCard(ctx, -cardW / 2, -cardH / 2, cardW, cardH, radius, palette);

      const ringR = Math.round(cardH * 0.33);
      const cx = -cardW / 2 + pad + ringR + 4;
      const cy = 0;
      const prog = progressWindow(time, 0.08, 0.78);
      const currentPct = pct * prog;

      ctx.save();
      ctx.lineWidth = Math.max(4, Math.round(minDim * 0.011));
      ctx.lineCap = 'round';
      ctx.strokeStyle = palette.trackBg;
      ctx.beginPath();
      safeCircle(ctx, cx, cy, ringR);
      safeStroke(ctx);

      ctx.strokeStyle = g.accent;
      ctx.beginPath();
      safeCircle(ctx, cx, cy, ringR, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * currentPct) / 100);
      safeStroke(ctx);
      ctx.restore();

      ctx.fillStyle = palette.title;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `800 ${Math.round(minDim * 0.032)}px ${family}`;
      ctx.fillText(`${Math.round(currentPct)}${g.suffix || '%'}`, cx, cy);

      const textX = cx + ringR + pad;
      const maxTextW = cardW / 2 - textX - pad;
      ctx.textAlign = 'left';
      ctx.globalAlpha = progressWindow(time, 0.12, 0.32);
      ctx.font = `700 ${Math.round(minDim * 0.030)}px ${family}`;
      ctx.fillText(fitText(ctx, titleText, maxTextW), textX, g.subtitle ? -cardH * 0.12 : 0);
      if (g.subtitle) {
        ctx.fillStyle = palette.muted;
        ctx.font = `500 ${Math.round(minDim * 0.022)}px ${family}`;
        ctx.fillText(fitText(ctx, g.subtitle, maxTextW), textX, cardH * 0.14);
      }
      ctx.restore();
      return { width: cardW, height: cardH, handlesText: true };
    }

    case 'bar-chart': {
      const bars: GraphicBar[] =
        g.bars && g.bars.length > 0
          ? g.bars.slice(0, 4)
          : [
              { label: 'Before', value: 32, displayValue: '32%' },
              { label: 'After', value: 88, displayValue: '88%' },
            ];
      const maxVal = Math.max(1, ...bars.map((b) => b.value));
      const pad = Math.round(minDim * 0.024);
      const rowH = Math.round(minDim * 0.056);
      const headerH = Math.round(minDim * 0.048);
      const cardW = Math.round(minDim * 0.64);
      const cardH = headerH + bars.length * rowH + pad * 1.4;
      drawRoundedCard(ctx, -cardW / 2, -cardH / 2, cardW, cardH, radius, palette);

      ctx.fillStyle = palette.title;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.font = `700 ${Math.round(minDim * 0.028)}px ${family}`;
      ctx.fillText(fitText(ctx, titleText, cardW - pad * 2), -cardW / 2 + pad, -cardH / 2 + pad + headerH * 0.35);

      const labelW = cardW * 0.28;
      const valW = cardW * 0.16;
      const trackX = -cardW / 2 + pad + labelW + 8;
      const trackW = cardW - pad * 2 - labelW - valW - 16;

      bars.forEach((bar, idx) => {
        const yCenter = -cardH / 2 + pad + headerH + idx * rowH + rowH * 0.42;
        const rowProg = progressWindow(time, 0.10 + idx * 0.14, 0.52);
        ctx.save();
        ctx.globalAlpha = clamp(rowProg * 1.25, 0, 1);
        ctx.fillStyle = palette.muted;
        ctx.font = `600 ${Math.round(minDim * 0.022)}px ${family}`;
        ctx.textAlign = 'left';
        ctx.fillText(fitText(ctx, bar.label, labelW), -cardW / 2 + pad, yCenter);

        const barH = Math.max(10, Math.round(minDim * 0.022));
        ctx.fillStyle = palette.trackBg;
        ctx.beginPath();
        ctx.roundRect(trackX, yCenter - barH / 2, trackW, barH, barH / 2);
        ctx.fill();

        const fillRatio = clamp(bar.value / maxVal, 0.05, 1) * rowProg;
        ctx.fillStyle = bar.color || g.accent;
        ctx.beginPath();
        ctx.roundRect(trackX, yCenter - barH / 2, Math.max(barH, trackW * fillRatio), barH, barH / 2);
        ctx.fill();

        ctx.fillStyle = palette.title;
        ctx.textAlign = 'right';
        ctx.font = `700 ${Math.round(minDim * 0.022)}px ${family}`;
        const valText = bar.displayValue || String(Math.round(bar.value * rowProg));
        ctx.fillText(fitText(ctx, valText, valW), cardW / 2 - pad, yCenter);
        ctx.restore();
      });

      ctx.restore();
      return { width: cardW, height: cardH, handlesText: true };
    }

    case 'comparison': {
      const cmp = g.comparison ?? {
        leftTitle: 'Before',
        leftValue: 'Manual',
        rightTitle: 'After',
        rightValue: titleText,
      };
      const cardW = Math.round(minDim * 0.66);
      const cardH = Math.round(minDim * 0.20);
      const pad = Math.round(minDim * 0.022);
      drawRoundedCard(ctx, -cardW / 2, -cardH / 2, cardW, cardH, radius, palette);

      const hasTopTitle = Boolean(titleText && g.comparison);
      const topOffset = hasTopTitle ? Math.round(minDim * 0.038) : 0;
      if (hasTopTitle) {
        ctx.fillStyle = palette.muted;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `700 ${Math.round(minDim * 0.023)}px ${family}`;
        ctx.fillText(fitText(ctx, titleText, cardW - pad * 2), 0, -cardH / 2 + pad + topOffset * 0.35);
      }

      const gap = Math.round(minDim * 0.022);
      const boxW = (cardW - pad * 2 - gap) / 2;
      const boxY = -cardH / 2 + pad + topOffset;
      const boxH = cardH - pad * 2 - topOffset;

      const leftProg = progressWindow(time, 0.05, 0.35);
      ctx.save();
      ctx.globalAlpha = leftProg;
      ctx.fillStyle = palette.innerCardBg;
      ctx.beginPath();
      ctx.roundRect(-cardW / 2 + pad, boxY, boxW, boxH, Math.round(radius * 0.7));
      ctx.fill();
      ctx.fillStyle = palette.muted;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `700 ${Math.round(minDim * 0.021)}px ${family}`;
      ctx.fillText(fitText(ctx, cmp.leftTitle.toUpperCase(), boxW - 16), -cardW / 2 + pad + boxW / 2, boxY + boxH * 0.32);
      ctx.fillStyle = palette.title;
      ctx.font = `700 ${Math.round(minDim * 0.028)}px ${family}`;
      ctx.fillText(fitText(ctx, cmp.leftValue, boxW - 16), -cardW / 2 + pad + boxW / 2, boxY + boxH * 0.68);
      ctx.restore();

      const rightProg = progressWindow(time, 0.22, 0.38);
      ctx.save();
      ctx.globalAlpha = rightProg;
      ctx.fillStyle = g.accent;
      ctx.beginPath();
      ctx.roundRect(gap / 2, boxY, boxW, boxH, Math.round(radius * 0.7));
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `700 ${Math.round(minDim * 0.021)}px ${family}`;
      ctx.fillText(fitText(ctx, cmp.rightTitle.toUpperCase(), boxW - 16), gap / 2 + boxW / 2, boxY + boxH * 0.32);
      ctx.fillStyle = '#ffffff';
      ctx.font = `800 ${Math.round(minDim * 0.029)}px ${family}`;
      ctx.fillText(fitText(ctx, cmp.rightValue, boxW - 16), gap / 2 + boxW / 2, boxY + boxH * 0.68);
      ctx.restore();

      const vsScale = easeOutBack(progressWindow(time, 0.18, 0.28));
      const vsR = Math.round(minDim * 0.022);
      ctx.save();
      ctx.translate(0, boxY + boxH / 2);
      ctx.scale(vsScale, vsScale);
      ctx.fillStyle = palette.bg;
      ctx.strokeStyle = palette.border;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      safeCircle(ctx, 0, 0, vsR);
      ctx.fill();
      safeStroke(ctx);
      ctx.fillStyle = palette.title;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `800 ${Math.round(minDim * 0.017)}px ${family}`;
      ctx.fillText('VS', 0, 1);
      ctx.restore();

      ctx.restore();
      return { width: cardW, height: cardH, handlesText: true };
    }

    case 'checklist': {
      const items =
        g.items && g.items.length > 0
          ? g.items.slice(0, 5)
          : titleText
              .split(/[,;\n]/)
              .map((s) => s.trim())
              .filter(Boolean)
              .slice(0, 5);
      const list = items.length ? items : [titleText];
      const pad = Math.round(minDim * 0.024);
      const headerH = g.items?.length ? Math.round(minDim * 0.044) : 0;
      const rowH = Math.round(minDim * 0.052);
      const cardW = Math.round(minDim * 0.60);
      const cardH = pad * 1.5 + headerH + list.length * rowH;
      drawRoundedCard(ctx, -cardW / 2, -cardH / 2, cardW, cardH, radius, palette);

      if (headerH > 0) {
        ctx.fillStyle = palette.title;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.font = `700 ${Math.round(minDim * 0.028)}px ${family}`;
        ctx.fillText(fitText(ctx, titleText, cardW - pad * 2), -cardW / 2 + pad, -cardH / 2 + pad + headerH * 0.35);
      }

      const iconR = Math.round(minDim * 0.018);
      list.forEach((item, idx) => {
        const yCenter = -cardH / 2 + pad + headerH + idx * rowH + rowH * 0.44;
        const pRow = progressWindow(time, 0.08 + idx * 0.18, 0.32);
        const shiftX = (1 - pRow) * 18;
        ctx.save();
        ctx.globalAlpha = pRow;
        ctx.translate(shiftX, 0);
        const ix = -cardW / 2 + pad + iconR;
        drawVectorIcon(ctx, 'check', ix, yCenter, iconR * 1.7, '#ffffff', g.accent);
        ctx.fillStyle = palette.title;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.font = `600 ${Math.round(minDim * 0.025)}px ${family}`;
        ctx.fillText(fitText(ctx, item, cardW - pad * 2 - iconR * 2.8), ix + iconR * 1.9, yCenter);
        ctx.restore();
      });

      ctx.restore();
      return { width: cardW, height: cardH, handlesText: true };
    }

    case 'step-flow': {
      const steps =
        g.items && g.items.length > 0
          ? g.items.slice(0, 4)
          : ['Plan', 'Build', 'Launch'];
      const cardW = Math.round(minDim * 0.68);
      const cardH = Math.round(minDim * 0.175);
      const pad = Math.round(minDim * 0.024);
      drawRoundedCard(ctx, -cardW / 2, -cardH / 2, cardW, cardH, radius, palette);

      ctx.fillStyle = palette.muted;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.font = `700 ${Math.round(minDim * 0.022)}px ${family}`;
      ctx.fillText(fitText(ctx, titleText.toUpperCase(), cardW - pad * 2), -cardW / 2 + pad, -cardH / 2 + pad + 8);

      const nodeY = 4;
      const spanW = cardW - pad * 2 - Math.round(minDim * 0.12);
      const startX = -spanW / 2;
      const lineProg = progressWindow(time, 0.12, 0.8);
      if (steps.length > 1) {
        ctx.fillStyle = palette.trackBg;
        ctx.fillRect(startX, nodeY - 2, spanW, 4);
        ctx.fillStyle = g.accent;
        ctx.fillRect(startX, nodeY - 2, spanW * lineProg, 4);
      }

      const nodeR = Math.round(minDim * 0.024);
      steps.forEach((step, idx) => {
        const frac = steps.length === 1 ? 0.5 : idx / (steps.length - 1);
        const nx = startX + spanW * frac;
        const active = progressWindow(time, 0.12 + idx * 0.22, 0.28);
        ctx.save();
        ctx.fillStyle = active > 0.25 ? g.accent : palette.trackBg;
        ctx.beginPath();
        safeCircle(ctx, nx, nodeY, nodeR);
        ctx.fill();

        ctx.fillStyle = active > 0.25 ? '#ffffff' : palette.muted;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `800 ${Math.round(minDim * 0.022)}px ${family}`;
        ctx.fillText(String(idx + 1), nx, nodeY + 1);

        ctx.globalAlpha = active;
        ctx.fillStyle = palette.title;
        ctx.font = `600 ${Math.round(minDim * 0.021)}px ${family}`;
        ctx.fillText(fitText(ctx, step, spanW / steps.length + 24), nx, nodeY + nodeR + Math.round(minDim * 0.026));
        ctx.restore();
      });

      ctx.restore();
      return { width: cardW, height: cardH, handlesText: true };
    }

    case 'notification': {
      const cardW = Math.round(minDim * 0.68);
      const cardH = Math.round(minDim * 0.145);
      const pad = Math.round(minDim * 0.02);
      drawRoundedCard(ctx, -cardW / 2, -cardH / 2, cardW, cardH, radius, palette);

      const badgeSize = Math.round(cardH * 0.58);
      const bx = -cardW / 2 + pad + badgeSize / 2;
      ctx.fillStyle = g.accent;
      ctx.beginPath();
      ctx.roundRect(-cardW / 2 + pad, -badgeSize / 2, badgeSize, badgeSize, Math.round(badgeSize * 0.26));
      ctx.fill();
      drawVectorIcon(ctx, g.icon && g.icon !== 'none' ? g.icon : 'bolt', bx, 0, badgeSize * 0.82, '#ffffff');

      const tx = -cardW / 2 + pad + badgeSize + Math.round(pad * 0.8);
      const textMaxW = cardW / 2 - tx - pad - 44;
      ctx.fillStyle = palette.title;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.font = `700 ${Math.round(minDim * 0.027)}px ${family}`;
      ctx.fillText(fitText(ctx, titleText, textMaxW), tx, g.subtitle ? -cardH * 0.15 : 0);

      ctx.fillStyle = palette.muted;
      ctx.textAlign = 'right';
      ctx.font = `500 ${Math.round(minDim * 0.019)}px ${family}`;
      ctx.fillText('now', cardW / 2 - pad, -cardH * 0.15);

      if (g.subtitle) {
        ctx.textAlign = 'left';
        ctx.font = `500 ${Math.round(minDim * 0.022)}px ${family}`;
        ctx.fillText(fitText(ctx, g.subtitle, cardW / 2 - tx - pad), tx, cardH * 0.16);
      }

      ctx.restore();
      return { width: cardW, height: cardH, handlesText: true };
    }

    case 'pointer-callout': {
      const padX = Math.round(minDim * 0.026);
      const padY = Math.round(minDim * 0.018);
      ctx.font = `700 ${Math.round(minDim * 0.028)}px ${family}`;
      const textW = Math.min(minDim * 0.48, ctx.measureText(titleText).width);
      const iconW = g.icon && g.icon !== 'none' ? Math.round(minDim * 0.036) : 0;
      const cardW = Math.round(textW + padX * 2 + (iconW ? iconW + 10 : 0));
      const cardH = Math.round(minDim * (g.subtitle ? 0.115 : 0.082));

      const frameW = context.frameWidth || 1080;
      const frameH = context.frameHeight || 1920;
      const dx = clamp((g.targetX ?? 0) * frameW * 0.35, -minDim * 0.25, minDim * 0.25);
      const dy = clamp((g.targetY ?? 0.25) * frameH * 0.18, minDim * 0.07, minDim * 0.22);
      const lineProg = progressWindow(time, 0.05, 0.35);

      ctx.save();
      ctx.strokeStyle = g.accent;
      ctx.lineWidth = Math.max(2.5, Math.round(minDim * 0.004));
      ctx.beginPath();
      ctx.moveTo(0, cardH / 2);
      ctx.lineTo(dx * lineProg, cardH / 2 + (dy - cardH / 2) * lineProg);
      safeStroke(ctx);

      const dotR = Math.round(minDim * 0.011);
      ctx.fillStyle = g.accent;
      ctx.beginPath();
      safeCircle(ctx, dx * lineProg, cardH / 2 + (dy - cardH / 2) * lineProg, dotR);
      ctx.fill();
      ctx.restore();

      drawRoundedCard(ctx, -cardW / 2, -cardH / 2, cardW, cardH, Math.round(cardH * 0.34), palette);
      if (iconW) {
        drawVectorIcon(
          ctx,
          g.icon!,
          -cardW / 2 + padX + iconW * 0.45,
          0,
          iconW,
          '#ffffff',
          g.accent
        );
      }
      const tx = -cardW / 2 + padX + (iconW ? iconW + 10 : 0);
      ctx.fillStyle = palette.title;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.font = `700 ${Math.round(minDim * 0.028)}px ${family}`;
      ctx.fillText(fitText(ctx, titleText, cardW - padX * 2), tx, g.subtitle ? -cardH * 0.14 : 0);
      if (g.subtitle) {
        ctx.fillStyle = palette.muted;
        ctx.font = `500 ${Math.round(minDim * 0.020)}px ${family}`;
        ctx.fillText(fitText(ctx, g.subtitle, cardW - padX * 2), tx, cardH * 0.18);
      }
      ctx.restore();
      return { width: cardW, height: cardH, handlesText: true };
    }

    case 'quote-card': {
      const cardW = Math.round(minDim * 0.68);
      const cardH = Math.round(minDim * 0.18);
      const pad = Math.round(minDim * 0.026);
      drawRoundedCard(ctx, -cardW / 2, -cardH / 2, cardW, cardH, radius, palette);

      ctx.fillStyle = g.accent;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.font = `900 ${Math.round(minDim * 0.068)}px Georgia, serif`;
      ctx.fillText('“', -cardW / 2 + pad, -cardH / 2 + pad + 18);

      ctx.fillStyle = palette.title;
      ctx.font = `700 ${Math.round(minDim * 0.030)}px ${family}`;
      ctx.fillText(fitText(ctx, titleText, cardW - pad * 2 - 28), -cardW / 2 + pad + 28, g.subtitle ? -4 : 4);

      if (g.subtitle) {
        ctx.fillStyle = palette.muted;
        ctx.font = `600 ${Math.round(minDim * 0.021)}px ${family}`;
        ctx.fillText(fitText(ctx, `— ${g.subtitle}`, cardW - pad * 2 - 28), -cardW / 2 + pad + 28, cardH * 0.25);
      }
      ctx.restore();
      return { width: cardW, height: cardH, handlesText: true };
    }

    case 'kinetic-badge': {
      const padX = Math.round(minDim * 0.024);
      ctx.font = `800 ${Math.round(minDim * 0.032)}px ${family}`;
      const labelW = Math.min(minDim * 0.46, ctx.measureText(titleText.toUpperCase()).width);
      const hasIcon = Boolean(g.icon && g.icon !== 'none');
      const iconSize = hasIcon ? Math.round(minDim * 0.044) : 0;
      const cardW = Math.round(labelW + padX * 2 + (iconSize ? iconSize + 12 : 0));
      const cardH = Math.round(minDim * 0.092);
      drawRoundedCard(ctx, -cardW / 2, -cardH / 2, cardW, cardH, Math.round(cardH / 2), palette);

      if (hasIcon) {
        const iconPop = easeOutBack(progressWindow(time, 0.03, 0.25));
        ctx.save();
        ctx.translate(-cardW / 2 + padX + iconSize * 0.45, 0);
        ctx.scale(iconPop, iconPop);
        drawVectorIcon(ctx, g.icon!, 0, 0, iconSize, '#ffffff', g.accent);
        ctx.restore();
      }
      ctx.fillStyle = palette.title;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.font = `800 ${Math.round(minDim * 0.032)}px ${family}`;
      ctx.fillText(
        fitText(ctx, titleText.toUpperCase(), cardW - padX * 2 - (iconSize ? iconSize + 12 : 0)),
        -cardW / 2 + padX + (iconSize ? iconSize + 12 : 0),
        1
      );
      ctx.restore();
      return { width: cardW, height: cardH, handlesText: true };
    }

    case 'lower-third': {
      const cardW = Math.round(minDim * 0.62);
      const cardH = Math.round(minDim * (g.subtitle ? 0.135 : 0.105));
      const pad = Math.round(minDim * 0.022);
      drawRoundedCard(ctx, -cardW / 2, -cardH / 2, cardW, cardH, Math.round(radius * 0.8), palette);

      const wipe = progressWindow(time, 0, 0.35);
      ctx.fillStyle = g.accent;
      ctx.beginPath();
      ctx.roundRect(-cardW / 2 + 8, -cardH / 2 + 12, 6, Math.max(8, (cardH - 24) * wipe), 3);
      ctx.fill();

      const hasIcon = Boolean(g.icon && g.icon !== 'none');
      const iconSize = hasIcon ? Math.round(cardH * 0.56) : 0;
      if (hasIcon) {
        drawVectorIcon(ctx, g.icon!, -cardW / 2 + pad + 14 + iconSize * 0.4, 0, iconSize, '#ffffff', g.accent);
      }

      const tx = -cardW / 2 + pad + 16 + (iconSize ? iconSize + 10 : 0);
      const maxW = cardW / 2 - tx - pad;
      ctx.globalAlpha = progressWindow(time, 0.08, 0.3);
      ctx.fillStyle = palette.title;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.font = `700 ${Math.round(minDim * 0.031)}px ${family}`;
      ctx.fillText(fitText(ctx, titleText, maxW), tx, g.subtitle ? -cardH * 0.15 : 0);
      if (g.subtitle) {
        ctx.fillStyle = palette.muted;
        ctx.font = `500 ${Math.round(minDim * 0.022)}px ${family}`;
        ctx.fillText(fitText(ctx, g.subtitle, maxW), tx, cardH * 0.17);
      }
      ctx.restore();
      return { width: cardW, height: cardH, handlesText: true };
    }

    case 'label':
    case 'callout':
    default: {
      const padX = Math.round(minDim * 0.026);
      ctx.font = `700 ${Math.round(minDim * 0.031)}px ${family}`;
      const textW = Math.min(minDim * 0.54, ctx.measureText(titleText).width);
      const hasIcon = Boolean(g.icon && g.icon !== 'none');
      const iconSize = hasIcon ? Math.round(minDim * 0.042) : 0;
      const cardW = Math.round(textW + padX * 2 + (iconSize ? iconSize + 10 : 0));
      const cardH = Math.round(minDim * (g.subtitle ? 0.12 : 0.092));
      drawRoundedCard(ctx, -cardW / 2, -cardH / 2, cardW, cardH, radius, palette);

      ctx.fillStyle = g.accent;
      ctx.fillRect(-cardW / 2 + padX, -cardH / 2 + 5, Math.min(cardW - padX * 2, 48) * progressWindow(time, 0, 0.35), 4);

      if (hasIcon) {
        drawVectorIcon(ctx, g.icon!, -cardW / 2 + padX + iconSize * 0.42, 2, iconSize, '#ffffff', g.accent);
      }
      const tx = -cardW / 2 + padX + (iconSize ? iconSize + 10 : 0);
      ctx.fillStyle = palette.title;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.font = `700 ${Math.round(minDim * 0.030)}px ${family}`;
      ctx.fillText(fitText(ctx, titleText, cardW - padX * 2 - (iconSize ? iconSize + 10 : 0)), tx, g.subtitle ? -cardH * 0.14 : 2);
      if (g.subtitle) {
        ctx.fillStyle = palette.muted;
        ctx.font = `500 ${Math.round(minDim * 0.021)}px ${family}`;
        ctx.fillText(fitText(ctx, g.subtitle, cardW - padX * 2 - (iconSize ? iconSize + 10 : 0)), tx, cardH * 0.18);
      }
      ctx.restore();
      return { width: cardW, height: cardH, handlesText: true };
    }
  }
}
