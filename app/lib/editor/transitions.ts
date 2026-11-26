import type { Transition } from "./model";

export const TRANSITION_CATEGORIES = [
  { id: "basic", label: "Basic & Light", description: "Dissolves, exposure flashes, light leaks, and film burns" },
  { id: "blur", label: "Blur & Glow", description: "Gaussian, directional, zoom, radial blurs, and dream glows" },
  { id: "slide", label: "Slide & Whip", description: "Directional slides, high-speed whip pans, and elastic pushes" },
  { id: "zoom", label: "Zoom & Pull", description: "Optical push-ins, pull-outs, lens warps, and punch cuts" },
  { id: "spin", label: "Spin & 3D", description: "Edge-filled spins, 3D card flips, and whip rolls" },
  { id: "glitch", label: "Shake & Glitch", description: "S-shakes, bass thumps, RGB splits, slices, pixelation, and ghosts" },
  { id: "wipe", label: "Wipes & Shapes", description: "Directional, diagonal, iris, clock, barn-door, and blind reveals" },
] as const;

export type TransitionCategory = (typeof TRANSITION_CATEGORIES)[number]["id"];

export type TransitionEasing = "linear" | "easeIn" | "easeOut" | "easeInOut" | "expoOut" | "snap";

export type TransitionDirection = "auto" | "left" | "right" | "up" | "down";

export const TRANSITION_KINDS = [
  "fade",
  "dissolve",
  "flash-white",
  "flash-black",
  "exposure-flash",
  "luma-dissolve",
  "light-leak",
  "film-burn",
  "gaussian-blur",
  "directional-blur",
  "zoom-blur",
  "radial-blur",
  "dream-glow",
  "slide",
  "slide-right",
  "slide-up",
  "slide-down",
  "whip-left",
  "whip-right",
  "whip-up",
  "whip-down",
  "push-left",
  "zoom",
  "zoom-out",
  "pull-in",
  "pull-out",
  "lens-zoom",
  "spin-left",
  "spin-right",
  "flip-x",
  "flip-y",
  "tilt-whip",
  "camera-shake",
  "impact-punch",
  "glitch-rgb",
  "glitch-slice",
  "pixelate-dissolve",
  "ghost-echo",
  "wipe-left",
  "wipe-right",
  "wipe-diagonal",
  "circle-iris",
  "clock-wipe",
  "barn-door",
  "blinds",
  "diamond-iris",
  "split-horizontal",
] as const;

export type TransitionKind = (typeof TRANSITION_KINDS)[number];

export interface TransitionClipMask {
  shape:
    | "wipe-left"
    | "wipe-right"
    | "wipe-up"
    | "wipe-down"
    | "wipe-diagonal"
    | "circle-iris"
    | "clock-wipe"
    | "barn-door"
    | "blinds"
    | "diamond-iris"
    | "split-horizontal";
  progress: number;
  feather?: number;
}

export interface TransitionOverlayFlash {
  color: string;
  opacity: number;
  mode?: "source-over" | "screen" | "lighter";
  gradient?: "radial" | "side-leak" | "edge-burn";
}

export interface TransitionLayerPose {
  opacity: number;
  x: number;
  y: number;
  scale: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  blur: number;
  brightness: number;
  contrast: number;
  saturation: number;
  rgbOffset: number;
  pixelate: number;
  glitchSlices: number;
  ghostEcho: number;
  skewX: number;
  clipMask?: TransitionClipMask;
}

export interface TransitionEvaluation {
  outgoing: TransitionLayerPose;
  incoming: TransitionLayerPose;
  overlayFlash?: TransitionOverlayFlash;
}

export interface TransitionSpec {
  id: TransitionKind;
  name: string;
  category: TransitionCategory;
  shortDesc: string;
  defaultDuration: number;
  minDuration: number;
  maxDuration: number;
  defaultEasing: TransitionEasing;
  isOverlap: boolean;
  recommendedSfx: string | null;
  sfxOffsetSec: number;
  whenToUse: string;
  whereToUse: string;
  avoidWhen: string;
}

export const TRANSITION_CATALOG: readonly TransitionSpec[] = [
  {
    id: "fade",
    name: "Dip to Black",
    category: "basic",
    shortDesc: "Fade out to black then fade back in",
    defaultDuration: 0.6,
    minDuration: 0.3,
    maxDuration: 1.5,
    defaultEasing: "easeInOut",
    isOverlap: false,
    recommendedSfx: null,
    sfxOffsetSec: 0,
    whenToUse: "Major chapter breaks, passage of time, closing mood reset",
    whereToUse: "Between distinct acts, intro-to-body breaks, outro lead-ins",
    avoidWhen: "Fast-paced talking-head cuts or high-energy montages",
  },
  {
    id: "dissolve",
    name: "Mix / Cross Dissolve",
    category: "basic",
    shortDesc: "Smooth optical blend between adjacent shots",
    defaultDuration: 0.45,
    minDuration: 0.2,
    maxDuration: 1.2,
    defaultEasing: "easeInOut",
    isOverlap: true,
    recommendedSfx: "soft-whoosh",
    sfxOffsetSec: -0.1,
    whenToUse: "Gentle location/mood changes, storytelling, memories, peaceful B-roll",
    whereToUse: "Narrative B-roll sequences, scenic cuts, before-and-after reveals",
    avoidWhen: "Two nearly identical talking-head angles (looks like a mistake)",
  },
  {
    id: "flash-white",
    name: "White Flash",
    category: "basic",
    shortDesc: "Snappy white camera-flash burst across the cut",
    defaultDuration: 0.26,
    minDuration: 0.14,
    maxDuration: 0.55,
    defaultEasing: "snap",
    isOverlap: false,
    recommendedSfx: "soft-click",
    sfxOffsetSec: -0.04,
    whenToUse: "Photo/memory drops, beat-synced reveals, hype hook cuts",
    whereToUse: "Beat hits, outfit/product transformations, photo montages",
    avoidWhen: "Quiet dialogue or sad/somber documentary moments",
  },
  {
    id: "flash-black",
    name: "Black Blink",
    category: "basic",
    shortDesc: "Crisp dark shutter blink between two shots",
    defaultDuration: 0.28,
    minDuration: 0.14,
    maxDuration: 0.6,
    defaultEasing: "snap",
    isOverlap: false,
    recommendedSfx: "low-impact",
    sfxOffsetSec: -0.02,
    whenToUse: "Rhythmic hard-hit montage resets, moody edits, suspense beats",
    whereToUse: "Dark aesthetic reels, sports hype cuts, drum/bass drops",
    avoidWhen: "Bright airy explainer slides or calm tutorials",
  },
  {
    id: "exposure-flash",
    name: "Exposure Surge",
    category: "basic",
    shortDesc: "Overexposure gamma bloom peak across the seam",
    defaultDuration: 0.35,
    minDuration: 0.18,
    maxDuration: 0.7,
    defaultEasing: "easeInOut",
    isOverlap: true,
    recommendedSfx: "soft-whoosh",
    sfxOffsetSec: -0.1,
    whenToUse: "Daylight outdoor B-roll, fashion lookbooks, energetic reveals",
    whereToUse: "Sunny lifestyle clips, travel transitions, peak chorus hits",
    avoidWhen: "Already clipped overexposed footage or screen recordings",
  },
  {
    id: "luma-dissolve",
    name: "Luma Dissolve",
    category: "basic",
    shortDesc: "High-contrast luminance-driven blend",
    defaultDuration: 0.55,
    minDuration: 0.25,
    maxDuration: 1.2,
    defaultEasing: "easeInOut",
    isOverlap: true,
    recommendedSfx: "soft-whoosh",
    sfxOffsetSec: -0.15,
    whenToUse: "Cinematic travel, music-driven atmosphere, moody product shots",
    whereToUse: "Between darker interior shots and bright exteriors",
    avoidWhen: "UI/text-heavy SaaS screen demos",
  },
  {
    id: "light-leak",
    name: "Light Leak",
    category: "basic",
    shortDesc: "Warm amber film-gate leak sweep over the cut",
    defaultDuration: 0.55,
    minDuration: 0.3,
    maxDuration: 1.1,
    defaultEasing: "easeInOut",
    isOverlap: true,
    recommendedSfx: "sparkle",
    sfxOffsetSec: -0.15,
    whenToUse: "Warm nostalgia, wedding/travel vlogs, golden-hour aesthetics",
    whereToUse: "Outdoor travel clips, creator lifestyle vlogs, nostalgic montages",
    avoidWhen: "Cold corporate tech explainers or code walkthroughs",
  },
  {
    id: "film-burn",
    name: "Film Burn",
    category: "basic",
    shortDesc: "Hot amber-red celluloid burn edge flash",
    defaultDuration: 0.45,
    minDuration: 0.22,
    maxDuration: 0.9,
    defaultEasing: "easeInOut",
    isOverlap: true,
    recommendedSfx: "soft-whoosh",
    sfxOffsetSec: -0.1,
    whenToUse: "Vintage film edits, throwback stories, skate/street reels",
    whereToUse: "Retro montages, flash-back sequences, analog aesthetic cuts",
    avoidWhen: "Clean minimalist SaaS UI demonstrations",
  },
  {
    id: "gaussian-blur",
    name: "Blur Dissolve",
    category: "blur",
    shortDesc: "Optical defocus peak that sharpens into the next clip",
    defaultDuration: 0.45,
    minDuration: 0.2,
    maxDuration: 1.0,
    defaultEasing: "easeInOut",
    isOverlap: true,
    recommendedSfx: "soft-whoosh",
    sfxOffsetSec: -0.12,
    whenToUse: "Clean modern explainers, studio focus pulls, smooth B-roll bridges",
    whereToUse: "Talking-head to B-roll transitions, workspace/setup showcases",
    avoidWhen: "Back-to-back micro cuts under 0.8s",
  },
  {
    id: "directional-blur",
    name: "Motion Streak Blur",
    category: "blur",
    shortDesc: "Horizontal velocity blur streak across the cut",
    defaultDuration: 0.28,
    minDuration: 0.15,
    maxDuration: 0.6,
    defaultEasing: "expoOut",
    isOverlap: true,
    recommendedSfx: "fast-swish",
    sfxOffsetSec: -0.1,
    whenToUse: "Dynamic commercial cuts, product feature hops, sneaker/tech reels",
    whereToUse: "Fast side-to-side action shots or UI feature switches",
    avoidWhen: "Meditative slow-cinema shots",
  },
  {
    id: "zoom-blur",
    name: "Zoom Blur",
    category: "blur",
    shortDesc: "High-energy optical push with radial blur burst",
    defaultDuration: 0.3,
    minDuration: 0.16,
    maxDuration: 0.65,
    defaultEasing: "snap",
    isOverlap: true,
    recommendedSfx: "fast-swish",
    sfxOffsetSec: -0.1,
    whenToUse: "Shorts/TikTok hooks, hype B-roll hits, dramatic subject entry",
    whereToUse: "Wide-to-close-up cuts, hook-to-reveal beats, gaming/fitness",
    avoidWhen: "Overusing on every single cut in a 60s tutorial",
  },
  {
    id: "radial-blur",
    name: "Swirl Radial Blur",
    category: "blur",
    shortDesc: "Rotational blur vortex bridging two shots",
    defaultDuration: 0.36,
    minDuration: 0.2,
    maxDuration: 0.75,
    defaultEasing: "easeInOut",
    isOverlap: true,
    recommendedSfx: "fast-swish",
    sfxOffsetSec: -0.12,
    whenToUse: "Music video transitions, creative dance/motion cuts, trippy visuals",
    whereToUse: "High-movement lifestyle clips or energetic chorus bridges",
    avoidWhen: "Text-heavy slides or talking-head interviews",
  },
  {
    id: "dream-glow",
    name: "Dream Halo Glow",
    category: "blur",
    shortDesc: "Soft halation bloom and luminous crossfade",
    defaultDuration: 0.55,
    minDuration: 0.3,
    maxDuration: 1.1,
    defaultEasing: "easeInOut",
    isOverlap: true,
    recommendedSfx: "soft-whoosh",
    sfxOffsetSec: -0.12,
    whenToUse: "Beauty, skincare, aesthetic vlogs, dreamy portraits",
    whereToUse: "Close-up portraits, slow-mo B-roll, romantic scenes",
    avoidWhen: "Hard-hitting industrial/cyberpunk edits",
  },
  {
    id: "slide",
    name: "Slide Left",
    category: "slide",
    shortDesc: "Clean lateral push incoming from the right",
    defaultDuration: 0.38,
    minDuration: 0.18,
    maxDuration: 0.8,
    defaultEasing: "easeInOut",
    isOverlap: true,
    recommendedSfx: "soft-whoosh",
    sfxOffsetSec: -0.1,
    whenToUse: "Step-by-step carousel flows, UI cards, sequential tutorials",
    whereToUse: "Next-step cards, slide-deck steps, product comparisons",
    avoidWhen: "Static talking head where camera shouldn't physically shove",
  },
  {
    id: "slide-right",
    name: "Slide Right",
    category: "slide",
    shortDesc: "Clean lateral push incoming from the left",
    defaultDuration: 0.38,
    minDuration: 0.18,
    maxDuration: 0.8,
    defaultEasing: "easeInOut",
    isOverlap: true,
    recommendedSfx: "soft-whoosh",
    sfxOffsetSec: -0.1,
    whenToUse: "Returning to previous context, comparisons, alternating layouts",
    whereToUse: "Back-and-forth demos, flashback/current-day toggles",
    avoidWhen: "Static face-to-camera mid-sentence cuts",
  },
  {
    id: "slide-up",
    name: "Slide Up",
    category: "slide",
    shortDesc: "Vertical swipe lifting incoming clip from below",
    defaultDuration: 0.36,
    minDuration: 0.18,
    maxDuration: 0.8,
    defaultEasing: "easeOut",
    isOverlap: true,
    recommendedSfx: "soft-whoosh",
    sfxOffsetSec: -0.1,
    whenToUse: "Vertical Shorts/Reels card flips, escalation sequences, new topics",
    whereToUse: "TikTok/Reels topic switches, mobile UI demo transitions",
    avoidWhen: "Horizontal whip sequences",
  },
  {
    id: "slide-down",
    name: "Slide Down",
    category: "slide",
    shortDesc: "Vertical swipe dropping incoming clip from above",
    defaultDuration: 0.36,
    minDuration: 0.18,
    maxDuration: 0.8,
    defaultEasing: "easeOut",
    isOverlap: true,
    recommendedSfx: "soft-whoosh",
    sfxOffsetSec: -0.1,
    whenToUse: "Drop-down reveals, list escalations, mobile scroll-back cuts",
    whereToUse: "App previews, ranking countdowns, vertical story arcs",
    avoidWhen: "Long cinematic wide shots",
  },
  {
    id: "whip-left",
    name: "Whip Pan Left",
    category: "slide",
    shortDesc: "CapCut signature fast leftward camera whip with blur",
    defaultDuration: 0.24,
    minDuration: 0.14,
    maxDuration: 0.45,
    defaultEasing: "snap",
    isOverlap: true,
    recommendedSfx: "fast-swish",
    sfxOffsetSec: -0.09,
    whenToUse: "High-energy creator vlogs, travel/city jumps, dynamic B-roll pace",
    whereToUse: "Outdoor travel clips, matching camera panning motion, hook pivots",
    avoidWhen: "Back-to-back whip cuts without breathing clips",
  },
  {
    id: "whip-right",
    name: "Whip Pan Right",
    category: "slide",
    shortDesc: "Fast rightward whip pan with motion streak & chromatic kiss",
    defaultDuration: 0.24,
    minDuration: 0.14,
    maxDuration: 0.45,
    defaultEasing: "snap",
    isOverlap: true,
    recommendedSfx: "fast-swish",
    sfxOffsetSec: -0.09,
    whenToUse: "Pairing alternating pans, rapid scene hops, action recaps",
    whereToUse: "Between action clips panning right or playful creator banter",
    avoidWhen: "Solemn emotional dialogue",
  },
  {
    id: "whip-up",
    name: "Whip Pan Up",
    category: "slide",
    shortDesc: "Snap upward camera whip with vertical blur streak",
    defaultDuration: 0.24,
    minDuration: 0.14,
    maxDuration: 0.45,
    defaultEasing: "snap",
    isOverlap: true,
    recommendedSfx: "fast-swish",
    sfxOffsetSec: -0.09,
    whenToUse: "Vertical 9:16 transitions, shoe-to-sky reveals, level-up moments",
    whereToUse: "Reels/Shorts reveal shots, architecture/drone tilts",
    avoidWhen: "Calm documentary narration",
  },
  {
    id: "whip-down",
    name: "Whip Pan Down",
    category: "slide",
    shortDesc: "Snap downward whip into next shot",
    defaultDuration: 0.24,
    minDuration: 0.14,
    maxDuration: 0.45,
    defaultEasing: "snap",
    isOverlap: true,
    recommendedSfx: "fast-swish",
    sfxOffsetSec: -0.09,
    whenToUse: "Dropping from establishing shot onto desk/product closeup",
    whereToUse: "Room-to-product, sky-to-subject vertical cuts",
    avoidWhen: "Static screen-recording explainers",
  },
  {
    id: "push-left",
    name: "Elastic Push",
    category: "slide",
    shortDesc: "Snappy lateral shove with spring settle",
    defaultDuration: 0.34,
    minDuration: 0.2,
    maxDuration: 0.65,
    defaultEasing: "expoOut",
    isOverlap: true,
    recommendedSfx: "fast-swish",
    sfxOffsetSec: -0.08,
    whenToUse: "Energetic YouTube/SaaS demos, quick tip #1 -> tip #2 jumps",
    whereToUse: "Numbered list steps, feature highlights, creator explainers",
    avoidWhen: "Slow cinematic landscapes",
  },
  {
    id: "zoom",
    name: "Zoom In",
    category: "zoom",
    shortDesc: "Forward push zoom into the incoming frame",
    defaultDuration: 0.35,
    minDuration: 0.18,
    maxDuration: 0.75,
    defaultEasing: "easeInOut",
    isOverlap: true,
    recommendedSfx: "soft-whoosh",
    sfxOffsetSec: -0.1,
    whenToUse: "Escalating focus from wide shot to detail or product hero",
    whereToUse: "Setup -> closeup, hook -> proof point",
    avoidWhen: "Back-to-back identical framing jumps",
  },
  {
    id: "zoom-out",
    name: "Zoom Out",
    category: "zoom",
    shortDesc: "Pull-back zoom revealing wider context",
    defaultDuration: 0.35,
    minDuration: 0.18,
    maxDuration: 0.75,
    defaultEasing: "easeInOut",
    isOverlap: true,
    recommendedSfx: "soft-whoosh",
    sfxOffsetSec: -0.1,
    whenToUse: "Detail -> full environment reveal, conclusion step-backs",
    whereToUse: "Product detail -> room wide shot, climax -> big picture",
    avoidWhen: "Rapid fire sub-second meme cuts",
  },
  {
    id: "pull-in",
    name: "CapCut Pull In",
    category: "zoom",
    shortDesc: "Aggressive tunnel pull-in with motion blur & punchy settle",
    defaultDuration: 0.28,
    minDuration: 0.15,
    maxDuration: 0.55,
    defaultEasing: "snap",
    isOverlap: true,
    recommendedSfx: "fast-swish",
    sfxOffsetSec: -0.09,
    whenToUse: "Viral CapCut aesthetic edits, diving straight into action/screen",
    whereToUse: "Hook transitions, gaming highlights, dynamic product showcase",
    avoidWhen: "Subtle corporate testimonials",
  },
  {
    id: "pull-out",
    name: "CapCut Pull Out",
    category: "zoom",
    shortDesc: "Snap pull-out with velocity blur and RGB edge kiss",
    defaultDuration: 0.28,
    minDuration: 0.15,
    maxDuration: 0.55,
    defaultEasing: "snap",
    isOverlap: true,
    recommendedSfx: "fast-swish",
    sfxOffsetSec: -0.09,
    whenToUse: "Releasing tension after an intense closeup, beat reversals",
    whereToUse: "Paired after Pull In, high-tempo travel/sports cuts",
    avoidWhen: "Quiet spoken tutorials",
  },
  {
    id: "lens-zoom",
    name: "Lens Warp Zoom",
    category: "zoom",
    shortDesc: "Punchy optical lens surge with color saturation pop",
    defaultDuration: 0.32,
    minDuration: 0.18,
    maxDuration: 0.65,
    defaultEasing: "snap",
    isOverlap: true,
    recommendedSfx: "low-impact",
    sfxOffsetSec: -0.05,
    whenToUse: "Streetwear, automotive, high-impact commercials",
    whereToUse: "Beat drops, action reveals, bold visual contrasts",
    avoidWhen: "Minimalist slide presentations",
  },
  {
    id: "spin-left",
    name: "Spin Left (CCW)",
    category: "spin",
    shortDesc: "Auto-scaled counter-clockwise whirl with blur peak",
    defaultDuration: 0.34,
    minDuration: 0.2,
    maxDuration: 0.7,
    defaultEasing: "snap",
    isOverlap: true,
    recommendedSfx: "fast-swish",
    sfxOffsetSec: -0.1,
    whenToUse: "Playful creative edits, outfit spins, dance transitions",
    whereToUse: "Motion-matched spins, upbeat lifestyle montages",
    avoidWhen: "More than 1–2 times per video (spins induce dizziness)",
  },
  {
    id: "spin-right",
    name: "Spin Right (CW)",
    category: "spin",
    shortDesc: "Auto-scaled clockwise whirl with seamless edge fill",
    defaultDuration: 0.34,
    minDuration: 0.2,
    maxDuration: 0.7,
    defaultEasing: "snap",
    isOverlap: true,
    recommendedSfx: "fast-swish",
    sfxOffsetSec: -0.1,
    whenToUse: "Dynamic object rotations, car/watch/product 360 cuts",
    whereToUse: "Circular motion B-roll, fashion reels, energetic reveals",
    avoidWhen: "Corporate educational lectures",
  },
  {
    id: "flip-x",
    name: "3D Flip Horizontal",
    category: "spin",
    shortDesc: "Card flip around vertical axis into incoming shot",
    defaultDuration: 0.42,
    minDuration: 0.22,
    maxDuration: 0.8,
    defaultEasing: "easeInOut",
    isOverlap: false,
    recommendedSfx: "soft-whoosh",
    sfxOffsetSec: -0.1,
    whenToUse: "Before/after toggles, expectation vs reality, UI screen flips",
    whereToUse: "Comparison points, split-mind jokes, graphic card transitions",
    avoidWhen: "Serious documentary B-roll",
  },
  {
    id: "flip-y",
    name: "3D Flip Vertical",
    category: "spin",
    shortDesc: "Vertical tumbler flip across horizontal axis",
    defaultDuration: 0.42,
    minDuration: 0.22,
    maxDuration: 0.8,
    defaultEasing: "easeInOut",
    isOverlap: false,
    recommendedSfx: "soft-whoosh",
    sfxOffsetSec: -0.1,
    whenToUse: "Vertical mobile card reveals, top/bottom flips",
    whereToUse: "Vertical 9:16 listicles and stylized motion posters",
    avoidWhen: "Landscape slow-cinema edits",
  },
  {
    id: "tilt-whip",
    name: "Tilt Roll Whip",
    category: "spin",
    shortDesc: "Dutch-angle whip roll with lateral blur kick",
    defaultDuration: 0.28,
    minDuration: 0.16,
    maxDuration: 0.55,
    defaultEasing: "snap",
    isOverlap: true,
    recommendedSfx: "fast-swish",
    sfxOffsetSec: -0.09,
    whenToUse: "Fitness, gaming, POV sports, youth lifestyle",
    whereToUse: "Hand-held gimbal cuts, music drops, dynamic transitions",
    avoidWhen: "Static architectural shots",
  },
  {
    id: "camera-shake",
    name: "S-Shake",
    category: "glitch",
    shortDesc: "CapCut multi-axis damped shake with RGB split & blur",
    defaultDuration: 0.3,
    minDuration: 0.16,
    maxDuration: 0.6,
    defaultEasing: "snap",
    isOverlap: true,
    recommendedSfx: "low-impact",
    sfxOffsetSec: -0.03,
    whenToUse: "Bass drops, heavy action hits, shock punchlines, gaming clips",
    whereToUse: "Music beat hits, dramatic reveals, intense B-roll transitions",
    avoidWhen: "Talking-head mid-sentence cuts or serene travel scenes",
  },
  {
    id: "impact-punch",
    name: "Impact Bass Hit",
    category: "glitch",
    shortDesc: "Hard zoom thump + micro tremor + crisp flash pop",
    defaultDuration: 0.24,
    minDuration: 0.14,
    maxDuration: 0.48,
    defaultEasing: "snap",
    isOverlap: false,
    recommendedSfx: "low-impact",
    sfxOffsetSec: -0.02,
    whenToUse: "Hook reveals, dramatic stat drops, hype trailers",
    whereToUse: "Exact beat downbeats, punchline cuts, sports highlight peaks",
    avoidWhen: "Calm background narration",
  },
  {
    id: "glitch-rgb",
    name: "RGB Glitch Split",
    category: "glitch",
    shortDesc: "Opposing R/G/B chromatic shift & digital stutter",
    defaultDuration: 0.26,
    minDuration: 0.14,
    maxDuration: 0.55,
    defaultEasing: "snap",
    isOverlap: true,
    recommendedSfx: "glitch",
    sfxOffsetSec: -0.04,
    whenToUse: "Tech, AI, gaming, cyberpunk, error/plot-twist reveals",
    whereToUse: "Topic twists, sci-fi B-roll, tech feature hooks",
    avoidWhen: "Warm organic cooking, wedding, or mindfulness videos",
  },
  {
    id: "glitch-slice",
    name: "Tear Glitch Slices",
    category: "glitch",
    shortDesc: "Horizontal scanline tear with chromatic distortion",
    defaultDuration: 0.28,
    minDuration: 0.15,
    maxDuration: 0.6,
    defaultEasing: "snap",
    isOverlap: true,
    recommendedSfx: "glitch",
    sfxOffsetSec: -0.05,
    whenToUse: "Edgy music promos, esports montages, hacking/AI visuals",
    whereToUse: "Rapid hype switches, futuristic B-roll, intense beat breaks",
    avoidWhen: "Gentle tutorials or corporate interviews",
  },
  {
    id: "pixelate-dissolve",
    name: "Pixel Mosaic",
    category: "glitch",
    shortDesc: "Retro mosaic pixelation peak resolving into clean focus",
    defaultDuration: 0.38,
    minDuration: 0.2,
    maxDuration: 0.8,
    defaultEasing: "easeInOut",
    isOverlap: true,
    recommendedSfx: "glitch",
    sfxOffsetSec: -0.08,
    whenToUse: "Gaming, retro tech, playful censorship/reveal gags",
    whereToUse: "App UI reveals, gamer highlights, mystery-reveal cuts",
    avoidWhen: "Emotional storytelling or wedding edits",
  },
  {
    id: "ghost-echo",
    name: "Ghost Trail Echo",
    category: "glitch",
    shortDesc: "Translucent double-exposure trail bridging the cut",
    defaultDuration: 0.42,
    minDuration: 0.22,
    maxDuration: 0.85,
    defaultEasing: "easeInOut",
    isOverlap: true,
    recommendedSfx: "soft-whoosh",
    sfxOffsetSec: -0.1,
    whenToUse: "Music videos, suspense, disorientation or dream-like beats",
    whereToUse: "Slow-mo performance shots, dramatic narrative beats",
    avoidWhen: "Crisp educational screen captures",
  },
  {
    id: "wipe-left",
    name: "Wipe Left",
    category: "wipe",
    shortDesc: "Clean soft-edged wipe sweeping right-to-left",
    defaultDuration: 0.36,
    minDuration: 0.18,
    maxDuration: 0.85,
    defaultEasing: "easeInOut",
    isOverlap: true,
    recommendedSfx: "soft-whoosh",
    sfxOffsetSec: -0.08,
    whenToUse: "Before/after sliders, explainer steps, graphic resets",
    whereToUse: "Design comparisons, color-grade showcases, UI walkthroughs",
    avoidWhen: "Intimate emotional closeups",
  },
  {
    id: "wipe-right",
    name: "Wipe Right",
    category: "wipe",
    shortDesc: "Clean feathered wipe sweeping left-to-right",
    defaultDuration: 0.36,
    minDuration: 0.18,
    maxDuration: 0.85,
    defaultEasing: "easeInOut",
    isOverlap: true,
    recommendedSfx: "soft-whoosh",
    sfxOffsetSec: -0.08,
    whenToUse: "Reading-order progressive reveals, timeline progression",
    whereToUse: "Explainer visuals, architecture before/afters",
    avoidWhen: "High-speed action whips",
  },
  {
    id: "wipe-diagonal",
    name: "Diagonal Wipe",
    category: "wipe",
    shortDesc: "Sleek 45-degree angled sweep across frame",
    defaultDuration: 0.38,
    minDuration: 0.2,
    maxDuration: 0.85,
    defaultEasing: "easeInOut",
    isOverlap: true,
    recommendedSfx: "soft-whoosh",
    sfxOffsetSec: -0.08,
    whenToUse: "Modern brand commercials, sports promos, bold deck videos",
    whereToUse: "Product showcases, motion-graphic scenes, split comparisons",
    avoidWhen: "Ultra-minimalist quiet interviews",
  },
  {
    id: "circle-iris",
    name: "Circle Iris",
    category: "wipe",
    shortDesc: "Circular aperture opening cleanly from frame center",
    defaultDuration: 0.44,
    minDuration: 0.22,
    maxDuration: 0.9,
    defaultEasing: "easeOut",
    isOverlap: true,
    recommendedSfx: "digital-pop",
    sfxOffsetSec: -0.06,
    whenToUse: "Focal spotlight reveals, playful creator/YouTube intros",
    whereToUse: "Spotlight product reveals, retro cartoon-inspired closers",
    avoidWhen: "Serious corporate or gritty thriller cuts",
  },
  {
    id: "clock-wipe",
    name: "Clock Sweep",
    category: "wipe",
    shortDesc: "360-degree clockwise radial reveal",
    defaultDuration: 0.48,
    minDuration: 0.25,
    maxDuration: 1.0,
    defaultEasing: "easeInOut",
    isOverlap: true,
    recommendedSfx: "soft-whoosh",
    sfxOffsetSec: -0.1,
    whenToUse: "Time-passing sequences, schedule/process loops, sports stats",
    whereToUse: "Morning-to-night timelapses, countdown transitions",
    avoidWhen: "Sub-second hyper-cuts",
  },
  {
    id: "barn-door",
    name: "Barn Door",
    category: "wipe",
    shortDesc: "Symmetrical center curtains opening outward",
    defaultDuration: 0.42,
    minDuration: 0.2,
    maxDuration: 0.85,
    defaultEasing: "easeOut",
    isOverlap: true,
    recommendedSfx: "soft-whoosh",
    sfxOffsetSec: -0.1,
    whenToUse: "Grand reveals, product launches, stage curtain openings",
    whereToUse: "Hook-to-hero reveal, theatrical title intros",
    avoidWhen: "Mundane mid-tutorial cuts",
  },
  {
    id: "blinds",
    name: "Venetian Blinds",
    category: "wipe",
    shortDesc: "Sleek multi-slat horizontal shutter sweep",
    defaultDuration: 0.45,
    minDuration: 0.22,
    maxDuration: 0.9,
    defaultEasing: "easeInOut",
    isOverlap: true,
    recommendedSfx: "soft-whoosh",
    sfxOffsetSec: -0.1,
    whenToUse: "Editorial lookbooks, clean business explainers, architectural decks",
    whereToUse: "Section changes, presentation chapters",
    avoidWhen: "Shaky handheld vlog footage",
  },
  {
    id: "diamond-iris",
    name: "Diamond Reveal",
    category: "wipe",
    shortDesc: "Geometric diamond mask expanding from center",
    defaultDuration: 0.42,
    minDuration: 0.22,
    maxDuration: 0.85,
    defaultEasing: "easeOut",
    isOverlap: true,
    recommendedSfx: "digital-pop",
    sfxOffsetSec: -0.06,
    whenToUse: "Jewelry/luxury highlights, geometric graphics, gaming promos",
    whereToUse: "Brand hero reveals, stylised split scenes",
    avoidWhen: "Naturalistic documentary cuts",
  },
  {
    id: "split-horizontal",
    name: "Center Split",
    category: "wipe",
    shortDesc: "Top and bottom shutters opening from midline",
    defaultDuration: 0.4,
    minDuration: 0.2,
    maxDuration: 0.85,
    defaultEasing: "easeOut",
    isOverlap: true,
    recommendedSfx: "soft-whoosh",
    sfxOffsetSec: -0.08,
    whenToUse: "Cinematic 16:9 reveals, headline-to-video transitions",
    whereToUse: "Title-card exits, dramatic product reveals",
    avoidWhen: "Overusing between casual dialogue shots",
  },
] as const;

export const TRANSITION_SPEC_MAP = new Map<TransitionKind, TransitionSpec>(
  TRANSITION_CATALOG.map((spec) => [spec.id, spec])
);

const TRANSITION_ALIASES: Record<string, TransitionKind> = {
  "cross dissolve": "dissolve",
  "cross-dissolve": "dissolve",
  mix: "dissolve",
  crossfade: "dissolve",
  "dip to black": "fade",
  "fade to black": "fade",
  "black fade": "fade",
  flash: "flash-white",
  "white flash": "flash-white",
  whiteout: "flash-white",
  "black flash": "flash-black",
  blink: "flash-black",
  "exposure fade": "exposure-flash",
  exposure: "exposure-flash",
  luma: "luma-dissolve",
  "luma fade": "luma-dissolve",
  leak: "light-leak",
  "light leak": "light-leak",
  burn: "film-burn",
  "film burn": "film-burn",
  blur: "gaussian-blur",
  "blur dissolve": "gaussian-blur",
  "gaussian blur": "gaussian-blur",
  "motion blur": "directional-blur",
  "directional blur": "directional-blur",
  "zoom blur": "zoom-blur",
  "radial blur": "radial-blur",
  glow: "dream-glow",
  "dream glow": "dream-glow",
  "slide left": "slide",
  "slide-left": "slide",
  "slide right": "slide-right",
  "slide up": "slide-up",
  "slide down": "slide-down",
  whip: "whip-left",
  "whip pan": "whip-left",
  "whip pan left": "whip-left",
  "whip pan right": "whip-right",
  "whip pan up": "whip-up",
  "whip pan down": "whip-down",
  "whip left": "whip-left",
  "whip right": "whip-right",
  "whip up": "whip-up",
  "whip down": "whip-down",
  "capcut pull in": "pull-in",
  "capcut pull out": "pull-out",
  "s shake": "camera-shake",
  push: "push-left",
  "push left": "push-left",
  "zoom in": "zoom",
  "zoom-in": "zoom",
  "zoom out": "zoom-out",
  "pull in": "pull-in",
  "pull out": "pull-out",
  "lens zoom": "lens-zoom",
  spin: "spin-right",
  "spin left": "spin-left",
  "spin right": "spin-right",
  flip: "flip-x",
  "flip horizontal": "flip-x",
  "flip vertical": "flip-y",
  tilt: "tilt-whip",
  shake: "camera-shake",
  "s-shake": "camera-shake",
  "camera shake": "camera-shake",
  impact: "impact-punch",
  punch: "impact-punch",
  "bass hit": "impact-punch",
  glitch: "glitch-rgb",
  "rgb glitch": "glitch-rgb",
  "chromatic glitch": "glitch-rgb",
  slice: "glitch-slice",
  "slice glitch": "glitch-slice",
  pixelate: "pixelate-dissolve",
  pixel: "pixelate-dissolve",
  mosaic: "pixelate-dissolve",
  ghost: "ghost-echo",
  "ghost echo": "ghost-echo",
  wipe: "wipe-right",
  "wipe left": "wipe-left",
  "wipe right": "wipe-right",
  "wipe diagonal": "wipe-diagonal",
  iris: "circle-iris",
  "circle iris": "circle-iris",
  clock: "clock-wipe",
  "clock wipe": "clock-wipe",
  "barn door": "barn-door",
  blinds: "blinds",
  diamond: "diamond-iris",
  split: "split-horizontal",
};

export function isTransitionKind(value: unknown): value is TransitionKind {
  return typeof value === "string" && TRANSITION_SPEC_MAP.has(value as TransitionKind);
}

export function resolveTransitionKind(value: unknown): TransitionKind | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  if (TRANSITION_SPEC_MAP.has(trimmed as TransitionKind)) return trimmed as TransitionKind;
  const alias = TRANSITION_ALIASES[trimmed] ?? TRANSITION_ALIASES[trimmed.replace(/[_-]+/g, " ")];
  return alias ?? null;
}

export function getTransitionSpec(kind: TransitionKind): TransitionSpec {
  return TRANSITION_SPEC_MAP.get(kind) ?? TRANSITION_CATALOG[0];
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / Math.max(1e-5, edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function applyEasing(t: number, easing: TransitionEasing): number {
  const x = clamp(t, 0, 1);
  switch (easing) {
    case "linear":
      return x;
    case "easeIn":
      return x * x * x;
    case "easeOut":
      return 1 - Math.pow(1 - x, 3);
    case "easeInOut":
      return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
    case "expoOut":
      return x === 1 ? 1 : 1 - Math.pow(2, -10 * x);
    case "snap":
      return x < 0.5 ? 8 * Math.pow(x, 4) : 1 - Math.pow(-2 * x + 2, 4) / 2;
  }
}

function basePose(): TransitionLayerPose {
  return {
    opacity: 1,
    x: 0,
    y: 0,
    scale: 1,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    blur: 0,
    brightness: 1,
    contrast: 1,
    saturation: 1,
    rgbOffset: 0,
    pixelate: 0,
    glitchSlices: 0,
    ghostEcho: 0,
    skewX: 0,
  };
}

function directionalVector(dir: TransitionDirection | undefined, fallbackX: number, fallbackY: number): [number, number] {
  switch (dir) {
    case "left":
      return [-1, 0];
    case "right":
      return [1, 0];
    case "up":
      return [0, -1];
    case "down":
      return [0, 1];
    default:
      return [fallbackX, fallbackY];
  }
}

export function evaluateTransition(
  transition: Pick<Transition, "kind" | "duration"> & {
    intensity?: number;
    easing?: TransitionEasing;
    direction?: TransitionDirection;
  },
  rawProgress: number
): TransitionEvaluation {
  const spec = getTransitionSpec(transition.kind);
  const p = clamp(rawProgress, 0, 1);
  const intensity = clamp(transition.intensity ?? 1, 0.25, 2);
  const easing = transition.easing ?? spec.defaultEasing;
  const e = applyEasing(p, easing);
  const peak = Math.sin(Math.PI * p); // 0 -> 1 at midpoint -> 0
  const outgoing = basePose();
  const incoming = basePose();
  let overlayFlash: TransitionOverlayFlash | undefined;

  switch (transition.kind) {
    case "fade": {
      outgoing.opacity = Math.max(0, 1 - p * 2);
      incoming.opacity = Math.max(0, p * 2 - 1);
      break;
    }
    case "dissolve": {
      incoming.opacity = p;
      break;
    }
    case "flash-white": {
      outgoing.opacity = p < 0.52 ? 1 : 0;
      incoming.opacity = p >= 0.48 ? smoothstep(0.46, 0.9, p) : 0;
      outgoing.brightness = 1 + 2.4 * intensity * Math.pow(clamp(p * 2, 0, 1), 2);
      incoming.brightness = 1 + 2.0 * intensity * Math.pow(clamp((1 - p) * 2, 0, 1), 2);
      incoming.scale = 1 + 0.04 * intensity * (1 - e);
      overlayFlash = {
        color: "#ffffff",
        opacity: clamp(Math.pow(peak, 1.3) * 0.95 * Math.min(intensity, 1.2), 0, 1),
        mode: "screen",
      };
      break;
    }
    case "flash-black": {
      outgoing.opacity = p < 0.4 ? Math.max(0, 1 - p / 0.4) : 0;
      incoming.opacity = p > 0.55 ? smoothstep(0.55, 0.92, p) : 0;
      incoming.scale = 1 + 0.05 * intensity * (1 - applyEasing(p, "easeOut"));
      overlayFlash = {
        color: "#000000",
        opacity: clamp(Math.pow(peak, 1.1) * 0.92, 0, 1),
        mode: "source-over",
      };
      break;
    }
    case "exposure-flash": {
      // Mirrors CapCut gamma exposure surge pow(2, exposure)
      const expPeak = Math.pow(peak, 1.2) * intensity;
      outgoing.opacity = p < 0.5 ? 1 - p * 0.35 : 1 - smoothstep(0.48, 0.72, p);
      incoming.opacity = smoothstep(0.32, 0.7, p);
      outgoing.brightness = 1 + expPeak * 2.1;
      incoming.brightness = 1 + expPeak * 1.9;
      outgoing.blur = expPeak * 6;
      incoming.blur = expPeak * 5;
      overlayFlash = {
        color: "#fff7e8",
        opacity: clamp(expPeak * 0.65, 0, 0.92),
        mode: "screen",
        gradient: "radial",
      };
      break;
    }
    case "luma-dissolve": {
      const lumaCurve = smoothstep(0.15, 0.85, e);
      outgoing.opacity = 1 - Math.pow(lumaCurve, 1.4);
      outgoing.contrast = 1 + peak * 0.55 * intensity;
      outgoing.brightness = 1 - p * 0.25 * intensity;
      incoming.opacity = Math.pow(lumaCurve, 0.75);
      incoming.contrast = 1 + (1 - p) * 0.35 * intensity;
      break;
    }
    case "light-leak": {
      outgoing.opacity = 1 - smoothstep(0.25, 0.8, p);
      incoming.opacity = smoothstep(0.2, 0.75, p);
      outgoing.brightness = 1 + peak * 0.55 * intensity;
      incoming.brightness = 1 + peak * 0.45 * intensity;
      incoming.saturation = 1 + peak * 0.35 * intensity;
      overlayFlash = {
        color: "#ff9b3d",
        opacity: clamp(peak * 0.82 * Math.min(intensity, 1.3), 0, 0.95),
        mode: "screen",
        gradient: "side-leak",
      };
      break;
    }
    case "film-burn": {
      outgoing.opacity = p < 0.58 ? 1 - p * 0.4 : 1 - smoothstep(0.45, 0.75, p);
      incoming.opacity = smoothstep(0.3, 0.72, p);
      outgoing.contrast = 1 + peak * 0.65 * intensity;
      incoming.contrast = 1 + peak * 0.45 * intensity;
      outgoing.brightness = 1 + peak * 0.7 * intensity;
      outgoing.saturation = 1 + peak * 0.8 * intensity;
      overlayFlash = {
        color: "#ff5a1f",
        opacity: clamp(Math.pow(peak, 0.9) * 0.85 * Math.min(intensity, 1.3), 0, 0.95),
        mode: "screen",
        gradient: "edge-burn",
      };
      break;
    }
    case "gaussian-blur": {
      // Mirrors CapCut blurry_horizontal.frag + mix.frag
      const blurPx = 22 * intensity * peak;
      const mix = smoothstep(0.32, 0.74, p);
      outgoing.opacity = 1 - mix;
      incoming.opacity = mix;
      outgoing.blur = blurPx;
      incoming.blur = blurPx;
      // Subtle overscan avoids dark blur fringes at canvas borders
      outgoing.scale = 1 + 0.04 * peak;
      incoming.scale = 1 + 0.04 * peak;
      break;
    }
    case "directional-blur": {
      const [dx, dy] = directionalVector(transition.direction, -1, 0);
      const smear = peak * 24 * intensity;
      outgoing.x = dx * 0.35 * e;
      outgoing.y = dy * 0.35 * e;
      outgoing.opacity = 1 - smoothstep(0.25, 0.75, p);
      outgoing.blur = smear;
      outgoing.scale = 1 + 0.08 * peak;
      incoming.x = -dx * 0.35 * (1 - e);
      incoming.y = -dy * 0.35 * (1 - e);
      incoming.opacity = smoothstep(0.25, 0.75, p);
      incoming.blur = smear;
      incoming.scale = 1 + 0.08 * peak;
      break;
    }
    case "zoom-blur": {
      const cutFlip = p >= 0.5;
      outgoing.opacity = cutFlip ? 0 : 1 - smoothstep(0.36, 0.5, p);
      outgoing.scale = 1 + 0.42 * intensity * applyEasing(Math.min(1, p * 2), "easeIn");
      outgoing.blur = 18 * intensity * Math.pow(clamp(p * 2, 0, 1), 1.4);
      outgoing.brightness = 1 + 0.35 * intensity * peak;
      incoming.opacity = cutFlip ? 1 : smoothstep(0.38, 0.5, p);
      const enterProgress = applyEasing(Math.max(0, (p - 0.45) / 0.55), "easeOut");
      incoming.scale = 1 + 0.38 * intensity * (1 - enterProgress);
      incoming.blur = 16 * intensity * (1 - enterProgress);
      incoming.brightness = 1 + 0.3 * intensity * peak;
      break;
    }
    case "radial-blur": {
      const dir = transition.direction === "left" ? -1 : 1;
      outgoing.opacity = 1 - smoothstep(0.35, 0.68, p);
      incoming.opacity = smoothstep(0.32, 0.68, p);
      outgoing.rotation = dir * 0.28 * intensity * e;
      incoming.rotation = -dir * 0.28 * intensity * (1 - e);
      outgoing.blur = 16 * intensity * peak;
      incoming.blur = 16 * intensity * peak;
      outgoing.scale = 1 + 0.16 * peak;
      incoming.scale = 1 + 0.16 * peak;
      break;
    }
    case "dream-glow": {
      incoming.opacity = smoothstep(0.15, 0.85, e);
      outgoing.opacity = 1 - incoming.opacity * 0.85;
      outgoing.brightness = 1 + 0.45 * intensity * peak;
      incoming.brightness = 1 + 0.45 * intensity * peak;
      outgoing.blur = 10 * intensity * peak;
      incoming.blur = 9 * intensity * peak;
      incoming.saturation = 1 + 0.3 * intensity * peak;
      overlayFlash = {
        color: "#fff8f2",
        opacity: clamp(0.38 * peak * intensity, 0, 0.65),
        mode: "screen",
        gradient: "radial",
      };
      break;
    }
    case "slide": {
      outgoing.x = -p;
      incoming.x = 1 - p;
      break;
    }
    case "slide-right": {
      outgoing.x = e;
      incoming.x = e - 1;
      break;
    }
    case "slide-up": {
      outgoing.y = -e;
      incoming.y = 1 - e;
      break;
    }
    case "slide-down": {
      outgoing.y = e;
      incoming.y = e - 1;
      break;
    }
    case "whip-left":
    case "whip-right":
    case "whip-up":
    case "whip-down": {
      const defX = transition.kind === "whip-left" ? -1 : transition.kind === "whip-right" ? 1 : 0;
      const defY = transition.kind === "whip-up" ? -1 : transition.kind === "whip-down" ? 1 : 0;
      const [dx, dy] = directionalVector(transition.direction, defX, defY);
      const snap = applyEasing(p, "snap");
      const speedPeak = Math.pow(Math.sin(Math.PI * p), 0.75);
      outgoing.x = dx * snap;
      outgoing.y = dy * snap;
      incoming.x = -dx * (1 - snap);
      incoming.y = -dy * (1 - snap);
      outgoing.blur = 20 * intensity * speedPeak;
      incoming.blur = 20 * intensity * speedPeak;
      outgoing.rgbOffset = 0.012 * intensity * speedPeak;
      incoming.rgbOffset = 0.012 * intensity * speedPeak;
      outgoing.scale = 1 + 0.06 * speedPeak;
      incoming.scale = 1 + 0.06 * speedPeak;
      break;
    }
    case "push-left": {
      const [dx, dy] = directionalVector(transition.direction, -1, 0);
      const pop = Math.sin(Math.PI * e) * 0.08 * intensity;
      outgoing.x = dx * e;
      outgoing.y = dy * e;
      outgoing.scale = 1 - pop;
      incoming.x = -dx * (1 - e);
      incoming.y = -dy * (1 - e);
      incoming.scale = 1 - pop * 0.6;
      outgoing.blur = 6 * intensity * peak;
      incoming.blur = 6 * intensity * peak;
      break;
    }
    case "zoom": {
      outgoing.opacity = 1 - p;
      outgoing.scale = 1 + p * 0.25;
      incoming.opacity = p;
      incoming.scale = 0.8 + p * 0.2;
      break;
    }
    case "zoom-out": {
      outgoing.opacity = 1 - e;
      outgoing.scale = 1 - e * 0.28 * intensity;
      incoming.opacity = smoothstep(0.1, 0.75, e);
      incoming.scale = 1 + (1 - e) * 0.35 * intensity;
      break;
    }
    case "pull-in": {
      const firstHalf = p < 0.5;
      const outP = applyEasing(clamp(p / 0.5, 0, 1), "easeIn");
      const inP = applyEasing(clamp((p - 0.45) / 0.55, 0, 1), "expoOut");
      outgoing.opacity = firstHalf ? 1 - outP * 0.35 : 0;
      outgoing.scale = 1 + outP * 0.85 * intensity;
      outgoing.blur = outP * 18 * intensity;
      incoming.opacity = firstHalf ? smoothstep(0.35, 0.5, p) : 1;
      incoming.scale = 0.55 + inP * 0.45;
      incoming.blur = (1 - inP) * 14 * intensity;
      incoming.rgbOffset = peak * 0.01 * intensity;
      break;
    }
    case "pull-out": {
      const firstHalf = p < 0.5;
      const outP = applyEasing(clamp(p / 0.5, 0, 1), "easeIn");
      const inP = applyEasing(clamp((p - 0.45) / 0.55, 0, 1), "expoOut");
      outgoing.opacity = firstHalf ? 1 - outP * 0.45 : 0;
      outgoing.scale = Math.max(0.45, 1 - outP * 0.42 * intensity);
      outgoing.blur = outP * 14 * intensity;
      incoming.opacity = firstHalf ? smoothstep(0.38, 0.52, p) : 1;
      incoming.scale = 1 + (1 - inP) * 0.65 * intensity;
      incoming.blur = (1 - inP) * 14 * intensity;
      incoming.rgbOffset = peak * 0.01 * intensity;
      break;
    }
    case "lens-zoom": {
      outgoing.opacity = 1 - smoothstep(0.35, 0.65, p);
      incoming.opacity = smoothstep(0.3, 0.65, p);
      outgoing.scale = 1 + e * 0.5 * intensity;
      incoming.scale = 0.72 + e * 0.28;
      outgoing.saturation = 1 + peak * 0.6 * intensity;
      incoming.saturation = 1 + peak * 0.6 * intensity;
      outgoing.blur = peak * 10 * intensity;
      incoming.blur = peak * 10 * intensity;
      break;
    }
    case "spin-left":
    case "spin-right": {
      const sign = transition.kind === "spin-left" ? -1 : 1;
      const angleOut = sign * Math.PI * e;
      const angleIn = -sign * Math.PI * (1 - e);
      // Mirror CapCut fshader_rotate.frag auto edge scale: abs(cos)+abs(sin)
      const fillOut = Math.abs(Math.cos(angleOut)) + Math.abs(Math.sin(angleOut));
      const fillIn = Math.abs(Math.cos(angleIn)) + Math.abs(Math.sin(angleIn));
      outgoing.rotation = angleOut;
      outgoing.scale = fillOut;
      outgoing.opacity = p < 0.52 ? 1 - smoothstep(0.38, 0.52, p) : 0;
      outgoing.blur = 14 * intensity * peak;
      incoming.rotation = angleIn;
      incoming.scale = fillIn;
      incoming.opacity = p >= 0.45 ? smoothstep(0.45, 0.6, p) : 0;
      incoming.blur = 14 * intensity * peak;
      break;
    }
    case "flip-x": {
      const flipCos = Math.cos(Math.PI * e);
      outgoing.opacity = e < 0.5 ? 1 : 0;
      outgoing.scaleX = Math.max(0.02, Math.abs(flipCos));
      outgoing.brightness = e < 0.5 ? 0.65 + 0.35 * Math.abs(flipCos) : 1;
      incoming.opacity = e >= 0.5 ? 1 : 0;
      incoming.scaleX = Math.max(0.02, Math.abs(flipCos));
      incoming.brightness = e >= 0.5 ? 0.65 + 0.35 * Math.abs(flipCos) : 1;
      break;
    }
    case "flip-y": {
      const flipCos = Math.cos(Math.PI * e);
      outgoing.opacity = e < 0.5 ? 1 : 0;
      outgoing.scaleY = Math.max(0.02, Math.abs(flipCos));
      outgoing.brightness = e < 0.5 ? 0.65 + 0.35 * Math.abs(flipCos) : 1;
      incoming.opacity = e >= 0.5 ? 1 : 0;
      incoming.scaleY = Math.max(0.02, Math.abs(flipCos));
      incoming.brightness = e >= 0.5 ? 0.65 + 0.35 * Math.abs(flipCos) : 1;
      break;
    }
    case "tilt-whip": {
      const sign = transition.direction === "right" ? 1 : -1;
      outgoing.x = sign * e;
      outgoing.rotation = sign * 0.32 * intensity * e;
      outgoing.scale = 1 + 0.25 * peak;
      outgoing.blur = 16 * intensity * peak;
      incoming.x = -sign * (1 - e);
      incoming.rotation = -sign * 0.32 * intensity * (1 - e);
      incoming.scale = 1 + 0.25 * peak;
      incoming.blur = 16 * intensity * peak;
      break;
    }
    case "camera-shake": {
      // Mirrors CapCut LumiSShake.lua damped multi-frequency X/Y/Rotate + overscan + RGB split
      const envelope = Math.pow(peak, 0.85) * intensity;
      const sx = Math.sin(p * 37.0) * 0.045 * envelope;
      const sy = Math.cos(p * 29.0) * 0.038 * envelope;
      const rot = Math.sin(p * 43.0) * 0.055 * envelope;
      const overscan = 1 + 0.14 * envelope;
      const swap = p >= 0.5;
      outgoing.opacity = swap ? 0 : 1;
      outgoing.x = sx;
      outgoing.y = sy;
      outgoing.rotation = rot;
      outgoing.scale = overscan;
      outgoing.blur = 7 * envelope;
      outgoing.rgbOffset = 0.015 * envelope;
      incoming.opacity = swap ? 1 : 0;
      incoming.x = sx;
      incoming.y = sy;
      incoming.rotation = rot;
      incoming.scale = overscan;
      incoming.blur = 7 * envelope;
      incoming.rgbOffset = 0.015 * envelope;
      break;
    }
    case "impact-punch": {
      const hitP = 1 - Math.abs(p - 0.48) * 2;
      const thump = Math.max(0, hitP) * intensity;
      const swap = p >= 0.48;
      outgoing.opacity = swap ? 0 : 1;
      outgoing.scale = 1 + 0.22 * thump;
      outgoing.x = Math.sin(p * 55) * 0.025 * thump;
      outgoing.y = Math.cos(p * 47) * 0.025 * thump;
      incoming.opacity = swap ? 1 : 0;
      incoming.scale = 1 + 0.24 * thump;
      incoming.x = Math.sin(p * 55) * 0.025 * thump;
      incoming.y = Math.cos(p * 47) * 0.025 * thump;
      incoming.brightness = 1 + 0.35 * thump;
      overlayFlash = {
        color: "#ffffff",
        opacity: clamp(0.45 * thump, 0, 0.7),
        mode: "screen",
      };
      break;
    }
    case "glitch-rgb": {
      // Mirrors CapCut VerticalGlitch0.frag + color_difference.frag
      const env = Math.pow(peak, 0.85) * intensity;
      const flicker = Math.sin(p * 53) > 0 ? 1 : 0.88;
      const swap = p >= 0.5;
      outgoing.opacity = swap ? 0 : flicker;
      outgoing.rgbOffset = 0.028 * env;
      outgoing.x = Math.sin(p * 61) * 0.018 * env;
      outgoing.scale = 1 + 0.05 * env;
      incoming.opacity = swap ? flicker : 0;
      incoming.rgbOffset = 0.028 * env;
      incoming.x = -Math.sin(p * 61) * 0.018 * env;
      incoming.scale = 1 + 0.05 * env;
      incoming.contrast = 1 + 0.25 * env;
      break;
    }
    case "glitch-slice": {
      const env = Math.pow(peak, 0.75) * intensity;
      const swap = p >= 0.48;
      outgoing.opacity = swap ? 0 : 1;
      outgoing.glitchSlices = env;
      outgoing.rgbOffset = 0.022 * env;
      outgoing.scale = 1 + 0.04 * env;
      incoming.opacity = swap ? 1 : 0;
      incoming.glitchSlices = env;
      incoming.rgbOffset = 0.022 * env;
      incoming.scale = 1 + 0.04 * env;
      break;
    }
    case "pixelate-dissolve": {
      const env = Math.pow(peak, 0.9) * intensity;
      const swap = p >= 0.5;
      outgoing.opacity = swap ? 0 : 1 - smoothstep(0.42, 0.5, p);
      outgoing.pixelate = env;
      incoming.opacity = swap ? smoothstep(0.5, 0.58, p) : 0;
      incoming.pixelate = env;
      break;
    }
    case "ghost-echo": {
      const mix = smoothstep(0.15, 0.85, e);
      outgoing.opacity = 1 - mix * 0.9;
      outgoing.ghostEcho = peak * intensity;
      outgoing.scale = 1 + p * 0.08 * intensity;
      incoming.opacity = mix;
      incoming.ghostEcho = peak * intensity;
      incoming.scale = 1.06 - e * 0.06;
      break;
    }
    case "wipe-left":
    case "wipe-right":
    case "wipe-diagonal":
    case "circle-iris":
    case "clock-wipe":
    case "barn-door":
    case "blinds":
    case "diamond-iris":
    case "split-horizontal": {
      incoming.clipMask = {
        shape: transition.kind,
        progress: e,
        feather: 0.03,
      };
      break;
    }
  }

  return { outgoing, incoming, overlayFlash };
}
