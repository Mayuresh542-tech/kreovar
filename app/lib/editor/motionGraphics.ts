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
  'split-title',
  'marker-highlight',
  'audio-waveform',
  'subscribe-cta',
  'article-citation',
  'timer-badge',
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
    kind === 'subscribe-cta' ||
    kind === 'timer-badge' ||
    kind === 'audio-waveform' ||
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

function safeClip(ctx: CanvasRenderingContext2D) {
  if (typeof ctx.clip === 'function') ctx.clip();
}

function safeRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  if (typeof ctx.rect === 'function') ctx.rect(x, y, w, h);
  else ctx.roundRect(x, y, w, h, 0);
}

function safeRotate(ctx: CanvasRenderingContext2D, angle: number) {
  if (typeof ctx.rotate === 'function') ctx.rotate(angle);
}

function safeGradFill(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  stops: Array<[number, string]>,
  fallback: string
): string | CanvasGradient {
  if (typeof ctx.createLinearGradient === 'function') {
    const grad = ctx.createLinearGradient(x0, y0, x1, y1);
    for (const [offset, color] of stops) grad.addColorStop(offset, color);
    return grad;
  }
  return fallback;
}

function safeCircle(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, start = 0, end = Math.PI * 2) {
  if (typeof ctx.arc === 'function') {
    ctx.arc(cx, cy, r, start, end);
  } else {
    ctx.roundRect(cx - r, cy - r, r * 2, r * 2, r);
  }
}

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  if (clean.length < 6) return `rgba(37, 99, 235, ${alpha})`;
  const r = Number.parseInt(clean.slice(0, 2), 16) || 37;
  const g = Number.parseInt(clean.slice(2, 4), 16) || 99;
  const b = Number.parseInt(clean.slice(4, 6), 16) || 235;
  return `rgba(${r}, ${g}, ${b}, ${clamp(alpha, 0, 1)})`;
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
      // Split glowing telemetry card with left accent blade + delta pill + count-up track
      const parsed = parseNumericFromText(titleText);
      const target = g.value ?? parsed.value;
      const prefix = g.prefix ?? parsed.prefix;
      const suffix = g.suffix ?? parsed.suffix;
      const label = g.subtitle || (g.value !== undefined ? titleText : parsed.label);
      const cardW = Math.round(minDim * 0.6);
      const cardH = Math.round(minDim * 0.185);
      const pad = Math.round(minDim * 0.024);

      ctx.save();
      ctx.shadowColor = palette.shadow;
      ctx.shadowBlur = 18;
      ctx.shadowOffsetY = 6;
      ctx.fillStyle = safeGradFill(
        ctx,
        -cardW / 2,
        -cardH / 2,
        cardW / 2,
        cardH / 2,
        [
          [0, palette.bg],
          [1, hexToRgba(g.accent, g.theme === 'dark-slate' ? 0.18 : 0.08)],
        ],
        palette.bg
      );
      ctx.beginPath();
      ctx.roundRect(-cardW / 2, -cardH / 2, cardW, cardH, Math.round(minDim * 0.028));
      ctx.fill();
      ctx.strokeStyle = hexToRgba(g.accent, 0.35);
      ctx.lineWidth = 1.4;
      safeStroke(ctx);
      ctx.restore();

      // Left vertical accent blade
      const bladeW = 6;
      const bladeProg = progressWindow(time, 0.02, 0.32);
      ctx.fillStyle = g.accent;
      ctx.beginPath();
      ctx.roundRect(-cardW / 2 + 10, -cardH / 2 + 14, bladeW, Math.max(8, (cardH - 28) * bladeProg), 3);
      ctx.fill();

      const iconSize = g.icon && g.icon !== 'none' ? Math.round(minDim * 0.056) : 0;
      const iconPop = easeOutBack(progressWindow(time, 0.04, 0.25));
      if (iconSize) {
        ctx.save();
        ctx.translate(-cardW / 2 + 24 + iconSize * 0.5, -cardH * 0.12);
        ctx.scale(iconPop, iconPop);
        drawVectorIcon(ctx, g.icon!, 0, 0, iconSize, '#ffffff', g.accent);
        ctx.restore();
      }

      const countProg = progressWindow(time, 0.08, 0.72);
      const numStr = `${prefix}${formatAnimatedNumber(target, countProg)}${suffix}`;
      const numLeft = -cardW / 2 + 26 + (iconSize ? iconSize + 14 : 0);
      ctx.fillStyle = palette.title;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.font = `800 ${Math.round(minDim * 0.062)}px ${family}`;
      ctx.fillText(fitText(ctx, numStr, cardW - 60 - (iconSize ? iconSize + 18 : 0)), numLeft, -cardH * 0.14);

      // Delta chip top-right
      const chipPop = easeOutBack(progressWindow(time, 0.18, 0.25));
      ctx.save();
      ctx.translate(cardW / 2 - pad - 24, -cardH * 0.24);
      ctx.scale(chipPop, chipPop);
      ctx.fillStyle = hexToRgba(g.accent, 0.16);
      ctx.beginPath();
      ctx.roundRect(-24, -10, 48, 20, 10);
      ctx.fill();
      ctx.fillStyle = g.accent;
      ctx.textAlign = 'center';
      ctx.font = `800 ${Math.round(minDim * 0.016)}px ${family}`;
      ctx.fillText('▲ LIVE', 0, 0.5);
      ctx.restore();

      if (label) {
        ctx.globalAlpha = progressWindow(time, 0.16, 0.35);
        ctx.fillStyle = palette.muted;
        ctx.textAlign = 'left';
        ctx.font = `600 ${Math.round(minDim * 0.023)}px ${family}`;
        ctx.fillText(fitText(ctx, label, cardW - 44), -cardW / 2 + 26, cardH * 0.24);
        ctx.globalAlpha = 1;
      }

      const barY = cardH / 2 - Math.round(minDim * 0.012);
      const barW = cardW - 44;
      ctx.fillStyle = palette.trackBg;
      ctx.beginPath();
      ctx.roundRect(-cardW / 2 + 22, barY, barW, 4, 2);
      ctx.fill();
      ctx.fillStyle = g.accent;
      ctx.beginPath();
      ctx.roundRect(-cardW / 2 + 22, barY, Math.max(4, barW * progressWindow(time, 0.1, 0.75)), 4, 2);
      ctx.fill();

      ctx.restore();
      return { width: cardW, height: cardH, handlesText: true };
    }

    case 'progress-ring': {
      // HUD Dial Assembly with outer calibrated degree ticks + floating pill metric label (no heavy rectangular slab)
      const parsed = parseNumericFromText(titleText);
      const pct = clamp(g.value ?? parsed.value, 0, 100);
      const cardW = Math.round(minDim * 0.64);
      const cardH = Math.round(minDim * 0.2);
      const ringR = Math.round(cardH * 0.39);
      const cx = -cardW * 0.26;
      const cy = 0;

      // Floating horizontal backdrop pill emerging from behind the circular dial
      const pillX = cx;
      const pillW = cardW * 0.72;
      const pillH = Math.round(cardH * 0.66);
      const slide = progressWindow(time, 0.06, 0.38);
      ctx.save();
      ctx.globalAlpha = slide;
      ctx.shadowColor = palette.shadow;
      ctx.shadowBlur = 14;
      ctx.fillStyle = palette.bg;
      ctx.beginPath();
      ctx.roundRect(pillX, -pillH / 2, pillW * slide + ringR * 0.5, pillH, Math.round(pillH * 0.35));
      ctx.fill();
      ctx.strokeStyle = palette.border;
      ctx.lineWidth = 1.2;
      safeStroke(ctx);
      ctx.restore();

      // Circular dial medallion
      ctx.save();
      ctx.shadowColor = palette.shadow;
      ctx.shadowBlur = 16;
      ctx.fillStyle = palette.bg;
      ctx.beginPath();
      safeCircle(ctx, cx, cy, ringR + 10);
      ctx.fill();
      ctx.strokeStyle = hexToRgba(g.accent, 0.32);
      ctx.lineWidth = 1.5;
      safeStroke(ctx);
      ctx.restore();

      // Subtle 12 radial tick marks around dial
      ctx.strokeStyle = palette.trackBg;
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 12; i++) {
        const a = (i * Math.PI * 2) / 12;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * (ringR + 4), cy + Math.sin(a) * (ringR + 4));
        ctx.lineTo(cx + Math.cos(a) * (ringR + 8), cy + Math.sin(a) * (ringR + 8));
        safeStroke(ctx);
      }

      const prog = progressWindow(time, 0.08, 0.78);
      const currentPct = pct * prog;
      const endAngle = -Math.PI / 2 + (Math.PI * 2 * currentPct) / 100;

      ctx.save();
      ctx.lineWidth = Math.max(5, Math.round(minDim * 0.013));
      ctx.lineCap = 'round';
      ctx.strokeStyle = palette.trackBg;
      ctx.beginPath();
      safeCircle(ctx, cx, cy, ringR - 2);
      safeStroke(ctx);

      ctx.strokeStyle = g.accent;
      ctx.beginPath();
      safeCircle(ctx, cx, cy, ringR - 2, -Math.PI / 2, endAngle);
      safeStroke(ctx);

      // Glowing tip bead
      if (currentPct > 2) {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        safeCircle(ctx, cx + Math.cos(endAngle) * (ringR - 2), cy + Math.sin(endAngle) * (ringR - 2), 3);
        ctx.fill();
      }
      ctx.restore();

      ctx.fillStyle = palette.title;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `800 ${Math.round(minDim * 0.036)}px ${family}`;
      ctx.fillText(`${Math.round(currentPct)}${g.suffix || '%'}`, cx, cy + 1);

      const textX = cx + ringR + 18;
      const maxTextW = pillX + pillW - textX;
      ctx.textAlign = 'left';
      ctx.globalAlpha = progressWindow(time, 0.14, 0.34);
      ctx.font = `700 ${Math.round(minDim * 0.029)}px ${family}`;
      ctx.fillText(fitText(ctx, titleText, maxTextW), textX, g.subtitle ? -pillH * 0.16 : 0);
      if (g.subtitle) {
        ctx.fillStyle = palette.muted;
        ctx.font = `500 ${Math.round(minDim * 0.020)}px ${family}`;
        ctx.fillText(fitText(ctx, g.subtitle, maxTextW), textX, pillH * 0.17);
      }
      ctx.restore();
      return { width: cardW, height: cardH, handlesText: true };
    }

    case 'bar-chart': {
      // Staggered rounded column capsule tracks with glowing leading dots
      const bars: GraphicBar[] =
        g.bars && g.bars.length > 0
          ? g.bars.slice(0, 4)
          : [
              { label: 'Before', value: 32, displayValue: '32%' },
              { label: 'After', value: 88, displayValue: '88%' },
            ];
      const maxVal = Math.max(1, ...bars.map((b) => b.value));
      const pad = Math.round(minDim * 0.024);
      const rowH = Math.round(minDim * 0.058);
      const headerH = Math.round(minDim * 0.048);
      const cardW = Math.round(minDim * 0.66);
      const cardH = headerH + bars.length * rowH + pad * 1.4;
      drawRoundedCard(ctx, -cardW / 2, -cardH / 2, cardW, cardH, radius, palette);

      ctx.fillStyle = palette.title;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.font = `800 ${Math.round(minDim * 0.027)}px ${family}`;
      ctx.fillText(fitText(ctx, titleText, cardW - pad * 2), -cardW / 2 + pad, -cardH / 2 + pad + headerH * 0.32);

      const labelW = cardW * 0.25;
      const valW = cardW * 0.16;
      const trackX = -cardW / 2 + pad + labelW + 10;
      const trackW = cardW - pad * 2 - labelW - valW - 18;

      bars.forEach((bar, idx) => {
        const yCenter = -cardH / 2 + pad + headerH + idx * rowH + rowH * 0.42;
        const rowProg = progressWindow(time, 0.10 + idx * 0.12, 0.52);
        const barCol = bar.color || g.accent;
        ctx.save();
        ctx.globalAlpha = clamp(rowProg * 1.3, 0, 1);
        ctx.fillStyle = palette.muted;
        ctx.font = `600 ${Math.round(minDim * 0.022)}px ${family}`;
        ctx.textAlign = 'left';
        ctx.fillText(fitText(ctx, bar.label, labelW), -cardW / 2 + pad, yCenter);

        const barH = Math.max(11, Math.round(minDim * 0.024));
        ctx.fillStyle = palette.trackBg;
        ctx.beginPath();
        ctx.roundRect(trackX, yCenter - barH / 2, trackW, barH, barH / 2);
        ctx.fill();

        const fillW = Math.max(barH, trackW * clamp(bar.value / maxVal, 0.06, 1) * rowProg);
        ctx.fillStyle = safeGradFill(
          ctx,
          trackX,
          yCenter,
          trackX + fillW,
          yCenter,
          [
            [0, hexToRgba(barCol, 0.65)],
            [1, barCol],
          ],
          barCol
        );
        ctx.beginPath();
        ctx.roundRect(trackX, yCenter - barH / 2, fillW, barH, barH / 2);
        ctx.fill();

        ctx.fillStyle = palette.title;
        ctx.textAlign = 'right';
        ctx.font = `800 ${Math.round(minDim * 0.022)}px ${family}`;
        const valText = bar.displayValue || String(Math.round(bar.value * rowProg));
        ctx.fillText(fitText(ctx, valText, valW), cardW / 2 - pad, yCenter);
        ctx.restore();
      });

      ctx.restore();
      return { width: cardW, height: cardH, handlesText: true };
    }

    case 'comparison': {
      // Split-curtain dual contrasting plates + oversized tilted VS orb
      const cmp = g.comparison ?? {
        leftTitle: 'Before',
        leftValue: 'Manual',
        rightTitle: 'After',
        rightValue: titleText,
      };
      const cardW = Math.round(minDim * 0.68);
      const cardH = Math.round(minDim * 0.21);
      const gap = Math.round(minDim * 0.016);
      const boxW = (cardW - gap) / 2;
      const topH = titleText && g.comparison ? Math.round(minDim * 0.044) : 0;
      const boxH = cardH - topH;

      // Subtle top eyebrow pill
      if (topH > 0) {
        ctx.save();
        ctx.fillStyle = palette.bg;
        ctx.beginPath();
        ctx.roundRect(-cardW * 0.34, -cardH / 2, cardW * 0.68, topH - 6, Math.round((topH - 6) / 2));
        ctx.fill();
        ctx.fillStyle = palette.title;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `700 ${Math.round(minDim * 0.020)}px ${family}`;
        ctx.fillText(fitText(ctx, titleText, cardW * 0.6), 0, -cardH / 2 + (topH - 6) / 2);
        ctx.restore();
      }

      const leftProg = progressWindow(time, 0.04, 0.36);
      const boxY = -cardH / 2 + topH;
      ctx.save();
      ctx.globalAlpha = leftProg;
      ctx.translate(-(1 - leftProg) * 18, 0);
      ctx.shadowColor = palette.shadow;
      ctx.shadowBlur = 12;
      ctx.fillStyle = palette.bg;
      ctx.beginPath();
      ctx.roundRect(-cardW / 2, boxY, boxW, boxH, Math.round(radius * 0.9));
      ctx.fill();
      ctx.strokeStyle = palette.border;
      ctx.lineWidth = 1.2;
      safeStroke(ctx);
      ctx.fillStyle = palette.muted;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `700 ${Math.round(minDim * 0.020)}px ${family}`;
      ctx.fillText(fitText(ctx, cmp.leftTitle.toUpperCase(), boxW - 18), -cardW / 2 + boxW / 2, boxY + boxH * 0.34);
      ctx.fillStyle = palette.title;
      ctx.font = `800 ${Math.round(minDim * 0.032)}px ${family}`;
      ctx.fillText(fitText(ctx, cmp.leftValue, boxW - 18), -cardW / 2 + boxW / 2, boxY + boxH * 0.68);
      ctx.restore();

      const rightProg = progressWindow(time, 0.18, 0.36);
      ctx.save();
      ctx.globalAlpha = rightProg;
      ctx.translate((1 - rightProg) * 18, 0);
      ctx.shadowColor = hexToRgba(g.accent, 0.35);
      ctx.shadowBlur = 18;
      ctx.fillStyle = safeGradFill(
        ctx,
        gap / 2,
        boxY,
        gap / 2 + boxW,
        boxY + boxH,
        [
          [0, g.accent],
          [1, hexToRgba(g.accent, 0.8)],
        ],
        g.accent
      );
      ctx.beginPath();
      ctx.roundRect(gap / 2, boxY, boxW, boxH, Math.round(radius * 0.9));
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.88)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `700 ${Math.round(minDim * 0.020)}px ${family}`;
      ctx.fillText(fitText(ctx, cmp.rightTitle.toUpperCase(), boxW - 18), gap / 2 + boxW / 2, boxY + boxH * 0.34);
      ctx.fillStyle = '#ffffff';
      ctx.font = `900 ${Math.round(minDim * 0.034)}px ${family}`;
      ctx.fillText(fitText(ctx, cmp.rightValue, boxW - 18), gap / 2 + boxW / 2, boxY + boxH * 0.68);
      ctx.restore();

      const vsScale = easeOutBack(progressWindow(time, 0.16, 0.28));
      const vsR = Math.round(minDim * 0.026);
      ctx.save();
      ctx.translate(0, boxY + boxH / 2);
      ctx.scale(vsScale, vsScale);
      ctx.fillStyle = '#0f172a';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      safeCircle(ctx, 0, 0, vsR);
      ctx.fill();
      safeStroke(ctx);
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `900 ${Math.round(minDim * 0.018)}px ${family}`;
      ctx.fillText('VS', 0, 1);
      ctx.restore();

      ctx.restore();
      return { width: cardW, height: cardH, handlesText: true };
    }

    case 'checklist': {
      // Individual staggered frosted pills popping sequentially (zero monotonous large box)
      const items =
        g.items && g.items.length > 0
          ? g.items.slice(0, 4)
          : titleText
              .split(/[,;\n]/)
              .map((s) => s.trim())
              .filter(Boolean)
              .slice(0, 4);
      const list = items.length ? items : [titleText];
      const pillH = Math.round(minDim * 0.056);
      const rowGap = Math.round(minDim * 0.014);
      const headerH = g.items?.length ? Math.round(minDim * 0.042) : 0;
      const cardW = Math.round(minDim * 0.62);
      const cardH = headerH + list.length * pillH + (list.length - 1) * rowGap;

      if (headerH > 0) {
        ctx.save();
        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.roundRect(-cardW / 2, -cardH / 2, cardW * 0.72, headerH - 8, 12);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.font = `800 ${Math.round(minDim * 0.022)}px ${family}`;
        ctx.fillText(fitText(ctx, titleText, cardW * 0.65), -cardW / 2 + 14, -cardH / 2 + (headerH - 8) / 2);
        ctx.restore();
      }

      const iconR = Math.round(pillH * 0.34);
      list.forEach((item, idx) => {
        const py = -cardH / 2 + headerH + idx * (pillH + rowGap);
        const pRow = progressWindow(time, 0.06 + idx * 0.16, 0.34);
        const shiftX = (1 - pRow) * 22;
        ctx.save();
        ctx.globalAlpha = pRow;
        ctx.translate(shiftX, 0);
        ctx.shadowColor = palette.shadow;
        ctx.shadowBlur = 10;
        ctx.fillStyle = palette.bg;
        ctx.beginPath();
        ctx.roundRect(-cardW / 2, py, cardW, pillH, Math.round(pillH * 0.34));
        ctx.fill();
        ctx.strokeStyle = hexToRgba(g.accent, 0.25);
        ctx.lineWidth = 1;
        safeStroke(ctx);

        const ix = -cardW / 2 + 12 + iconR;
        drawVectorIcon(ctx, 'check', ix, py + pillH / 2, iconR * 1.9, '#ffffff', g.accent);
        ctx.fillStyle = palette.title;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.font = `600 ${Math.round(minDim * 0.023)}px ${family}`;
        ctx.fillText(fitText(ctx, item, cardW - 36 - iconR * 2), ix + iconR + 10, py + pillH / 2);
        ctx.restore();
      });

      ctx.restore();
      return { width: cardW, height: cardH, handlesText: true };
    }

    case 'step-flow': {
      const steps = g.items && g.items.length > 0 ? g.items.slice(0, 4) : ['Plan', 'Build', 'Launch'];
      const cardW = Math.round(minDim * 0.68);
      const cardH = Math.round(minDim * 0.18);
      const pad = Math.round(minDim * 0.024);
      drawRoundedCard(ctx, -cardW / 2, -cardH / 2, cardW, cardH, radius, palette);

      ctx.fillStyle = g.accent;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.font = `800 ${Math.round(minDim * 0.020)}px ${family}`;
      ctx.fillText(fitText(ctx, titleText.toUpperCase(), cardW - pad * 2), -cardW / 2 + pad, -cardH / 2 + pad + 6);

      const nodeY = 4;
      const spanW = cardW - pad * 2 - Math.round(minDim * 0.14);
      const startX = -spanW / 2;
      const lineProg = progressWindow(time, 0.10, 0.82);
      if (steps.length > 1) {
        ctx.fillStyle = palette.trackBg;
        ctx.beginPath();
        ctx.roundRect(startX, nodeY - 2, spanW, 4, 2);
        ctx.fill();
        ctx.fillStyle = g.accent;
        ctx.beginPath();
        ctx.roundRect(startX, nodeY - 2, spanW * lineProg, 4, 2);
        ctx.fill();
      }

      const nodeR = Math.round(minDim * 0.025);
      steps.forEach((step, idx) => {
        const frac = steps.length === 1 ? 0.5 : idx / (steps.length - 1);
        const nx = startX + spanW * frac;
        const active = progressWindow(time, 0.1 + idx * 0.22, 0.28);
        ctx.save();
        if (active > 0.25) {
          ctx.fillStyle = hexToRgba(g.accent, 0.2);
          ctx.beginPath();
          safeCircle(ctx, nx, nodeY, nodeR + 5);
          ctx.fill();
        }
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
        ctx.font = `700 ${Math.round(minDim * 0.021)}px ${family}`;
        ctx.fillText(fitText(ctx, step, spanW / steps.length + 24), nx, nodeY + nodeR + Math.round(minDim * 0.026));
        ctx.restore();
      });

      ctx.restore();
      return { width: cardW, height: cardH, handlesText: true };
    }

    case 'notification': {
      // Sleek pill stadium capsule toast with live glowing badge halo
      const cardW = Math.round(minDim * 0.68);
      const cardH = Math.round(minDim * 0.135);
      const pad = Math.round(cardH * 0.18);
      drawRoundedCard(ctx, -cardW / 2, -cardH / 2, cardW, cardH, Math.round(cardH / 2), palette);

      const badgeSize = Math.round(cardH * 0.66);
      const bx = -cardW / 2 + pad + badgeSize / 2;
      ctx.fillStyle = hexToRgba(g.accent, 0.2);
      ctx.beginPath();
      safeCircle(ctx, bx, 0, badgeSize * 0.62);
      ctx.fill();
      ctx.fillStyle = g.accent;
      ctx.beginPath();
      safeCircle(ctx, bx, 0, badgeSize * 0.48);
      ctx.fill();
      drawVectorIcon(ctx, g.icon && g.icon !== 'none' ? g.icon : 'bolt', bx, 0, badgeSize * 0.78, '#ffffff');

      const tx = -cardW / 2 + pad + badgeSize + 14;
      const textMaxW = cardW / 2 - tx - pad - 48;
      ctx.fillStyle = palette.title;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.font = `700 ${Math.round(minDim * 0.026)}px ${family}`;
      ctx.fillText(fitText(ctx, titleText, textMaxW), tx, g.subtitle ? -cardH * 0.15 : 0);

      // Live green pill dot top-right
      ctx.fillStyle = g.accent;
      ctx.textAlign = 'right';
      ctx.font = `700 ${Math.round(minDim * 0.018)}px ${family}`;
      ctx.fillText('● LIVE', cardW / 2 - pad - 6, -cardH * 0.15);

      if (g.subtitle) {
        ctx.fillStyle = palette.muted;
        ctx.textAlign = 'left';
        ctx.font = `500 ${Math.round(minDim * 0.021)}px ${family}`;
        ctx.fillText(fitText(ctx, g.subtitle, cardW / 2 - tx - pad - 8), tx, cardH * 0.16);
      }

      ctx.restore();
      return { width: cardW, height: cardH, handlesText: true };
    }

    case 'pointer-callout': {
      // Tactical HUD dual-ring sonar target + chamfered elbow laser leader + dark/glass HUD tag
      const padX = Math.round(minDim * 0.024);
      ctx.font = `700 ${Math.round(minDim * 0.026)}px ${family}`;
      const textW = Math.min(minDim * 0.48, ctx.measureText(titleText).width);
      const iconW = g.icon && g.icon !== 'none' ? Math.round(minDim * 0.032) : 0;
      const cardW = Math.round(textW + padX * 2 + (iconW ? iconW + 10 : 0) + 12);
      const cardH = Math.round(minDim * (g.subtitle ? 0.11 : 0.082));

      const frameW = context.frameWidth || 1080;
      const frameH = context.frameHeight || 1920;
      const dx = clamp((g.targetX ?? 0) * frameW * 0.35, -minDim * 0.25, minDim * 0.25);
      const dy = clamp((g.targetY ?? 0.25) * frameH * 0.18, minDim * 0.09, minDim * 0.24);
      const lineProg = progressWindow(time, 0.05, 0.38);

      const elbowX = dx * 0.45 * lineProg;
      const elbowY = (cardH / 2 + (dy - cardH / 2) * 0.55) * lineProg;
      const endX = dx * lineProg;
      const endY = cardH / 2 + (dy - cardH / 2) * lineProg;

      ctx.save();
      ctx.strokeStyle = g.accent;
      ctx.lineWidth = Math.max(2, Math.round(minDim * 0.004));
      ctx.beginPath();
      ctx.moveTo(0, cardH / 2);
      ctx.lineTo(elbowX, elbowY);
      ctx.lineTo(endX, endY);
      safeStroke(ctx);

      const dotR = Math.round(minDim * 0.012);
      ctx.strokeStyle = hexToRgba(g.accent, 0.45);
      ctx.lineWidth = 2;
      ctx.beginPath();
      safeCircle(ctx, endX, endY, dotR * (1.8 + 0.4 * Math.sin(time * 5)));
      safeStroke(ctx);

      ctx.fillStyle = g.accent;
      ctx.beginPath();
      safeCircle(ctx, endX, endY, dotR);
      ctx.fill();
      ctx.restore();

      // Tag container with left accent bracket bar
      drawRoundedCard(ctx, -cardW / 2, -cardH / 2, cardW, cardH, 10, palette);
      ctx.fillStyle = g.accent;
      ctx.fillRect(-cardW / 2, -cardH / 2, 5, cardH);

      if (iconW) {
        drawVectorIcon(ctx, g.icon!, -cardW / 2 + padX + 4 + iconW * 0.45, 0, iconW, '#ffffff', g.accent);
      }
      const tx = -cardW / 2 + padX + 4 + (iconW ? iconW + 10 : 0);
      ctx.fillStyle = palette.title;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.font = `700 ${Math.round(minDim * 0.026)}px ${family}`;
      ctx.fillText(fitText(ctx, titleText, cardW - padX * 2), tx, g.subtitle ? -cardH * 0.14 : 0);
      if (g.subtitle) {
        ctx.fillStyle = palette.muted;
        ctx.font = `500 ${Math.round(minDim * 0.019)}px ${family}`;
        ctx.fillText(fitText(ctx, g.subtitle, cardW - padX * 2), tx, cardH * 0.18);
      }
      ctx.restore();
      return { width: cardW, height: cardH + Math.abs(dy), handlesText: true };
    }

    case 'quote-card': {
      // Borderless-feel editorial typography block: thick tapered left stripe + translucent backdrop + serif quote
      const cardW = Math.round(minDim * 0.7);
      const cardH = Math.round(minDim * 0.18);
      const wipe = progressWindow(time, 0, 0.36);

      ctx.save();
      ctx.fillStyle = hexToRgba(palette.bg, 0.85);
      ctx.beginPath();
      ctx.roundRect(-cardW / 2, -cardH / 2, cardW, cardH, 6);
      ctx.fill();
      ctx.restore();

      ctx.fillStyle = g.accent;
      ctx.beginPath();
      ctx.roundRect(-cardW / 2, -cardH / 2, 7, Math.max(8, cardH * wipe), 3.5);
      ctx.fill();

      ctx.fillStyle = hexToRgba(g.accent, 0.22);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.font = `900 ${Math.round(minDim * 0.11)}px Georgia, serif`;
      ctx.fillText('“', -cardW / 2 + 18, -cardH * 0.14);

      ctx.globalAlpha = progressWindow(time, 0.08, 0.32);
      ctx.fillStyle = palette.title;
      ctx.font = `700 ${Math.round(minDim * 0.032)}px Georgia, ${family}`;
      ctx.fillText(fitText(ctx, titleText, cardW - 56), -cardW / 2 + 34, g.subtitle ? -cardH * 0.08 : 0);

      if (g.subtitle) {
        ctx.fillStyle = g.accent;
        ctx.font = `700 ${Math.round(minDim * 0.020)}px ${family}`;
        ctx.fillText(fitText(ctx, `— ${g.subtitle.toUpperCase()}`, cardW - 56), -cardW / 2 + 34, cardH * 0.26);
      }
      ctx.restore();
      return { width: cardW, height: cardH, handlesText: true };
    }

    case 'kinetic-badge': {
      // Solid saturated gradient sticker badge with slight dynamic rotation (no flat box!)
      const padX = Math.round(minDim * 0.028);
      ctx.font = `900 ${Math.round(minDim * 0.034)}px ${family}`;
      const labelW = Math.min(minDim * 0.5, ctx.measureText(titleText.toUpperCase()).width);
      const hasIcon = Boolean(g.icon && g.icon !== 'none');
      const iconSize = hasIcon ? Math.round(minDim * 0.044) : 0;
      const cardW = Math.round(labelW + padX * 2 + (iconSize ? iconSize + 12 : 0));
      const cardH = Math.round(minDim * 0.098);
      const pop = easeOutBack(progressWindow(time, 0.02, 0.28));

      ctx.save();
      safeRotate(ctx, -0.035);
      ctx.scale(pop, pop);
      ctx.shadowColor = hexToRgba(g.accent, 0.42);
      ctx.shadowBlur = 16;
      ctx.shadowOffsetY = 5;
      ctx.fillStyle = g.accent;
      ctx.beginPath();
      ctx.roundRect(-cardW / 2, -cardH / 2, cardW, cardH, Math.round(cardH / 2));
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      ctx.lineWidth = 1.6;
      safeStroke(ctx);

      if (hasIcon) {
        drawVectorIcon(ctx, g.icon!, -cardW / 2 + padX + iconSize * 0.45, 0, iconSize, g.accent, '#ffffff');
      }
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.font = `900 ${Math.round(minDim * 0.033)}px ${family}`;
      ctx.fillText(
        fitText(ctx, titleText.toUpperCase(), cardW - padX * 2 - (iconSize ? iconSize + 12 : 0)),
        -cardW / 2 + padX + (iconSize ? iconSize + 12 : 0),
        1
      );
      ctx.restore();
      ctx.restore();
      return { width: cardW, height: cardH, handlesText: true };
    }

    case 'lower-third': {
      // Broadcast sleek skewed ribbon lower-third without clunky white box border
      const cardW = Math.round(minDim * 0.66);
      const cardH = Math.round(minDim * (g.subtitle ? 0.14 : 0.105));
      const wipe = progressWindow(time, 0, 0.36);

      ctx.save();
      ctx.shadowColor = palette.shadow;
      ctx.shadowBlur = 16;
      ctx.fillStyle = safeGradFill(
        ctx,
        -cardW / 2,
        0,
        cardW / 2,
        0,
        [
          [0, palette.bg],
          [0.85, hexToRgba(palette.bg, 0.88)],
          [1, hexToRgba(g.accent, 0.15)],
        ],
        palette.bg
      );
      ctx.beginPath();
      ctx.roundRect(-cardW / 2, -cardH / 2, cardW * Math.max(0.25, wipe), cardH, 10);
      ctx.fill();
      ctx.restore();

      // Thick bright glowing accent left bar
      ctx.fillStyle = g.accent;
      ctx.beginPath();
      ctx.roundRect(-cardW / 2, -cardH / 2, 8, cardH * wipe, 4);
      ctx.fill();

      const hasIcon = Boolean(g.icon && g.icon !== 'none');
      const iconSize = hasIcon ? Math.round(cardH * 0.56) : 0;
      if (hasIcon && wipe > 0.4) {
        drawVectorIcon(ctx, g.icon!, -cardW / 2 + 28 + iconSize * 0.4, 0, iconSize, '#ffffff', g.accent);
      }

      const tx = -cardW / 2 + 26 + (iconSize ? iconSize + 14 : 0);
      const maxW = cardW / 2 - tx - 16;
      ctx.globalAlpha = progressWindow(time, 0.1, 0.3);
      ctx.fillStyle = palette.title;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.font = `800 ${Math.round(minDim * 0.032)}px ${family}`;
      ctx.fillText(fitText(ctx, titleText, maxW), tx, g.subtitle ? -cardH * 0.15 : 0);
      if (g.subtitle) {
        ctx.fillStyle = g.accent;
        ctx.font = `600 ${Math.round(minDim * 0.021)}px ${family}`;
        ctx.fillText(fitText(ctx, g.subtitle, maxW), tx, cardH * 0.19);
      }
      ctx.restore();
      return { width: cardW, height: cardH, handlesText: true };
    }

    case 'line-chart': {
      // Area chart with smooth curve + gradient fill beneath spline + crosshair vertical guide + peak chip
      const cardW = Math.round(minDim * 0.70);
      const cardH = Math.round(minDim * 0.28);
      const pad = Math.round(minDim * 0.024);
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
      ctx.font = `700 ${Math.round(minDim * 0.026)}px ${family}`;
      ctx.fillText(fitText(ctx, titleText, cardW * 0.56), -cardW / 2 + pad, -cardH / 2 + pad + 10);

      // Peak value pill
      ctx.fillStyle = hexToRgba(g.accent, 0.15);
      ctx.beginPath();
      ctx.roundRect(cardW / 2 - pad - 102, -cardH / 2 + pad - 2, 102, 26, 13);
      ctx.fill();
      ctx.fillStyle = g.accent;
      ctx.textAlign = 'center';
      ctx.font = `800 ${Math.round(minDim * 0.025)}px ${family}`;
      ctx.fillText(valStr, cardW / 2 - pad - 51, -cardH / 2 + pad + 11);

      const gx0 = -cardW / 2 + pad + 4;
      const gx1 = cardW / 2 - pad - 4;
      const gy0 = -cardH / 2 + pad + 44;
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
      safeRect(ctx, gx0 - 4, gy0 - 12, (gx1 - gx0 + 8) * drawProg, gy1 - gy0 + 24);
      safeClip(ctx);

      // Soft gradient area underneath line
      if (pts.length >= 2) {
        ctx.fillStyle = safeGradFill(
          ctx,
          0,
          gy0,
          0,
          gy1,
          [
            [0, hexToRgba(g.accent, 0.34)],
            [1, hexToRgba(g.accent, 0.0)],
          ],
          hexToRgba(g.accent, 0.14)
        );
        ctx.beginPath();
        ctx.moveTo(pts[0].x, gy1);
        pts.forEach((pt) => ctx.lineTo(pt.x, pt.y));
        ctx.lineTo(pts[pts.length - 1].x, gy1);
        safeClosePath(ctx);
        ctx.fill();
      }

      ctx.strokeStyle = g.accent;
      ctx.lineWidth = Math.max(3, Math.round(minDim * 0.0055));
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

        ctx.strokeStyle = hexToRgba(g.accent, 0.35);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(dotX, dotY);
        ctx.lineTo(dotX, gy1);
        safeStroke(ctx);

        ctx.fillStyle = hexToRgba(g.accent, 0.25);
        ctx.beginPath();
        safeCircle(ctx, dotX, dotY, Math.max(7, minDim * 0.015));
        ctx.fill();
        ctx.fillStyle = g.accent;
        ctx.beginPath();
        safeCircle(ctx, dotX, dotY, Math.max(4, minDim * 0.008));
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
      drawRoundedCard(ctx, -cardW / 2, -cardH / 2, cardW, cardH, Math.round(cardH * 0.48), palette);

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
      // Wide borderless cinematic chapter reveal with top pill badge + animated edge beam
      const cardW = Math.round(minDim * 0.78);
      const cardH = Math.round(minDim * 0.18);
      const wipe = progressWindow(time, 0.05, 0.44);
      const slideY = (1 - progressWindow(time, 0.04, 0.36)) * 16;

      ctx.save();
      ctx.fillStyle = palette.bg;
      ctx.beginPath();
      ctx.roundRect(-cardW / 2, -cardH / 2, cardW * 0.36, 22, 11);
      ctx.fill();
      ctx.fillStyle = g.accent;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `800 ${Math.round(minDim * 0.017)}px ${family}`;
      ctx.fillText(fitText(ctx, (g.subtitle || 'CHAPTER').toUpperCase(), cardW * 0.32), -cardW / 2 + cardW * 0.18, -cardH / 2 + 11);

      ctx.fillStyle = palette.title;
      ctx.textAlign = 'left';
      ctx.font = `900 ${Math.round(minDim * 0.052)}px ${family}`;
      ctx.fillText(fitText(ctx, titleText, cardW - 16), -cardW / 2 + 4, 8 + slideY);

      ctx.fillStyle = palette.trackBg;
      ctx.beginPath();
      ctx.roundRect(-cardW / 2, cardH / 2 - 6, cardW, 5, 2.5);
      ctx.fill();
      ctx.fillStyle = g.accent;
      ctx.beginPath();
      ctx.roundRect(-cardW / 2, cardH / 2 - 6, cardW * wipe, 5, 2.5);
      ctx.fill();
      ctx.restore();
      ctx.restore();
      return { width: cardW, height: cardH, handlesText: true };
    }

    case 'kpi-grid': {
      const cardW = Math.round(minDim * 0.70);
      const cardH = Math.round(minDim * 0.22);
      const gap = Math.round(minDim * 0.02);
      const colW = (cardW - gap) / 2;
      const bars = g.bars?.length
        ? g.bars.slice(0, 2)
        : [
            { label: 'Views', value: 14200, displayValue: '14.2K' },
            { label: 'Growth', value: 64, displayValue: '+64%' },
          ];
      bars.forEach((b, idx) => {
        const bx = -cardW / 2 + idx * (colW + gap);
        const prog = progressWindow(time, 0.06 + idx * 0.14, 0.55);
        const col = b.color || g.accent;
        drawRoundedCard(ctx, bx, -cardH / 2, colW, cardH, radius, palette);
        ctx.fillStyle = col;
        ctx.fillRect(bx + 14, -cardH / 2 + 14, Math.max(12, (colW - 28) * prog * 0.4), 4);
        ctx.fillStyle = palette.title;
        ctx.textAlign = 'left';
        ctx.font = `800 ${Math.round(minDim * 0.048)}px ${family}`;
        ctx.fillText(fitText(ctx, b.displayValue || formatAnimatedNumber(b.value, prog), colW - 28), bx + 14, -4);
        ctx.fillStyle = palette.muted;
        ctx.font = `600 ${Math.round(minDim * 0.022)}px ${family}`;
        ctx.fillText(fitText(ctx, b.label, colW - 28), bx + 14, cardH * 0.26);
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
        ctx.roundRect(-cardW / 2 + pad, y, cardW - pad * 2, rowH, Math.round(rowH * 0.34));
        ctx.fill();
        ctx.fillStyle = idx === 0 ? g.accent : palette.muted;
        ctx.beginPath();
        ctx.roundRect(-cardW / 2 + pad, y, Math.max(8, (cardW - pad * 2) * pct), rowH, Math.round(rowH * 0.34));
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
      const cardW = Math.round(minDim * 0.62);
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
        const strike = progressWindow(time, 0.16, 0.35);
        ctx.fillStyle = palette.muted;
        ctx.font = `600 ${Math.round(minDim * 0.024)}px ${family}`;
        const oldW = ctx.measureText(g.subtitle).width;
        const ox = -cardW / 2 + pad;
        const oy = -cardH * 0.20;
        ctx.fillText(g.subtitle, ox, oy);
        ctx.strokeStyle = g.accent;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(ox - 2, oy + 2);
        ctx.lineTo(ox + (oldW + 4) * strike, oy - 2);
        safeStroke(ctx);
      }
      ctx.restore();
      return { width: cardW, height: cardH, handlesText: true };
    }

    case 'split-title': {
      // Pure borderless kinetic documentary title lockup with left reveal bar & glowing underline
      const cardW = Math.round(minDim * 0.78);
      const cardH = Math.round(minDim * 0.2);
      const lineProg = progressWindow(time, 0, 0.42);
      const slideIn = (1 - progressWindow(time, 0.08, 0.36)) * 24;

      ctx.save();
      ctx.fillStyle = g.accent;
      ctx.beginPath();
      ctx.roundRect(-cardW / 2, -cardH / 2 + 8, 8, Math.max(12, (cardH - 16) * lineProg), 4);
      ctx.fill();

      ctx.beginPath();
      ctx.roundRect(-cardW / 2 + 22, -cardH / 2 + 8, 128, 22, 11);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `800 ${Math.round(minDim * 0.016)}px ${family}`;
      ctx.fillText(fitText(ctx, (g.subtitle || 'KEY INSIGHT').toUpperCase(), 116), -cardW / 2 + 86, -cardH / 2 + 19);

      ctx.globalAlpha = progressWindow(time, 0.1, 0.32);
      ctx.fillStyle = palette.title;
      ctx.textAlign = 'left';
      ctx.font = `900 ${Math.round(minDim * 0.056)}px ${family}`;
      ctx.fillText(fitText(ctx, titleText, cardW - 32), -cardW / 2 + 22 + slideIn, 14);
      ctx.restore();
      ctx.restore();
      return { width: cardW, height: cardH, handlesText: true };
    }

    case 'marker-highlight': {
      // Vox / Ali Abdaal sweeping highlighter pen strip behind bold text
      const cardW = Math.round(minDim * 0.74);
      const cardH = Math.round(minDim * 0.16);
      drawRoundedCard(ctx, -cardW / 2, -cardH / 2, cardW, cardH, 8, palette);

      const sweep = progressWindow(time, 0.14, 0.48);
      const markH = Math.round(minDim * 0.054);
      ctx.fillStyle = hexToRgba(g.accent, 0.36);
      ctx.beginPath();
      ctx.roundRect(-cardW / 2 + 18, -markH / 2 - 4, Math.max(12, (cardW - 36) * sweep), markH, 6);
      ctx.fill();

      ctx.fillStyle = palette.title;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `800 ${Math.round(minDim * 0.036)}px Georgia, ${family}`;
      ctx.fillText(fitText(ctx, titleText, cardW - 44), 0, g.subtitle ? -6 : 0);

      if (g.subtitle) {
        ctx.fillStyle = palette.muted;
        ctx.font = `600 ${Math.round(minDim * 0.020)}px ${family}`;
        ctx.fillText(fitText(ctx, g.subtitle.toUpperCase(), cardW - 44), 0, cardH * 0.28);
      }
      ctx.restore();
      return { width: cardW, height: cardH, handlesText: true };
    }

    case 'audio-waveform': {
      // Dark/frosted podcast & voiceover 14-bar live audio equalizer dock
      const cardW = Math.round(minDim * 0.68);
      const cardH = Math.round(minDim * 0.15);
      drawRoundedCard(ctx, -cardW / 2, -cardH / 2, cardW, cardH, Math.round(cardH / 2), palette);

      // Left speaker badge
      const avR = Math.round(cardH * 0.33);
      ctx.fillStyle = g.accent;
      ctx.beginPath();
      safeCircle(ctx, -cardW / 2 + avR + 14, 0, avR);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `800 ${Math.round(minDim * 0.018)}px ${family}`;
      ctx.fillText('MIC', -cardW / 2 + avR + 14, 1);

      const tx = -cardW / 2 + avR * 2 + 26;
      ctx.fillStyle = palette.title;
      ctx.textAlign = 'left';
      ctx.font = `700 ${Math.round(minDim * 0.024)}px ${family}`;
      ctx.fillText(fitText(ctx, titleText, cardW * 0.36), tx, g.subtitle ? -cardH * 0.14 : 0);
      if (g.subtitle) {
        ctx.fillStyle = palette.muted;
        ctx.font = `500 ${Math.round(minDim * 0.018)}px ${family}`;
        ctx.fillText(fitText(ctx, g.subtitle, cardW * 0.36), tx, cardH * 0.17);
      }

      // Live animated 14-bar stereo spectrum on the right half
      const barStart = cardW * 0.04;
      const barCount = 14;
      const bw = 5;
      const step = (cardW / 2 - barStart - 22) / barCount;
      for (let i = 0; i < barCount; i++) {
        const wave = 0.25 + 0.75 * Math.abs(Math.sin(time * 5.2 + i * 0.72));
        const bh = Math.max(8, cardH * 0.54 * wave);
        ctx.fillStyle = i % 3 === 0 ? g.accent : hexToRgba(g.accent, 0.65);
        ctx.beginPath();
        ctx.roundRect(barStart + i * step, -bh / 2, bw, bh, bw / 2);
        ctx.fill();
      }
      ctx.restore();
      return { width: cardW, height: cardH, handlesText: true };
    }

    case 'subscribe-cta': {
      // YouTube / Creator Subscribe CTA pill with click-state switch + expanding ripple ring
      const cardW = Math.round(minDim * 0.66);
      const cardH = Math.round(minDim * 0.13);
      drawRoundedCard(ctx, -cardW / 2, -cardH / 2, cardW, cardH, Math.round(cardH / 2), palette);

      const avR = Math.round(cardH * 0.34);
      ctx.fillStyle = g.accent;
      ctx.beginPath();
      safeCircle(ctx, -cardW / 2 + avR + 12, 0, avR);
      ctx.fill();
      drawVectorIcon(ctx, 'user', -cardW / 2 + avR + 12, 0, avR * 1.4, '#ffffff');

      const clicked = time > 0.75;
      const btnScale = time > 0.68 && time < 0.85 ? 0.9 : 1;
      const btnW = Math.round(minDim * 0.2);
      const btnH = Math.round(cardH * 0.6);
      const btnX = cardW / 2 - btnW / 2 - 12;

      if (time > 0.72 && time < 1.25) {
        const rProg = (time - 0.72) / 0.53;
        ctx.strokeStyle = hexToRgba(g.accent, 1 - rProg);
        ctx.lineWidth = 2;
        ctx.beginPath();
        safeCircle(ctx, btnX, 0, 14 + rProg * 28);
        safeStroke(ctx);
      }

      ctx.save();
      ctx.translate(btnX, 0);
      ctx.scale(btnScale, btnScale);
      ctx.fillStyle = clicked ? '#0f172a' : g.accent;
      ctx.beginPath();
      ctx.roundRect(-btnW / 2, -btnH / 2, btnW, btnH, Math.round(btnH / 2));
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `800 ${Math.round(minDim * 0.020)}px ${family}`;
      ctx.fillText(clicked ? 'SUBSCRIBED ✓' : 'SUBSCRIBE', 0, 1);
      ctx.restore();

      const tx = -cardW / 2 + avR * 2 + 24;
      ctx.fillStyle = palette.title;
      ctx.textAlign = 'left';
      ctx.font = `800 ${Math.round(minDim * 0.026)}px ${family}`;
      ctx.fillText(fitText(ctx, titleText, btnX - btnW / 2 - tx - 10), tx, g.subtitle ? -cardH * 0.14 : 0);
      if (g.subtitle) {
        ctx.fillStyle = palette.muted;
        ctx.font = `500 ${Math.round(minDim * 0.019)}px ${family}`;
        ctx.fillText(fitText(ctx, g.subtitle, btnX - btnW / 2 - tx - 10), tx, cardH * 0.17);
      }
      ctx.restore();
      return { width: cardW, height: cardH, handlesText: true };
    }

    case 'article-citation': {
      // Documentary editorial press clipping with redacted filler lines + glowing highlighted thesis sentence
      const cardW = Math.round(minDim * 0.72);
      const cardH = Math.round(minDim * 0.24);
      const pad = Math.round(minDim * 0.024);
      drawRoundedCard(ctx, -cardW / 2, -cardH / 2, cardW, cardH, 10, palette);

      // Publication header pill
      ctx.fillStyle = g.accent;
      ctx.beginPath();
      ctx.roundRect(-cardW / 2 + pad, -cardH / 2 + 12, 130, 18, 9);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `800 ${Math.round(minDim * 0.014)}px ${family}`;
      ctx.fillText(fitText(ctx, (g.subtitle || 'SOURCE REPORT').toUpperCase(), 118), -cardW / 2 + pad + 65, -cardH / 2 + 21);

      // Redacted top context bar
      ctx.fillStyle = palette.trackBg;
      ctx.beginPath();
      ctx.roundRect(-cardW / 2 + pad, -cardH * 0.16, cardW * 0.65, 8, 4);
      ctx.fill();

      // Highlighted focal insight strip
      const mark = progressWindow(time, 0.12, 0.45);
      ctx.fillStyle = hexToRgba(g.accent, 0.24);
      ctx.beginPath();
      ctx.roundRect(-cardW / 2 + pad, 0, Math.max(12, (cardW - pad * 2) * mark), 28, 6);
      ctx.fill();

      ctx.fillStyle = palette.title;
      ctx.textAlign = 'left';
      ctx.font = `700 ${Math.round(minDim * 0.025)}px Georgia, ${family}`;
      ctx.fillText(fitText(ctx, titleText, cardW - pad * 2 - 12), -cardW / 2 + pad + 6, 14);

      // Redacted bottom bar
      ctx.fillStyle = palette.trackBg;
      ctx.beginPath();
      ctx.roundRect(-cardW / 2 + pad, cardH * 0.28, cardW * 0.48, 8, 4);
      ctx.fill();
      ctx.restore();
      return { width: cardW, height: cardH, handlesText: true };
    }

    case 'timer-badge': {
      // Split-second countdown capsule with sweeping timer gauge
      const cardW = Math.round(minDim * 0.56);
      const cardH = Math.round(minDim * 0.13);
      drawRoundedCard(ctx, -cardW / 2, -cardH / 2, cardW, cardH, Math.round(cardH / 2), palette);

      const startSec = g.value ?? 5;
      const frac = 1 - clamp(time / 2.6, 0, 1);
      const rem = Math.max(0, startSec * frac);
      const r = Math.round(cardH * 0.34);
      const rx = -cardW / 2 + r + 14;

      ctx.strokeStyle = palette.trackBg;
      ctx.lineWidth = 4;
      ctx.beginPath();
      safeCircle(ctx, rx, 0, r);
      safeStroke(ctx);

      ctx.strokeStyle = g.accent;
      ctx.lineCap = 'round';
      ctx.beginPath();
      safeCircle(ctx, rx, 0, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
      safeStroke(ctx);

      ctx.fillStyle = palette.title;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `800 ${Math.round(minDim * 0.020)}px monospace`;
      ctx.fillText(rem.toFixed(1), rx, 1);

      const tx = rx + r + 14;
      ctx.textAlign = 'left';
      ctx.font = `800 ${Math.round(minDim * 0.026)}px ${family}`;
      ctx.fillText(fitText(ctx, titleText, cardW / 2 - tx - 14), tx, g.subtitle ? -cardH * 0.14 : 0);
      if (g.subtitle) {
        ctx.fillStyle = palette.muted;
        ctx.font = `500 ${Math.round(minDim * 0.018)}px ${family}`;
        ctx.fillText(fitText(ctx, g.subtitle, cardW / 2 - tx - 14), tx, cardH * 0.17);
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
