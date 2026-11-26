import { addText, addClip, addTrack, changeText } from './operations';
import { MAX_VIDEO_SECONDS } from './limits';
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
  'line-chart',
  'timeline-steps',
  'social-follow',
  'chapter-card',
  'kpi-grid',
  'poll-card',
  'offer-tag',
  'custom',
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

export const CUSTOM_ELEMENT_TYPES = [
  'rect',
  'pill',
  'circle',
  'ring',
  'line',
  'arrow',
  'bar',
  'sparkline',
  'text',
  'counter',
  'icon',
] as const;
export type CustomElementType = (typeof CUSTOM_ELEMENT_TYPES)[number];

export const CUSTOM_ENTRANCES = ['fade', 'slide-up', 'slide-left', 'pop', 'draw', 'count-up'] as const;
export type CustomEntrance = (typeof CUSTOM_ENTRANCES)[number];

export interface CustomGraphicElement {
  type: CustomElementType;
  x: number;
  y: number;
  w?: number;
  h?: number;
  r?: number;
  text?: string;
  value?: number;
  prefix?: string;
  suffix?: string;
  color?: string;
  strokeWidth?: number;
  fontSize?: number;
  fontWeight?: number;
  align?: 'left' | 'center' | 'right';
  icon?: GraphicIcon;
  points?: Array<{ x: number; y: number }>;
  progress?: number;
  delay?: number;
  duration?: number;
  entrance?: CustomEntrance;
}

export interface CustomGraphicSpec {
  widthRatio?: number;
  heightRatio?: number;
  cornerRadius?: number;
  showCard?: boolean;
  elements: CustomGraphicElement[];
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
  customSpec?: CustomGraphicSpec;
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
  customSpec?: CustomGraphicSpec;
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

export function readCustomSpec(value: unknown): CustomGraphicSpec {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw Error('Invalid custom motion graphic spec.');
  }
  const s = value as CustomGraphicSpec;
  if (!Array.isArray(s.elements) || s.elements.length === 0 || s.elements.length > 20) {
    throw Error('Custom motion graphic needs 1 to 20 elements.');
  }
  const out: CustomGraphicSpec = {
    elements: s.elements.map((raw) => {
      if (!raw || typeof raw !== 'object' || !CUSTOM_ELEMENT_TYPES.includes(raw.type)) {
        throw Error('Invalid custom graphic element type.');
      }
      if (typeof raw.x !== 'number' || !Number.isFinite(raw.x) || raw.x < -0.6 || raw.x > 0.6) {
        throw Error('Invalid custom element x coordinate.');
      }
      if (typeof raw.y !== 'number' || !Number.isFinite(raw.y) || raw.y < -0.6 || raw.y > 0.6) {
        throw Error('Invalid custom element y coordinate.');
      }
      const el: CustomGraphicElement = { type: raw.type, x: raw.x, y: raw.y };
      if (raw.w !== undefined) {
        if (typeof raw.w !== 'number' || !Number.isFinite(raw.w) || raw.w < 0.01 || raw.w > 1) throw Error('Invalid element width.');
        el.w = raw.w;
      }
      if (raw.h !== undefined) {
        if (typeof raw.h !== 'number' || !Number.isFinite(raw.h) || raw.h < 0.005 || raw.h > 1) throw Error('Invalid element height.');
        el.h = raw.h;
      }
      if (raw.r !== undefined) {
        if (typeof raw.r !== 'number' || !Number.isFinite(raw.r) || raw.r < 0.01 || raw.r > 0.5) throw Error('Invalid element radius.');
        el.r = raw.r;
      }
      const text = readShortText(raw.text, 120);
      if (text !== undefined) el.text = text;
      if (raw.value !== undefined) {
        if (typeof raw.value !== 'number' || !Number.isFinite(raw.value) || Math.abs(raw.value) > 1e9) throw Error('Invalid element value.');
        el.value = raw.value;
      }
      const prefix = readShortText(raw.prefix, 12);
      if (prefix !== undefined) el.prefix = prefix;
      const suffix = readShortText(raw.suffix, 16);
      if (suffix !== undefined) el.suffix = suffix;
      if (raw.color !== undefined) {
        if (typeof raw.color !== 'string' || !HEX6_OR_8.test(raw.color)) throw Error('Invalid element color.');
        el.color = raw.color;
      }
      if (raw.strokeWidth !== undefined) {
        if (typeof raw.strokeWidth !== 'number' || !Number.isFinite(raw.strokeWidth) || raw.strokeWidth < 1 || raw.strokeWidth > 16) throw Error('Invalid stroke width.');
        el.strokeWidth = raw.strokeWidth;
      }
      if (raw.fontSize !== undefined) {
        if (typeof raw.fontSize !== 'number' || !Number.isFinite(raw.fontSize) || raw.fontSize < 0.012 || raw.fontSize > 0.16) throw Error('Invalid element font size.');
        el.fontSize = raw.fontSize;
      }
      if (raw.fontWeight !== undefined) {
        if (typeof raw.fontWeight !== 'number' || !Number.isFinite(raw.fontWeight) || raw.fontWeight < 300 || raw.fontWeight > 900) throw Error('Invalid element font weight.');
        el.fontWeight = Math.round(raw.fontWeight);
      }
      if (raw.align !== undefined) {
        if (!['left', 'center', 'right'].includes(raw.align)) throw Error('Invalid element alignment.');
        el.align = raw.align;
      }
      if (raw.icon !== undefined) {
        if (!GRAPHIC_ICONS.includes(raw.icon)) throw Error('Invalid element icon.');
        el.icon = raw.icon;
      }
      if (raw.points !== undefined) {
        if (!Array.isArray(raw.points) || raw.points.length < 2 || raw.points.length > 24) throw Error('Invalid points array.');
        el.points = raw.points.map((pt) => {
          if (!pt || typeof pt.x !== 'number' || typeof pt.y !== 'number' || !Number.isFinite(pt.x) || !Number.isFinite(pt.y)) {
            throw Error('Invalid point coordinate.');
          }
          return { x: clamp(pt.x, -0.5, 0.5), y: clamp(pt.y, -0.5, 0.5) };
        });
      }
      if (raw.progress !== undefined) {
        if (typeof raw.progress !== 'number' || !Number.isFinite(raw.progress) || raw.progress < 0 || raw.progress > 1) throw Error('Invalid element progress.');
        el.progress = raw.progress;
      }
      if (raw.delay !== undefined) {
        if (typeof raw.delay !== 'number' || !Number.isFinite(raw.delay) || raw.delay < 0 || raw.delay > 6) throw Error('Invalid element delay.');
        el.delay = raw.delay;
      }
      if (raw.duration !== undefined) {
        if (typeof raw.duration !== 'number' || !Number.isFinite(raw.duration) || raw.duration < 0.08 || raw.duration > 4) throw Error('Invalid element duration.');
        el.duration = raw.duration;
      }
      if (raw.entrance !== undefined) {
        if (!CUSTOM_ENTRANCES.includes(raw.entrance)) throw Error('Invalid element entrance.');
        el.entrance = raw.entrance;
      }
      return el;
    }),
  };
  if (s.widthRatio !== undefined) {
    if (typeof s.widthRatio !== 'number' || !Number.isFinite(s.widthRatio) || s.widthRatio < 0.2 || s.widthRatio > 0.92) throw Error('Invalid custom widthRatio.');
    out.widthRatio = s.widthRatio;
  }
  if (s.heightRatio !== undefined) {
    if (typeof s.heightRatio !== 'number' || !Number.isFinite(s.heightRatio) || s.heightRatio < 0.1 || s.heightRatio > 0.72) throw Error('Invalid custom heightRatio.');
    out.heightRatio = s.heightRatio;
  }
  if (s.cornerRadius !== undefined) {
    if (typeof s.cornerRadius !== 'number' || !Number.isFinite(s.cornerRadius) || s.cornerRadius < 0 || s.cornerRadius > 0.5) throw Error('Invalid custom cornerRadius.');
    out.cornerRadius = s.cornerRadius;
  }
  if (s.showCard !== undefined) {
    out.showCard = Boolean(s.showCard);
  }
  return out;
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
  if (g.customSpec !== undefined) {
    out.customSpec = readCustomSpec(g.customSpec);
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
    options.comparison !== undefined ||
    options.customSpec !== undefined;

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
    ...(options.customSpec !== undefined ? { customSpec: options.customSpec } : {}),
  });

  if (
    !text.trim() ||
    text.length > 120 ||
    !Number.isFinite(startTime) ||
    startTime < 0 ||
    !Number.isFinite(duration) ||
    duration < 0.5 ||
    duration > 12 ||
    startTime + duration > MAX_VIDEO_SECONDS
  ) {
    throw Error(`Keep graphics short and inside the ${MAX_VIDEO_SECONDS}-second edit.`);
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
    kind === 'kinetic-badge' ||
    kind === 'social-follow' ||
    kind === 'chapter-card' ||
    kind === 'offer-tag';

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

export function removeMotionGraphic(p: EditorProject, id: string): EditorProject {
  const c = p.clips[id];
  if (!c || p.tracks[c.trackId]?.locked) {
    throw Error('Select an unlocked motion graphic.');
  }
  const rest = { ...c };
  delete rest.graphic;
  return {
    ...p,
    clips: {
      ...p.clips,
      [id]: rest,
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
    startTime + duration > MAX_VIDEO_SECONDS
  ) {
    throw Error(`Keep image overlays inside the ${MAX_VIDEO_SECONDS}-second edit.`);
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
    g.comparison !== undefined ||
    g.customSpec !== undefined
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

    case 'line-chart': {
      const cardW = Math.round(minDim * 0.68);
      const cardH = Math.round(minDim * 0.28);
      const pad = Math.round(minDim * 0.026);
      drawRoundedCard(ctx, -cardW / 2, -cardH / 2, cardW, cardH, radius, palette);

      const parsed = parseNumericFromText(titleText);
      const val = g.value ?? parsed.value;
      const prefix = g.prefix ?? parsed.prefix;
      const suffix = g.suffix ?? parsed.suffix;
      const bars = g.bars?.length
        ? g.bars
        : [
            { label: 'W1', value: 24 },
            { label: 'W2', value: 42 },
            { label: 'W3', value: 58 },
            { label: 'W4', value: 92 },
          ];
      const maxVal = Math.max(1, ...bars.map((b) => b.value));
      const prog = progressWindow(time, 0.08, 0.72);
      const valStr = `${prefix}${formatAnimatedNumber(val, prog)}${suffix}`;

      ctx.fillStyle = palette.title;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.font = `700 ${Math.round(minDim * 0.027)}px ${family}`;
      ctx.fillText(fitText(ctx, titleText, cardW * 0.56), -cardW / 2 + pad, -cardH / 2 + pad + 10);

      ctx.fillStyle = g.accent;
      ctx.textAlign = 'right';
      ctx.font = `800 ${Math.round(minDim * 0.036)}px ${family}`;
      ctx.fillText(valStr, cardW / 2 - pad, -cardH / 2 + pad + 12);

      if (g.subtitle) {
        ctx.fillStyle = palette.muted;
        ctx.textAlign = 'left';
        ctx.font = `500 ${Math.round(minDim * 0.019)}px ${family}`;
        ctx.fillText(fitText(ctx, g.subtitle, cardW * 0.62), -cardW / 2 + pad, -cardH / 2 + pad + 34);
      }

      const gx0 = -cardW / 2 + pad + 4;
      const gx1 = cardW / 2 - pad - 4;
      const gy0 = -cardH / 2 + pad + 48;
      const gy1 = cardH / 2 - pad - 8;
      const pts = bars.map((b, i) => ({
        x: gx0 + (i / Math.max(1, bars.length - 1)) * (gx1 - gx0),
        y: gy1 - (b.value / maxVal) * (gy1 - gy0),
      }));

      ctx.strokeStyle = palette.trackBg;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(gx0, gy1);
      ctx.lineTo(gx1, gy1);
      safeStroke(ctx);

      const drawProg = progressWindow(time, 0.10, 0.68);
      const maxX = gx0 + (gx1 - gx0) * drawProg;
      ctx.save();
      ctx.beginPath();
      ctx.rect(gx0 - 4, gy0 - 12, (gx1 - gx0 + 8) * drawProg, gy1 - gy0 + 24);
      ctx.clip();
      ctx.strokeStyle = g.accent;
      ctx.lineWidth = Math.max(3, Math.round(minDim * 0.005));
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      pts.forEach((pt, idx) => (idx === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
      safeStroke(ctx);
      ctx.restore();

      const lastPt = pts[pts.length - 1];
      if (lastPt && drawProg > 0.05) {
        const dotX = clamp(maxX, gx0, lastPt.x);
        const segIdx = Math.min(pts.length - 2, Math.floor(drawProg * (pts.length - 1)));
        const segStart = pts[segIdx];
        const segEnd = pts[segIdx + 1] ?? lastPt;
        const frac = segEnd.x > segStart.x ? (dotX - segStart.x) / (segEnd.x - segStart.x) : 1;
        const dotY = segStart.y + (segEnd.y - segStart.y) * clamp(frac, 0, 1);
        ctx.fillStyle = g.accent;
        ctx.beginPath();
        safeCircle(ctx, dotX, dotY, Math.max(4, minDim * 0.009));
        ctx.fill();
      }
      ctx.restore();
      return { width: cardW, height: cardH, handlesText: true };
    }

    case 'timeline-steps': {
      const items = g.items?.length ? g.items : ['Hook (0:00)', 'Story (0:15)', 'Offer (0:45)'];
      const cardW = Math.round(minDim * 0.72);
      const cardH = Math.round(minDim * 0.21);
      const pad = Math.round(minDim * 0.026);
      drawRoundedCard(ctx, -cardW / 2, -cardH / 2, cardW, cardH, radius, palette);

      ctx.fillStyle = palette.title;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.font = `800 ${Math.round(minDim * 0.027)}px ${family}`;
      ctx.fillText(fitText(ctx, titleText, cardW - pad * 2), -cardW / 2 + pad, -cardH / 2 + pad + 10);

      const lineY = 4;
      const startX = -cardW / 2 + pad + 26;
      const endX = cardW / 2 - pad - 26;
      const railProg = progressWindow(time, 0.08, 0.55);

      ctx.strokeStyle = palette.trackBg;
      ctx.lineWidth = Math.max(3, minDim * 0.005);
      ctx.beginPath();
      ctx.moveTo(startX, lineY);
      ctx.lineTo(endX, lineY);
      safeStroke(ctx);

      ctx.strokeStyle = g.accent;
      ctx.beginPath();
      ctx.moveTo(startX, lineY);
      ctx.lineTo(startX + (endX - startX) * railProg, lineY);
      safeStroke(ctx);

      const nodeR = Math.round(minDim * 0.022);
      items.slice(0, 4).forEach((item, idx, arr) => {
        const nx = startX + (idx / Math.max(1, arr.length - 1)) * (endX - startX);
        const pop = easeOutBack(progressWindow(time, 0.08 + idx * 0.14, 0.25));
        ctx.save();
        ctx.translate(nx, lineY);
        ctx.scale(pop, pop);
        ctx.fillStyle = g.accent;
        ctx.beginPath();
        safeCircle(ctx, 0, 0, nodeR);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = `800 ${Math.round(nodeR * 1.1)}px ${family}`;
        ctx.textAlign = 'center';
        ctx.fillText(String(idx + 1), 0, 1);
        ctx.restore();

        ctx.fillStyle = palette.title;
        ctx.textAlign = 'center';
        ctx.font = `600 ${Math.round(minDim * 0.021)}px ${family}`;
        ctx.fillText(fitText(ctx, item, (endX - startX) / Math.max(1, arr.length - 1) + 16), nx, lineY + nodeR + 18);
      });
      ctx.restore();
      return { width: cardW, height: cardH, handlesText: true };
    }

    case 'social-follow': {
      const cardW = Math.round(minDim * 0.64);
      const cardH = Math.round(minDim * 0.135);
      const pad = Math.round(minDim * 0.022);
      drawRoundedCard(ctx, -cardW / 2, -cardH / 2, cardW, cardH, Math.round(cardH * 0.45), palette);

      const avSize = Math.round(cardH * 0.62);
      drawVectorIcon(ctx, g.icon && g.icon !== 'none' ? g.icon : 'user', -cardW / 2 + pad + avSize * 0.48, 0, avSize, '#ffffff', g.accent);

      const btnW = Math.round(minDim * 0.16);
      const btnH = Math.round(cardH * 0.56);
      const btnPop = easeOutBack(progressWindow(time, 0.14, 0.28));
      ctx.save();
      ctx.translate(cardW / 2 - pad - btnW / 2, 0);
      ctx.scale(btnPop, btnPop);
      ctx.fillStyle = g.accent;
      ctx.beginPath();
      ctx.roundRect(-btnW / 2, -btnH / 2, btnW, btnH, Math.round(btnH / 2));
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `800 ${Math.round(minDim * 0.022)}px ${family}`;
      ctx.fillText(fitText(ctx, (g.prefix || 'FOLLOW').toUpperCase(), btnW - 14), 0, 1);
      ctx.restore();

      const tx = -cardW / 2 + pad + avSize + 14;
      const textMaxW = cardW / 2 - pad - btnW - 14 - tx;
      ctx.fillStyle = palette.title;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.font = `800 ${Math.round(minDim * 0.028)}px ${family}`;
      ctx.fillText(fitText(ctx, titleText, textMaxW), tx, g.subtitle ? -cardH * 0.14 : 0);
      if (g.subtitle) {
        ctx.fillStyle = palette.muted;
        ctx.font = `500 ${Math.round(minDim * 0.020)}px ${family}`;
        ctx.fillText(fitText(ctx, g.subtitle, textMaxW), tx, cardH * 0.17);
      }
      ctx.restore();
      return { width: cardW, height: cardH, handlesText: true };
    }

    case 'chapter-card': {
      const cardW = Math.round(minDim * 0.72);
      const cardH = Math.round(minDim * 0.17);
      const pad = Math.round(minDim * 0.028);
      drawRoundedCard(ctx, -cardW / 2, -cardH / 2, cardW, cardH, radius, palette);

      const wipe = progressWindow(time, 0.05, 0.42);
      const slideY = (1 - progressWindow(time, 0.04, 0.35)) * 14;
      ctx.fillStyle = g.accent;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.font = `800 ${Math.round(minDim * 0.019)}px ${family}`;
      ctx.fillText(fitText(ctx, (g.subtitle || 'CHAPTER').toUpperCase(), cardW - pad * 2), -cardW / 2 + pad, -cardH * 0.24);

      ctx.fillStyle = palette.title;
      ctx.font = `800 ${Math.round(minDim * 0.040)}px ${family}`;
      ctx.fillText(fitText(ctx, titleText, cardW - pad * 2), -cardW / 2 + pad, cardH * 0.06 + slideY);

      ctx.fillStyle = g.accent;
      ctx.fillRect(-cardW / 2 + pad, cardH / 2 - pad + 4, (cardW - pad * 2) * wipe, 4);
      ctx.restore();
      return { width: cardW, height: cardH, handlesText: true };
    }

    case 'kpi-grid': {
      const cardW = Math.round(minDim * 0.70);
      const cardH = Math.round(minDim * 0.22);
      const pad = Math.round(minDim * 0.024);
      drawRoundedCard(ctx, -cardW / 2, -cardH / 2, cardW, cardH, radius, palette);

      const bars = g.bars?.length
        ? g.bars.slice(0, 2)
        : [
            { label: 'Views', value: 14200, displayValue: '14.2K' },
            { label: 'Growth', value: 64, displayValue: '+64%' },
          ];
      ctx.fillStyle = palette.title;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.font = `700 ${Math.round(minDim * 0.025)}px ${family}`;
      ctx.fillText(fitText(ctx, titleText, cardW - pad * 2), -cardW / 2 + pad, -cardH / 2 + pad + 8);

      const gap = Math.round(minDim * 0.018);
      const colW = (cardW - pad * 2 - gap) / 2;
      const boxTop = -cardH / 2 + pad + 26;
      const boxH = cardH - pad * 2 - 26;
      bars.forEach((b, idx) => {
        const bx = -cardW / 2 + pad + idx * (colW + gap);
        const prog = progressWindow(time, 0.06 + idx * 0.12, 0.55);
        ctx.fillStyle = palette.innerCardBg;
        ctx.beginPath();
        ctx.roundRect(bx, boxTop, colW, boxH, Math.round(radius * 0.6));
        ctx.fill();
        ctx.fillStyle = b.color || g.accent;
        ctx.textAlign = 'left';
        ctx.font = `800 ${Math.round(minDim * 0.042)}px ${family}`;
        ctx.fillText(fitText(ctx, b.displayValue || formatAnimatedNumber(b.value, prog), colW - 16), bx + 10, boxTop + boxH * 0.4);
        ctx.fillStyle = palette.muted;
        ctx.font = `600 ${Math.round(minDim * 0.020)}px ${family}`;
        ctx.fillText(fitText(ctx, b.label, colW - 16), bx + 10, boxTop + boxH * 0.76);
      });
      ctx.restore();
      return { width: cardW, height: cardH, handlesText: true };
    }

    case 'poll-card': {
      const bars = g.bars?.length
        ? g.bars.slice(0, 3)
        : [
            { label: 'Option A', value: 72 },
            { label: 'Option B', value: 28 },
          ];
      const maxVal = Math.max(100, ...bars.map((b) => b.value));
      const cardW = Math.round(minDim * 0.68);
      const rowH = Math.round(minDim * 0.068);
      const pad = Math.round(minDim * 0.026);
      const cardH = Math.round(pad * 2 + 34 + bars.length * (rowH + 8));
      drawRoundedCard(ctx, -cardW / 2, -cardH / 2, cardW, cardH, radius, palette);

      ctx.fillStyle = palette.title;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.font = `800 ${Math.round(minDim * 0.027)}px ${family}`;
      ctx.fillText(fitText(ctx, titleText, cardW - pad * 2), -cardW / 2 + pad, -cardH / 2 + pad + 10);

      bars.forEach((b, idx) => {
        const y = -cardH / 2 + pad + 34 + idx * (rowH + 8);
        const prog = progressWindow(time, 0.1 + idx * 0.1, 0.55);
        const pct = clamp((b.value / maxVal) * prog, 0, 1);
        ctx.fillStyle = palette.trackBg;
        ctx.beginPath();
        ctx.roundRect(-cardW / 2 + pad, y, cardW - pad * 2, rowH, Math.round(rowH * 0.3));
        ctx.fill();
        ctx.fillStyle = idx === 0 ? g.accent : palette.muted;
        ctx.beginPath();
        ctx.roundRect(-cardW / 2 + pad, y, Math.max(8, (cardW - pad * 2) * pct), rowH, Math.round(rowH * 0.3));
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'left';
        ctx.font = `700 ${Math.round(minDim * 0.022)}px ${family}`;
        ctx.fillText(fitText(ctx, b.label, cardW * 0.55), -cardW / 2 + pad + 12, y + rowH / 2);
        ctx.textAlign = 'right';
        ctx.fillText(b.displayValue || `${Math.round(b.value * prog)}%`, cardW / 2 - pad - 10, y + rowH / 2);
      });
      ctx.restore();
      return { width: cardW, height: cardH, handlesText: true };
    }

    case 'offer-tag': {
      const cardW = Math.round(minDim * 0.60);
      const cardH = Math.round(minDim * 0.18);
      const pad = Math.round(minDim * 0.024);
      drawRoundedCard(ctx, -cardW / 2, -cardH / 2, cardW, cardH, radius, palette);

      const parsed = parseNumericFromText(titleText);
      const val = g.value ?? parsed.value;
      const prefix = g.prefix ?? (parsed.prefix || '$');
      const suffix = g.suffix ?? parsed.suffix;
      const prog = progressWindow(time, 0.08, 0.55);
      const heroPrice = `${prefix}${formatAnimatedNumber(val, prog)}${suffix}`;

      const pillPop = easeOutBack(progressWindow(time, 0.12, 0.25));
      ctx.save();
      ctx.translate(cardW / 2 - pad - 44, -cardH * 0.20);
      ctx.scale(pillPop, pillPop);
      ctx.fillStyle = g.accent;
      ctx.beginPath();
      ctx.roundRect(-42, -13, 84, 26, 13);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `800 ${Math.round(minDim * 0.017)}px ${family}`;
      ctx.fillText(fitText(ctx, titleText.toUpperCase(), 74), 0, 1);
      ctx.restore();

      ctx.fillStyle = palette.title;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.font = `900 ${Math.round(minDim * 0.058)}px ${family}`;
      ctx.fillText(heroPrice, -cardW / 2 + pad, g.subtitle ? 10 : 4);

      if (g.subtitle) {
        ctx.fillStyle = palette.muted;
        ctx.font = `600 ${Math.round(minDim * 0.024)}px ${family}`;
        const oldW = ctx.measureText(g.subtitle).width;
        const ox = -cardW / 2 + pad;
        const oy = -cardH * 0.20;
        ctx.fillText(g.subtitle, ox, oy);
        ctx.strokeStyle = palette.muted;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(ox, oy);
        ctx.lineTo(ox + oldW, oy);
        safeStroke(ctx);
      }
      ctx.restore();
      return { width: cardW, height: cardH, handlesText: true };
    }

    case 'custom': {
      const spec = g.customSpec;
      const cardW = Math.round(minDim * (spec?.widthRatio ?? 0.64));
      const cardH = Math.round(minDim * (spec?.heightRatio ?? 0.28));
      const cardR = spec?.cornerRadius !== undefined ? Math.round(cardH * spec.cornerRadius) : radius;
      if (!spec || spec.showCard !== false) {
        drawRoundedCard(ctx, -cardW / 2, -cardH / 2, cardW, cardH, cardR, palette);
      }
      const elements = spec?.elements ?? [];
      for (const el of elements) {
        const delay = el.delay ?? 0;
        const span = el.duration ?? 0.42;
        const p = progressWindow(time, delay, span);
        if (p <= 0.001 && el.entrance !== 'fade') continue;
        const popScale = el.entrance === 'pop' ? easeOutBack(clamp((time - delay) / span, 0, 1)) : 1;
        const dx = el.entrance === 'slide-left' ? (1 - p) * 24 : 0;
        const dy = el.entrance === 'slide-up' ? (1 - p) * 20 : 0;
        const ex = el.x * cardW + dx;
        const ey = el.y * cardH + dy;
        const col = el.color || (el.type === 'text' ? palette.title : g.accent);

        ctx.save();
        ctx.globalAlpha *= clamp(p, 0, 1);
        ctx.translate(ex, ey);
        ctx.scale(popScale, popScale);
        switch (el.type) {
          case 'rect':
          case 'pill': {
            const ew = (el.w ?? 0.28) * cardW;
            const eh = (el.h ?? 0.16) * cardH;
            ctx.fillStyle = col;
            ctx.beginPath();
            ctx.roundRect(-ew / 2, -eh / 2, ew, eh, el.type === 'pill' ? eh / 2 : (el.r ?? 0.12) * Math.min(ew, eh));
            ctx.fill();
            break;
          }
          case 'circle': {
            const rad = (el.r ?? 0.14) * Math.min(cardW, cardH);
            ctx.fillStyle = col;
            ctx.beginPath();
            safeCircle(ctx, 0, 0, rad);
            ctx.fill();
            break;
          }
          case 'ring': {
            const rad = (el.r ?? 0.18) * Math.min(cardW, cardH);
            const pct = clamp(el.progress ?? 0.75, 0, 1) * (el.entrance === 'draw' ? p : 1);
            ctx.strokeStyle = palette.trackBg;
            ctx.lineWidth = el.strokeWidth ?? Math.max(4, minDim * 0.008);
            ctx.lineCap = 'round';
            ctx.beginPath();
            safeCircle(ctx, 0, 0, rad);
            safeStroke(ctx);
            ctx.strokeStyle = col;
            ctx.beginPath();
            safeCircle(ctx, 0, 0, rad, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pct);
            safeStroke(ctx);
            break;
          }
          case 'line':
          case 'arrow':
          case 'sparkline': {
            const pts = el.points?.length
              ? el.points.map((pt) => ({ x: pt.x * cardW, y: pt.y * cardH }))
              : [
                  { x: -(el.w ?? 0.35) * cardW * 0.5, y: 0 },
                  { x: (el.w ?? 0.35) * cardW * 0.5, y: 0 },
                ];
            const drawFrac = el.entrance === 'draw' ? p : 1;
            ctx.strokeStyle = col;
            ctx.lineWidth = el.strokeWidth ?? Math.max(3, minDim * 0.005);
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.beginPath();
            const count = Math.max(2, pts.length);
            pts.forEach((pt, i) => {
              const prev = pts[Math.max(0, i - 1)];
              const segProg = clamp((drawFrac * (count - 1)) - (i - 1), 0, 1);
              if (i === 0) ctx.moveTo(pt.x, pt.y);
              else if (segProg > 0) ctx.lineTo(prev.x + (pt.x - prev.x) * segProg, prev.y + (pt.y - prev.y) * segProg);
            });
            safeStroke(ctx);
            if (el.type === 'arrow' && drawFrac > 0.85 && pts.length >= 2) {
              const p1 = pts[pts.length - 2];
              const p2 = pts[pts.length - 1];
              const ang = Math.atan2(p2.y - p1.y, p2.x - p1.x);
              const hs = Math.max(8, (el.strokeWidth ?? 4) * 2.5);
              ctx.fillStyle = col;
              ctx.beginPath();
              ctx.moveTo(p2.x, p2.y);
              ctx.lineTo(p2.x - Math.cos(ang - 0.45) * hs, p2.y - Math.sin(ang - 0.45) * hs);
              ctx.lineTo(p2.x - Math.cos(ang + 0.45) * hs, p2.y - Math.sin(ang + 0.45) * hs);
              safeClosePath(ctx);
              ctx.fill();
            }
            break;
          }
          case 'bar': {
            const ew = (el.w ?? 0.5) * cardW;
            const eh = (el.h ?? 0.1) * cardH;
            const fillPct = clamp(el.progress ?? 0.75, 0, 1) * p;
            ctx.fillStyle = palette.trackBg;
            ctx.beginPath();
            ctx.roundRect(-ew / 2, -eh / 2, ew, eh, eh / 2);
            ctx.fill();
            ctx.fillStyle = col;
            ctx.beginPath();
            ctx.roundRect(-ew / 2, -eh / 2, Math.max(4, ew * fillPct), eh, eh / 2);
            ctx.fill();
            break;
          }
          case 'counter': {
            const label = `${el.prefix ?? ''}${formatAnimatedNumber(el.value ?? 100, p)}${el.suffix ?? ''}`;
            ctx.fillStyle = col;
            ctx.textAlign = el.align ?? 'center';
            ctx.textBaseline = 'middle';
            ctx.font = `${el.fontWeight ?? 800} ${Math.round(minDim * (el.fontSize ?? 0.048))}px ${family}`;
            ctx.fillText(fitText(ctx, label, cardW * 0.9), 0, 0);
            break;
          }
          case 'icon': {
            drawVectorIcon(ctx, el.icon ?? 'sparkles', 0, 0, Math.round(minDim * (el.r ?? 0.065)), '#ffffff', col);
            break;
          }
          case 'text':
          default: {
            if (el.text) {
              ctx.fillStyle = col;
              ctx.textAlign = el.align ?? 'center';
              ctx.textBaseline = 'middle';
              ctx.font = `${el.fontWeight ?? 700} ${Math.round(minDim * (el.fontSize ?? 0.028))}px ${family}`;
              ctx.fillText(fitText(ctx, el.text, cardW * 0.9), 0, 0);
            }
            break;
          }
        }
        ctx.restore();
      }
      if (elements.length === 0) {
        ctx.fillStyle = palette.title;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `700 ${Math.round(minDim * 0.032)}px ${family}`;
        ctx.fillText(fitText(ctx, titleText, cardW - 24), 0, 0);
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
