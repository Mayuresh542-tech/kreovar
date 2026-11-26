import type { MotionPreset } from './keyframes';
import type {
  GraphicBar,
  GraphicComparison,
  GraphicIcon,
  GraphicKind,
  GraphicTheme,
} from './motionGraphics';

export type MotionTemplateCategory =
  | 'All'
  | 'Data & Charts'
  | 'Lists & Explainers'
  | 'Broadcast & Social'
  | 'Callouts & Offers';

export const MOTION_TEMPLATE_CATEGORIES: MotionTemplateCategory[] = [
  'All',
  'Data & Charts',
  'Lists & Explainers',
  'Broadcast & Social',
  'Callouts & Offers',
];

export interface KreovarMotionTemplate {
  id: string;
  name: string;
  category: Exclude<MotionTemplateCategory, 'All'>;
  kind: GraphicKind;
  description: string;
  text: string;
  subtitle?: string;
  accent: string;
  theme: GraphicTheme;
  icon?: GraphicIcon;
  motion: MotionPreset;
  value?: number;
  prefix?: string;
  suffix?: string;
  items?: string[];
  bars?: GraphicBar[];
  comparison?: GraphicComparison;
  targetX?: number;
  targetY?: number;
}

/**
 * 18 editable motion-graphic templates inspired by iart-ai/motion-skills craft
 * (light surfaces by default, ease-out settle, tabular counters, and clear visual hierarchy).
 */
export const KREOVAR_MOTION_TEMPLATES: KreovarMotionTemplate[] = [
  {
    id: 'stat-hero-counter',
    name: 'Hero Stat Counter',
    category: 'Data & Charts',
    kind: 'stat-counter',
    description: 'Animated tabular count-up with prefix, suffix & bottom progress bar',
    text: 'Revenue Growth',
    subtitle: 'Year-over-year performance',
    accent: '#0284c7',
    theme: 'clean-light',
    icon: 'chart',
    motion: 'pop',
    value: 245,
    prefix: '+',
    suffix: '%',
  },
  {
    id: 'progress-ring-goal',
    name: 'Circular Progress Ring',
    category: 'Data & Charts',
    kind: 'progress-ring',
    description: 'Smooth radial arc sweep for scores, completion & milestones',
    text: 'Retention Rate',
    subtitle: 'First 30 seconds watched',
    accent: '#7c3aed',
    theme: 'clean-light',
    icon: 'target',
    motion: 'slide-up',
    value: 84,
    suffix: '%',
  },
  {
    id: 'bar-chart-metrics',
    name: 'Metrics Bar Chart',
    category: 'Data & Charts',
    kind: 'bar-chart',
    description: 'Staggered horizontal bars comparing 3 metrics side by side',
    text: 'Channel Performance',
    accent: '#2563eb',
    theme: 'clean-light',
    motion: 'slide-up',
    bars: [
      { label: 'Reels', value: 88, displayValue: '88K' },
      { label: 'Shorts', value: 64, displayValue: '64K' },
      { label: 'TikTok', value: 52, displayValue: '52K' },
    ],
  },
  {
    id: 'line-trend-sparkline',
    name: 'Growth Line Sparkline',
    category: 'Data & Charts',
    kind: 'line-chart',
    description: 'Draw-on trend curve with moving tracker dot & KPI headline',
    text: 'Monthly Subscribers',
    subtitle: 'Last 4 weeks momentum',
    accent: '#059669',
    theme: 'clean-light',
    motion: 'slide-up',
    value: 18400,
    prefix: '+',
    bars: [
      { label: 'W1', value: 25 },
      { label: 'W2', value: 44 },
      { label: 'W3', value: 61 },
      { label: 'W4', value: 94 },
    ],
  },
  {
    id: 'kpi-split-grid',
    name: '2-Up KPI Scorecard',
    category: 'Data & Charts',
    kind: 'kpi-grid',
    description: 'Two side-by-side stat tiles for before/after numbers',
    text: 'Campaign Snapshot',
    accent: '#0284c7',
    theme: 'frosted-glass',
    motion: 'pop',
    bars: [
      { label: 'Avg Watch', value: 78, displayValue: '78%' },
      { label: 'New Leads', value: 420, displayValue: '+420' },
    ],
  },
  {
    id: 'animated-checklist',
    name: 'Animated Checklist',
    category: 'Lists & Explainers',
    kind: 'checklist',
    description: 'Sequentially popping checkmarks with clean key takeaways',
    text: '3 Rules For Viral Hooks',
    accent: '#10b981',
    theme: 'clean-light',
    motion: 'slide-up',
    items: ['Open with a visual pattern break', 'Cut dead air in under 0.3s', 'Pay off the promise fast'],
  },
  {
    id: 'step-flow-sequence',
    name: '3-Step Process Flow',
    category: 'Lists & Explainers',
    kind: 'step-flow',
    description: 'Numbered badge list explaining any workflow step by step',
    text: 'How It Works',
    accent: '#7c3aed',
    theme: 'clean-light',
    motion: 'slide-up',
    items: ['Drop raw footage', 'AI writes timed beats', 'Export crisp 1080p'],
  },
  {
    id: 'timeline-milestones',
    name: 'Milestone Timeline',
    category: 'Lists & Explainers',
    kind: 'timeline-steps',
    description: 'Connected progress rail with numbered node pops',
    text: 'Creator Roadmap',
    accent: '#f59e0b',
    theme: 'editorial-paper',
    motion: 'slide-up',
    items: ['Hook (0:00)', 'Proof (0:15)', 'CTA (0:45)'],
  },
  {
    id: 'before-after-vs',
    name: 'Before vs After VS',
    category: 'Lists & Explainers',
    kind: 'comparison',
    description: 'Split comparison card contrasting Old Way vs New Way',
    text: 'Editing Workflow',
    accent: '#ef4444',
    theme: 'clean-light',
    motion: 'pop',
    comparison: {
      leftTitle: 'Manual Cut',
      leftValue: '4 Hours',
      rightTitle: 'AI Workflow',
      rightValue: '6 Minutes',
    },
  },
  {
    id: 'creator-lower-third',
    name: 'Broadcast Lower Third',
    category: 'Broadcast & Social',
    kind: 'lower-third',
    description: 'Clean broadcast accent bar wipe with Speaker Name & Role',
    text: 'Aarav Mehta',
    subtitle: 'Product Designer & Filmmaker',
    accent: '#0284c7',
    theme: 'clean-light',
    icon: 'user',
    motion: 'slide-left',
  },
  {
    id: 'social-follow-pill',
    name: 'Subscribe / Follow Card',
    category: 'Broadcast & Social',
    kind: 'social-follow',
    description: 'Creator handle card with animated Follow button pop',
    text: '@kreovar.studio',
    subtitle: 'Daily editing tips & motion templates',
    accent: '#e11d48',
    theme: 'clean-light',
    icon: 'sparkles',
    motion: 'slide-up',
    prefix: 'Follow',
  },
  {
    id: 'chapter-title-reveal',
    name: 'Kinetic Chapter Card',
    category: 'Broadcast & Social',
    kind: 'chapter-card',
    description: 'Bold section opener with eyebrow label & animated underline wipe',
    text: 'The Big Secret',
    subtitle: 'PART 02 · RETENTION',
    accent: '#0284c7',
    theme: 'editorial-paper',
    motion: 'slide-up',
  },
  {
    id: 'notification-toast',
    name: 'Live Notification Toast',
    category: 'Broadcast & Social',
    kind: 'notification',
    description: 'Sleek alert pill for milestones, messages & payment pings',
    text: 'New Milestone Unlocked',
    subtitle: '100,000 views reached in 24h',
    accent: '#059669',
    theme: 'frosted-glass',
    icon: 'bolt',
    motion: 'pop',
  },
  {
    id: 'audience-poll-card',
    name: 'Audience Poll Card',
    category: 'Broadcast & Social',
    kind: 'poll-card',
    description: 'Interactive-style poll card with animated vote bars',
    text: 'Which pacing works best?',
    accent: '#7c3aed',
    theme: 'clean-light',
    motion: 'pop',
    bars: [
      { label: 'Fast cuts + zoom', value: 74 },
      { label: 'Calm cinematic', value: 26 },
    ],
  },
  {
    id: 'pointer-arrow-callout',
    name: 'Pointer Callout Arrow',
    category: 'Callouts & Offers',
    kind: 'pointer-callout',
    description: 'Animated leader arrow & target ring pointing to any detail',
    text: 'Look At This Detail',
    subtitle: 'Key visual cue',
    accent: '#f59e0b',
    theme: 'dark-slate',
    motion: 'pop',
    targetX: 0,
    targetY: 0.25,
  },
  {
    id: 'editorial-quote-card',
    name: 'Editorial Quote Card',
    category: 'Callouts & Offers',
    kind: 'quote-card',
    description: 'Serif quotation mark & clean attribution card for memorable lines',
    text: 'Clarity beats complexity every time.',
    subtitle: 'Design Principle #1',
    accent: '#0284c7',
    theme: 'editorial-paper',
    motion: 'slide-up',
  },
  {
    id: 'kinetic-hook-badge',
    name: 'Kinetic Hook Badge',
    category: 'Callouts & Offers',
    kind: 'kinetic-badge',
    description: 'High-contrast pill tag with popping icon for 1-3 word callouts',
    text: 'PRO TIP',
    accent: '#7c3aed',
    theme: 'dark-slate',
    icon: 'sparkles',
    motion: 'pop',
  },
  {
    id: 'promo-offer-tag',
    name: 'Price / Offer Promo Tag',
    category: 'Callouts & Offers',
    kind: 'offer-tag',
    description: 'Strikethrough old price vs animated offer price & savings badge',
    text: '40% OFF',
    subtitle: '$99',
    accent: '#e11d48',
    theme: 'clean-light',
    motion: 'pop',
    value: 59,
    prefix: '$',
    suffix: '/mo',
  },
];
