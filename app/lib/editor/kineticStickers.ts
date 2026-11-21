import {type EditorProject, type Clip, type CaptionWord, dimensions, uid} from './model';
import {addText, addTrack, addAsset, addClip} from './operations';
import {applyMotionPreset, type MotionPreset} from './keyframes';
import {speechContext} from './speechContext';
import {setMediaAnimation} from './mediaAnimation';
import type {EditDecision} from './ai';

export interface StickerDefinition {
  id: string;
  category: string;
  emoji: string;
  altEmoji?: string;
  keywords: string[];
  accentColor: string;
  name: string;
  svg: string;
}

export const KINETIC_STICKERS_DICTIONARY: Record<string, StickerDefinition> = {
  money: {
    id: 'money',
    category: 'finance',
    emoji: '💰',
    altEmoji: '💸',
    keywords: [
      'money', 'cash', 'dollar', 'dollars', 'bucks', 'revenue', 'profit', 'rich',
      'wealth', 'wealthy', 'expensive', 'earn', 'earning', 'earnings', 'paid',
      'pay', 'cost', 'price', 'income', 'funds', 'million', 'billion', 'crypto',
      'kaching', 'roi', 'investment', 'monetize'
    ],
    accentColor: '#10b981',
    name: 'Money Bag',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
      <circle cx="50" cy="50" r="44" fill="#10b981" />
      <circle cx="50" cy="50" r="38" fill="#059669" />
      <text x="50" y="66" font-family="Arial, sans-serif" font-size="52" font-weight="900" fill="#ffffff" text-anchor="middle">$</text>
    </svg>`
  },
  fire: {
    id: 'fire',
    category: 'hype',
    emoji: '🔥',
    keywords: [
      'fire', 'lit', 'hot', 'insane', 'crazy', 'hyped', 'hype', 'burn',
      'burning', 'trending', 'viral', 'epic', 'wild', 'intense', 'smokin',
      'banger', 'unreal', 'savage'
    ],
    accentColor: '#f97316',
    name: 'Fire Flame',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
      <path d="M50 8 C55 28 72 38 72 58 C72 74 62 88 50 88 C38 88 28 74 28 58 C28 42 42 32 45 20 Z" fill="#ea580c"/>
      <path d="M50 30 C53 42 62 50 62 62 C62 72 56 80 50 80 C44 80 38 72 38 62 C38 52 46 44 48 38 Z" fill="#fbbf24"/>
    </svg>`
  },
  rocket: {
    id: 'rocket',
    category: 'speed',
    emoji: '🚀',
    keywords: [
      'rocket', 'launch', 'launched', 'moon', 'scale', 'scaling', 'fast',
      'faster', 'speed', 'skyrocket', 'blast', 'takeoff', 'exponential',
      'boost', 'speedup', 'accelerate'
    ],
    accentColor: '#6366f1',
    name: 'Rocket Launch',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
      <circle cx="50" cy="50" r="44" fill="#4f46e5"/>
      <path d="M35 65 L65 35 M50 25 L75 25 L75 50" stroke="#ffffff" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
      <polygon points="65,25 75,25 75,35" fill="#ffffff"/>
      <circle cx="35" cy="65" r="7" fill="#fbbf24"/>
    </svg>`
  },
  warning: {
    id: 'warning',
    category: 'alert',
    emoji: '⚠️',
    keywords: [
      'warning', 'warn', 'danger', 'alert', 'caution', 'careful', 'mistake',
      'error', 'stop', 'fail', 'failed', 'avoid', 'trap', 'beware', 'worst',
      'critical', 'problem', 'risk'
    ],
    accentColor: '#f59e0b',
    name: 'Warning Triangle',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
      <polygon points="50,12 90,82 10,82" fill="#f59e0b" stroke="#d97706" stroke-width="4" stroke-linejoin="round"/>
      <line x1="50" y1="36" x2="50" y2="58" stroke="#111827" stroke-width="8" stroke-linecap="round"/>
      <circle cx="50" cy="71" r="5" fill="#111827"/>
    </svg>`
  },
  growth: {
    id: 'growth',
    category: 'analytics',
    emoji: '📈',
    keywords: [
      'growth', 'grow', 'growing', 'chart', 'charts', 'stonks', 'up',
      'increase', 'increasing', '10x', 'progress', 'improve', 'improving',
      'results', 'surge', 'gains', 'metrics', 'doubled'
    ],
    accentColor: '#22c55e',
    name: 'Upward Growth',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
      <rect width="90" height="90" x="5" y="5" rx="18" fill="#15803d"/>
      <polyline points="20,70 42,50 56,60 80,26" fill="none" stroke="#ffffff" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
      <polygon points="68,26 80,26 80,38" fill="#ffffff"/>
    </svg>`
  },
  skull: {
    id: 'skull',
    category: 'dead',
    emoji: '💀',
    keywords: [
      'dead', 'die', 'died', 'kill', 'killed', 'killing', 'skull', 'ruined',
      'ruin', 'destroy', 'destroyed', 'rip', 'loss', 'lost', 'bankrupt',
      'flop', 'nightmare'
    ],
    accentColor: '#94a3b8',
    name: 'Skull Danger',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
      <circle cx="50" cy="50" r="44" fill="#334155"/>
      <ellipse cx="50" cy="44" rx="26" ry="24" fill="#f8fafc"/>
      <rect x="38" y="60" width="24" height="14" rx="4" fill="#f8fafc"/>
      <circle cx="42" cy="44" r="6" fill="#1e293b"/>
      <circle cx="58" cy="44" r="6" fill="#1e293b"/>
      <polygon points="50,52 47,58 53,58" fill="#1e293b"/>
    </svg>`
  },
  heart: {
    id: 'heart',
    category: 'emotion',
    emoji: '❤️',
    keywords: [
      'love', 'loved', 'loving', 'heart', 'passion', 'favorite', 'amazing',
      'care', 'best', 'crush', 'adore', 'grateful', 'thankful', 'obsessed',
      'appreciate'
    ],
    accentColor: '#ef4444',
    name: 'Red Heart',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
      <path d="M50 82 C50 82 15 56 15 32 C15 18 26 12 36 12 C44 12 50 18 50 22 C50 18 56 12 64 12 C74 12 85 18 85 32 C85 56 50 82 50 82 Z" fill="#ef4444"/>
    </svg>`
  },
  star: {
    id: 'star',
    category: 'award',
    emoji: '⭐',
    keywords: [
      'star', 'special', 'win', 'winner', 'winning', 'super', 'golden',
      'first', 'top', 'champion', 'best', 'perfect', 'flawless', 'vip',
      'mastery', 'number1', '#1'
    ],
    accentColor: '#eab308',
    name: 'Golden Star',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
      <polygon points="50,10 62,38 92,38 68,56 77,84 50,68 23,84 32,56 8,38 38,38" fill="#eab308" stroke="#ca8a04" stroke-width="3" stroke-linejoin="round"/>
    </svg>`
  },
  target: {
    id: 'target',
    category: 'focus',
    emoji: '🎯',
    keywords: [
      'target', 'goal', 'goals', 'focus', 'focused', 'aim', 'exact',
      'exactly', 'hit', 'nailed', 'precision', 'bullseye', 'mission',
      'objective', 'achieve'
    ],
    accentColor: '#ec4899',
    name: 'Bullseye Target',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
      <circle cx="50" cy="50" r="44" fill="#ec4899"/>
      <circle cx="50" cy="50" r="32" fill="#ffffff"/>
      <circle cx="50" cy="50" r="20" fill="#ec4899"/>
      <circle cx="50" cy="50" r="8" fill="#ffffff"/>
    </svg>`
  },
  idea: {
    id: 'idea',
    category: 'insight',
    emoji: '💡',
    keywords: [
      'idea', 'think', 'thought', 'thinking', 'insight', 'smart', 'brain',
      'eureka', 'tip', 'strategy', 'solution', 'secret', 'hack', 'genius',
      'concept', 'key'
    ],
    accentColor: '#fbbf24',
    name: 'Lightbulb Idea',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
      <circle cx="50" cy="44" r="28" fill="#fbbf24"/>
      <path d="M38 60 L62 60 L58 74 L42 74 Z" fill="#94a3b8"/>
      <rect x="44" y="74" width="12" height="6" rx="3" fill="#64748b"/>
      <line x1="50" y1="8" x2="50" y2="2" stroke="#f59e0b" stroke-width="4" stroke-linecap="round"/>
      <line x1="24" y1="18" x2="19" y2="13" stroke="#f59e0b" stroke-width="4" stroke-linecap="round"/>
      <line x1="76" y1="18" x2="81" y2="13" stroke="#f59e0b" stroke-width="4" stroke-linecap="round"/>
    </svg>`
  }
};

/**
 * Normalizes an utterance word and matches it against the sticker dictionary.
 */
export function lookupSticker(rawWord: string): StickerDefinition | undefined {
  if (!rawWord || typeof rawWord !== 'string') return undefined;
  const clean = rawWord.toLowerCase().replace(/[^a-z0-9#]/g, '');
  if (!clean) return undefined;

  for (const def of Object.values(KINETIC_STICKERS_DICTIONARY)) {
    if (def.keywords.includes(clean)) {
      return def;
    }
  }
  return undefined;
}

export interface KeywordPunchMoment {
  word: string;
  cleanWord: string;
  startTime: number;
  duration: number;
  sticker: StickerDefinition;
}

export interface DetectionOptions {
  minInterval?: number; // Minimum cooldown between punch moments in seconds
  maxStickers?: number; // Maximum stickers to detect
  allowedCategories?: string[];
}

/**
 * Detects punch moments in spoken transcript words mapped to kinetic stickers.
 */
export function detectKeywordMoments(
  words: CaptionWord[],
  options?: DetectionOptions
): KeywordPunchMoment[] {
  if (!Array.isArray(words) || !words.length) return [];

  const minInterval = options?.minInterval ?? 1.4;
  const maxStickers = options?.maxStickers ?? 8;
  const allowed = options?.allowedCategories ? new Set(options.allowedCategories) : undefined;

  const moments: KeywordPunchMoment[] = [];
  let lastMomentStart = -999;

  for (const w of words) {
    if (moments.length >= maxStickers) break;
    const sticker = lookupSticker(w.word);
    if (!sticker) continue;
    if (allowed && !allowed.has(sticker.category)) continue;

    // Check cooldown interval
    if (w.start < lastMomentStart + minInterval) continue;

    const cleanWord = w.word.toLowerCase().replace(/[^a-z0-9]/g, '');
    const startTime = Math.max(0, w.start - 0.04);
    const wordDur = Math.max(0.25, (w.end || w.start + 0.3) - w.start);
    const duration = Math.max(0.9, Math.min(1.6, wordDur + 0.8));

    moments.push({
      word: w.word,
      cleanWord,
      startTime,
      duration,
      sticker
    });
    lastMomentStart = startTime;
  }

  return moments;
}

export interface KineticStickerOptions {
  mode?: 'text-emoji' | 'svg-callout' | 'graphic';
  motion?: MotionPreset;
  maxStickers?: number;
  minInterval?: number;
}

/**
 * Generates an SVG data asset for lightweight animated vector callouts.
 */
export function createSvgStickerAsset(sticker: StickerDefinition) {
  const assetId = `sticker-asset-${sticker.id}-${uid()}`;
  const svgDataUrl = `data:image/svg+xml;utf8,${encodeURIComponent(sticker.svg)}`;
  return {
    id: assetId,
    name: `Sticker: ${sticker.name}`,
    kind: 'image' as const,
    mime: 'image/svg+xml',
    size: sticker.svg.length,
    duration: 5,
    width: 200,
    height: 200,
    url: svgDataUrl
  };
}

/**
 * Applies detected kinetic sticker moments onto the project timeline.
 * Placed clips use 'pop' motion preset and prominent kinetic sizing.
 */
export function applyKineticStickers(
  project: EditorProject,
  moments: KeywordPunchMoment[],
  options?: KineticStickerOptions
): { project: EditorProject; placedClipIds: string[] } {
  if (!moments.length) {
    return { project, placedClipIds: [] };
  }

  const mode = options?.mode ?? 'text-emoji';
  const motion: MotionPreset = options?.motion ?? 'pop';
  const placedClipIds: string[] = [];

  let nextProject = project;

  if (mode === 'svg-callout') {
    // Insert as SVG image overlay on an overlay track
    let overlayTrack = nextProject.trackOrder
      .map(id => nextProject.tracks[id])
      .find(t => ['overlay', 'image'].includes(t.kind) && !t.locked && !t.hidden);

    if (!overlayTrack) {
      nextProject = addTrack(nextProject, 'overlay');
      overlayTrack = nextProject.tracks[nextProject.trackOrder.at(-1)!];
    }

    for (const moment of moments) {
      const asset = createSvgStickerAsset(moment.sticker);
      nextProject = addAsset(nextProject, asset);
      const beforeClips = new Set(Object.keys(nextProject.clips));

      nextProject = addClip(nextProject, asset.id, overlayTrack.id, moment.startTime, {
        duration: moment.duration,
        transform: { x: 0.26, y: -0.22, scale: 0.28, rotation: 0, opacity: 1 },
        volume: 0
      });

      const newId = Object.keys(nextProject.clips).find(id => !beforeClips.has(id));
      if (newId) {
        nextProject = applyMotionPreset(nextProject, newId, motion);
        placedClipIds.push(newId);
      }
    }
  } else {
    // Insert as large, animated kinetic text emoji sticker
    let textTrack = nextProject.trackOrder
      .map(id => nextProject.tracks[id])
      .find(t => t.kind === 'text' && !t.locked && !t.hidden);

    if (!textTrack) {
      nextProject = addTrack(nextProject, 'text');
      textTrack = nextProject.tracks[nextProject.trackOrder.at(-1)!];
    }

    const [w, h] = dimensions[nextProject.settings.aspectRatio];
    const fontSize = Math.round(Math.min(w, h) * 0.12);

    for (let i = 0; i < moments.length; i++) {
      const moment = moments[i];
      const beforeClips = new Set(Object.keys(nextProject.clips));

      // Dynamic alternating position (upper right / upper left / center)
      const posX = i % 2 === 0 ? 0.24 : -0.24;
      const posY = -0.24;

      nextProject = addText(
        nextProject,
        moment.sticker.emoji,
        moment.startTime,
        {
          font: 'Inter',
          size: fontSize,
          align: 'center',
          color: '#ffffff',
          background: 'transparent'
        },
        false,
        moment.duration,
        textTrack.id
      );

      const newId = Object.keys(nextProject.clips).find(id => !beforeClips.has(id));
      if (newId) {
        const c = nextProject.clips[newId];
        nextProject = {
          ...nextProject,
          clips: {
            ...nextProject.clips,
            [newId]: {
              ...c,
              name: `Sticker: ${moment.sticker.name}`,
              transform: { ...c.transform, x: posX, y: posY }
            }
          }
        };
        nextProject = applyMotionPreset(nextProject, newId, motion);
        if (c.assetId && ['video', 'image'].includes(nextProject.assets[c.assetId]?.kind)) {
          nextProject = setMediaAnimation(nextProject, newId, {
            entrance: 'pop',
            exit: 'zoom-out',
            loop: 'pulse',
            entranceDuration: 0.25,
            exitDuration: 0.25,
            loopDuration: 1.5,
            easing: 'overshoot'
          });
        }
        placedClipIds.push(newId);
      }
    }
  }

  return { project: nextProject, placedClipIds };
}

/**
 * High-level helper: inspects project speechContext, detects keyword punch moments,
 * and applies kinetic animated stickers seamlessly.
 */
export function detectAndApplyKineticStickers(
  project: EditorProject,
  options?: KineticStickerOptions
): { project: EditorProject; placedCount: number; moments: KeywordPunchMoment[] } {
  const words = speechContext(project).flatMap(c => c.words || []);
  const moments = detectKeywordMoments(words, {
    maxStickers: options?.maxStickers ?? 6,
    minInterval: options?.minInterval ?? 1.5
  });

  if (!moments.length) {
    return { project, placedCount: 0, moments: [] };
  }

  const result = applyKineticStickers(project, moments, options);
  return {
    project: result.project,
    placedCount: result.placedClipIds.length,
    moments
  };
}

/**
 * Builds EditDecision objects for model reconciler or EDL plans.
 */
export function createStickerDecisions(
  moments: KeywordPunchMoment[],
  format: 'graphic' | 'text' = 'graphic'
): EditDecision[] {
  if (format === 'graphic') {
    return moments.map(m => ({
      op: 'addGraphic',
      kind: 'callout' as const,
      text: `${m.sticker.emoji} ${m.cleanWord.toUpperCase()}`,
      startTime: m.startTime,
      duration: m.duration,
      accent: m.sticker.accentColor,
      motion: 'pop' as MotionPreset
    }));
  }

  return moments.map(m => ({
    op: 'addText',
    text: m.sticker.emoji,
    startTime: m.startTime,
    placementId: 'title-center' as const,
    style: {
      size: 64,
      align: 'center' as const,
      background: 'transparent'
    }
  }));
}
