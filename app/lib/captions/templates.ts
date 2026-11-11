import { TTSWordTimestamp } from "../server/tts/types";
export type { TTSWordTimestamp };

export type CaptionCategory =
  | "Trending"
  | "Minimal"
  | "Bold"
  | "Creator"
  | "Podcast"
  | "Gaming"
  | "UGC"
  | "Cinematic"
  | "Educational"
  | "Custom";

export type CaptionAnimationType =
  | "pop"
  | "bounce"
  | "fade"
  | "scale"
  | "slide-up"
  | "slide-down"
  | "type"
  | "word-by-word";

export type HighlightingMode =
  | "current-word"
  | "keyword"
  | "alternating"
  | "full-line"
  | "cumulative";

export type CaptionPosition = "top" | "center" | "bottom" | "custom";

export interface CaptionStyleConfig {
  studio?: import('./studioDesign').CaptionStudioDesign;
  fontAccent?: import("./typography").FontAccent | null;
  fontFamily: string;
  fontSize: number; // in pixels (e.g. 32)
  fontWeight: number; // 400 - 900
  textTransform: "uppercase" | "none" | "capitalize";
  textColor: string;
  highlightColor: string;
  highlightBg?: string; // background color for the highlighted word
  strokeColor?: string;
  strokeWidth?: number; // 0 - 6px
  shadowColor?: string;
  shadowBlur?: number;
  shadowOffsetX?: number;
  shadowOffsetY?: number;
  containerBg?: string; // background for the subtitle container box
  containerBorder?: string;
  containerBorderRadius?: number;
  containerPadding?: string;
  backdropBlur?: number;
  alignment: "left" | "center" | "right";
  position: CaptionPosition;
  positionYPercent?: number; // 10% to 90%
  maxWordsPerLine: number; // 1 to 6
  lineSpacing: number; // e.g. 1.25
  letterSpacing: string; // e.g. "0.02em"
  animation: CaptionAnimationType;
  animationSpeed: number; // duration in seconds, e.g. 0.2
  highlightWords?:string;
  highlightingMode: HighlightingMode;
}

export interface CaptionTemplate {
  id: string;
  name: string;
  category: CaptionCategory;
  tagline: string;
  description: string;
  isCustom?: boolean;
  userId?: string;
  style: CaptionStyleConfig;
  createdAt?: string;
  updatedAt?: string;
}

export const CAPTION_CATEGORIES: CaptionCategory[] = [
  "Trending",
  "Minimal",
  "Bold",
  "Creator",
  "Podcast",
  "Gaming",
  "UGC",
  "Cinematic",
  "Educational",
  "Custom",
];

export const DEFAULT_CAPTION_TEMPLATES: CaptionTemplate[] = [
  // 0. TRENDING: Viral Hinglish Pop (Romanized Hindi optimized)
  {
    id: "viral-hinglish-pop",
    name: "Viral Hinglish Pop",
    category: "Trending",
    tagline: "Romanized Hindi pop · High-contrast stroke",
    description: "Optimized for punchy uppercase Romanized Hindi (Hinglish) with high-contrast outlines and energetic keyword highlights.",
    style: {
      fontFamily: "'Montserrat', -apple-system, sans-serif",
      fontSize: 36,
      fontWeight: 900,
      textTransform: "uppercase",
      textColor: "#FFFFFF",
      highlightColor: "#FFE600",
      strokeColor: "#000000",
      strokeWidth: 4,
      shadowColor: "rgba(0, 0, 0, 0.95)",
      shadowBlur: 0,
      shadowOffsetX: 3,
      shadowOffsetY: 4,
      containerBg: "transparent",
      alignment: "center",
      position: "center",
      positionYPercent: 65,
      maxWordsPerLine: 3,
      lineSpacing: 1.15,
      letterSpacing: "0.02em",
      animation: "pop",
      animationSpeed: 0.16,
      highlightingMode: "current-word",
    },
  },
  // 1. TRENDING: Hormozi Punch
  {
    id: "hormozi-punch",
    name: "Hormozi Punch",
    category: "Trending",
    tagline: "Electric yellow & heavy black outline",
    description: "The viral short-form look used by top business creators. Ultra-high contrast with dynamic pop bounce.",
    style: {
      fontFamily: "'Montserrat', -apple-system, sans-serif",
      fontSize: 34,
      fontWeight: 900,
      textTransform: "uppercase",
      textColor: "#FFFFFF",
      highlightColor: "#FFE600",
      strokeColor: "#000000",
      strokeWidth: 3,
      shadowColor: "rgba(0, 0, 0, 0.9)",
      shadowBlur: 0,
      shadowOffsetX: 3,
      shadowOffsetY: 4,
      containerBg: "transparent",
      alignment: "center",
      position: "center",
      positionYPercent: 62,
      maxWordsPerLine: 3,
      lineSpacing: 1.15,
      letterSpacing: "0.02em",
      animation: "pop",
      animationSpeed: 0.16,
      highlightingMode: "current-word",
    },
  },

  // 2. TRENDING: Viral Beast
  {
    id: "viral-beast",
    name: "Viral Beast",
    category: "Trending",
    tagline: "Hyper cyan bounce with black stroke",
    description: "High-octane YouTube Shorts energy with vivid cyan keyword focus.",
    style: {
      fontFamily: "'Bangers', 'Impact', sans-serif",
      fontSize: 38,
      fontWeight: 800,
      textTransform: "uppercase",
      textColor: "#FFFFFF",
      highlightColor: "#00F5D4",
      strokeColor: "#0A0A0A",
      strokeWidth: 3.5,
      shadowColor: "#000000",
      shadowBlur: 4,
      shadowOffsetX: 2,
      shadowOffsetY: 3,
      containerBg: "transparent",
      alignment: "center",
      position: "center",
      positionYPercent: 60,
      maxWordsPerLine: 2,
      lineSpacing: 1.1,
      letterSpacing: "0.04em",
      animation: "bounce",
      animationSpeed: 0.18,
      highlightingMode: "keyword",
    },
  },

  // 3. MINIMAL: Quiet Luxury
  {
    id: "quiet-luxury",
    name: "Quiet Luxury",
    category: "Minimal",
    tagline: "Refined frosted slate lower-third",
    description: "Subtle, aesthetic typography for thoughtful commentary, fashion, and aesthetic vlogs.",
    style: {
      fontFamily: "'Inter', sans-serif",
      fontSize: 22,
      fontWeight: 500,
      textTransform: "none",
      textColor: "#94A3B8",
      highlightColor: "#F8FAFC",
      containerBg: "rgba(15, 23, 42, 0.65)",
      containerBorder: "1px solid rgba(255, 255, 255, 0.12)",
      containerBorderRadius: 16,
      containerPadding: "8px 18px",
      backdropBlur: 14,
      alignment: "center",
      position: "bottom",
      positionYPercent: 82,
      maxWordsPerLine: 5,
      lineSpacing: 1.35,
      letterSpacing: "-0.01em",
      animation: "fade",
      animationSpeed: 0.22,
      highlightingMode: "current-word",
    },
  },

  // 4. MINIMAL: Clean Sub
  {
    id: "clean-sub",
    name: "Clean Sub",
    category: "Minimal",
    tagline: "Crisp modern subtitle glow",
    description: "Understated modern sans-serif with smooth full-line illumination.",
    style: {
      fontFamily: "'Outfit', sans-serif",
      fontSize: 24,
      fontWeight: 600,
      textTransform: "none",
      textColor: "#E2E8F0",
      highlightColor: "#38BDF8",
      shadowColor: "rgba(0, 0, 0, 0.7)",
      shadowBlur: 10,
      shadowOffsetX: 0,
      shadowOffsetY: 2,
      containerBg: "transparent",
      alignment: "center",
      position: "bottom",
      positionYPercent: 78,
      maxWordsPerLine: 4,
      lineSpacing: 1.25,
      letterSpacing: "0em",
      animation: "slide-up",
      animationSpeed: 0.2,
      highlightingMode: "full-line",
    },
  },

  // 5. BOLD: Kinetic Impact
  {
    id: "kinetic-impact",
    name: "Kinetic Impact",
    category: "Bold",
    tagline: "Ultra-heavy red accent punch",
    description: "Maximum retention typography for hooks, breakthroughs, and intense story beats.",
    style: {
      fontFamily: "'Anton', 'Impact', sans-serif",
      fontSize: 42,
      fontWeight: 900,
      textTransform: "uppercase",
      textColor: "#FFFFFF",
      highlightColor: "#FF3366",
      strokeColor: "#050505",
      strokeWidth: 2,
      shadowColor: "rgba(255, 51, 102, 0.5)",
      shadowBlur: 18,
      shadowOffsetX: 0,
      shadowOffsetY: 4,
      containerBg: "rgba(0, 0, 0, 0.75)",
      containerBorderRadius: 10,
      containerPadding: "10px 20px",
      alignment: "center",
      position: "center",
      positionYPercent: 55,
      maxWordsPerLine: 2,
      lineSpacing: 1.15,
      letterSpacing: "0.03em",
      animation: "scale",
      animationSpeed: 0.15,
      highlightingMode: "alternating",
    },
  },

  // 6. BOLD: Heavy Shadow
  {
    id: "heavy-shadow",
    name: "Heavy Shadow",
    category: "Bold",
    tagline: "Deep 3D drop shadow block",
    description: "Standout block letters with bold hard-edge shadow that pops over any background.",
    style: {
      fontFamily: "'Bebas Neue', sans-serif",
      fontSize: 44,
      fontWeight: 800,
      textTransform: "uppercase",
      textColor: "#FFFFFF",
      highlightColor: "#F59E0B",
      strokeColor: "#1E293B",
      strokeWidth: 2.5,
      shadowColor: "#000000",
      shadowBlur: 0,
      shadowOffsetX: 5,
      shadowOffsetY: 5,
      containerBg: "transparent",
      alignment: "center",
      position: "center",
      positionYPercent: 58,
      maxWordsPerLine: 3,
      lineSpacing: 1.2,
      letterSpacing: "0.05em",
      animation: "pop",
      animationSpeed: 0.16,
      highlightingMode: "current-word",
    },
  },

  // 7. CREATOR: Ali Abdaal Clean
  {
    id: "ali-clean",
    name: "Ali Clean",
    category: "Creator",
    tagline: "Yellow highlighter marker pill",
    description: "The signature productivity creator style: clean dark card with glowing yellow highlight box.",
    style: {
      fontFamily: "'Poppins', sans-serif",
      fontSize: 28,
      fontWeight: 700,
      textTransform: "none",
      textColor: "#F1F5F9",
      highlightColor: "#090A0F",
      highlightBg: "#FBBF24",
      containerBg: "rgba(15, 23, 42, 0.8)",
      containerBorder: "1px solid rgba(255, 255, 255, 0.08)",
      containerBorderRadius: 14,
      containerPadding: "10px 22px",
      backdropBlur: 8,
      alignment: "center",
      position: "center",
      positionYPercent: 65,
      maxWordsPerLine: 4,
      lineSpacing: 1.3,
      letterSpacing: "0.01em",
      animation: "word-by-word",
      animationSpeed: 0.18,
      highlightingMode: "current-word",
    },
  },

  // 8. CREATOR: TikTok Pop
  {
    id: "tiktok-pop",
    name: "TikTok Pop",
    category: "Creator",
    tagline: "Vibrant neon lime bounce",
    description: "Optimized for TikTok algorithm retention. Punchy, energetic, with snappy word bounce.",
    style: {
      fontFamily: "'Montserrat', sans-serif",
      fontSize: 32,
      fontWeight: 900,
      textTransform: "uppercase",
      textColor: "#FFFFFF",
      highlightColor: "#4ADE80",
      strokeColor: "#000000",
      strokeWidth: 3,
      shadowColor: "rgba(0, 0, 0, 0.85)",
      shadowBlur: 10,
      shadowOffsetX: 2,
      shadowOffsetY: 2,
      containerBg: "rgba(0, 0, 0, 0.65)",
      containerBorderRadius: 12,
      containerPadding: "8px 18px",
      alignment: "center",
      position: "center",
      positionYPercent: 62,
      maxWordsPerLine: 3,
      lineSpacing: 1.2,
      letterSpacing: "0.02em",
      animation: "bounce",
      animationSpeed: 0.15,
      highlightingMode: "current-word",
    },
  },

  // 9. PODCAST: Diary CEO
  {
    id: "diary-ceo",
    name: "Diary CEO",
    category: "Podcast",
    tagline: "Dark moody podcast subtitle bar",
    description: "Deep, sophisticated aesthetic with inactive word dimming and stark white spoken focus.",
    style: {
      fontFamily: "'Syne', 'Inter', sans-serif",
      fontSize: 25,
      fontWeight: 700,
      textTransform: "none",
      textColor: "rgba(148, 163, 184, 0.45)",
      highlightColor: "#FFFFFF",
      shadowColor: "rgba(0, 0, 0, 0.9)",
      shadowBlur: 12,
      shadowOffsetX: 0,
      shadowOffsetY: 3,
      containerBg: "rgba(10, 10, 14, 0.88)",
      containerBorder: "1px solid rgba(255, 255, 255, 0.12)",
      containerBorderRadius: 18,
      containerPadding: "10px 22px",
      backdropBlur: 16,
      alignment: "center",
      position: "bottom",
      positionYPercent: 82,
      maxWordsPerLine: 4,
      lineSpacing: 1.3,
      letterSpacing: "-0.01em",
      animation: "fade",
      animationSpeed: 0.2,
      highlightingMode: "current-word",
    },
  },

  // 10. PODCAST: Studio Mic Pill
  {
    id: "studio-pill",
    name: "Studio Pill",
    category: "Podcast",
    tagline: "Rounded pill capsule with studio cyan",
    description: "Broadcast-quality studio badge with electric cyan keyword accents.",
    style: {
      fontFamily: "'Montserrat', sans-serif",
      fontSize: 24,
      fontWeight: 700,
      textTransform: "none",
      textColor: "#E2E8F0",
      highlightColor: "#38BDF8",
      containerBg: "rgba(2, 6, 23, 0.88)",
      containerBorder: "1.5px solid rgba(56, 189, 248, 0.35)",
      containerBorderRadius: 9999,
      containerPadding: "10px 26px",
      backdropBlur: 12,
      alignment: "center",
      position: "bottom",
      positionYPercent: 80,
      maxWordsPerLine: 4,
      lineSpacing: 1.25,
      letterSpacing: "0.01em",
      animation: "slide-up",
      animationSpeed: 0.18,
      highlightingMode: "keyword",
    },
  },

  // 11. GAMING: Cyberpunk Neon
  {
    id: "cyber-neon",
    name: "Cyber Neon",
    category: "Gaming",
    tagline: "Cyan & magenta neon glow",
    description: "Cyberpunk dual-tone aesthetic with high-saturation glow shadows.",
    style: {
      fontFamily: "'Oswald', sans-serif",
      fontSize: 36,
      fontWeight: 800,
      textTransform: "uppercase",
      textColor: "#00F0FF",
      highlightColor: "#FF0055",
      strokeColor: "#050014",
      strokeWidth: 2,
      shadowColor: "rgba(0, 240, 255, 0.8)",
      shadowBlur: 20,
      shadowOffsetX: 0,
      shadowOffsetY: 0,
      containerBg: "rgba(13, 2, 33, 0.85)",
      containerBorder: "1px solid rgba(0, 240, 255, 0.4)",
      containerBorderRadius: 10,
      containerPadding: "8px 20px",
      alignment: "center",
      position: "center",
      positionYPercent: 60,
      maxWordsPerLine: 3,
      lineSpacing: 1.2,
      letterSpacing: "0.06em",
      animation: "pop",
      animationSpeed: 0.16,
      highlightingMode: "alternating",
    },
  },

  // 12. GAMING: Arcade Punch
  {
    id: "arcade-punch",
    name: "Arcade Punch",
    category: "Gaming",
    tagline: "Retro arcade yellow & crimson",
    description: "Nostalgic comic-arcade energy with punchy outlines and bold shadow bounce.",
    style: {
      fontFamily: "'Bangers', 'Impact', sans-serif",
      fontSize: 40,
      fontWeight: 900,
      textTransform: "uppercase",
      textColor: "#FFDD00",
      highlightColor: "#FF2A2A",
      strokeColor: "#000000",
      strokeWidth: 3.5,
      shadowColor: "#000000",
      shadowBlur: 0,
      shadowOffsetX: 4,
      shadowOffsetY: 4,
      containerBg: "transparent",
      alignment: "center",
      position: "center",
      positionYPercent: 58,
      maxWordsPerLine: 2,
      lineSpacing: 1.15,
      letterSpacing: "0.05em",
      animation: "bounce",
      animationSpeed: 0.18,
      highlightingMode: "current-word",
    },
  },

  // 13. UGC: Organic Light Card
  {
    id: "ugc-organic",
    name: "Organic UGC",
    category: "UGC",
    tagline: "Bright modern aesthetic card",
    description: "Fresh high-converting style for product unboxings, reviews, and lifestyle TikToks.",
    style: {
      fontFamily: "'Poppins', sans-serif",
      fontSize: 24,
      fontWeight: 600,
      textTransform: "none",
      textColor: "#1E293B",
      highlightColor: "#7C3AED",
      containerBg: "rgba(255, 255, 255, 0.94)",
      containerBorder: "1px solid rgba(226, 232, 240, 0.9)",
      containerBorderRadius: 18,
      containerPadding: "10px 22px",
      shadowColor: "rgba(0, 0, 0, 0.2)",
      shadowBlur: 16,
      shadowOffsetX: 0,
      shadowOffsetY: 6,
      alignment: "center",
      position: "center",
      positionYPercent: 65,
      maxWordsPerLine: 4,
      lineSpacing: 1.3,
      letterSpacing: "0em",
      animation: "slide-down",
      animationSpeed: 0.2,
      highlightingMode: "current-word",
    },
  },

  // 14. UGC: TikTok Native Box
  {
    id: "tiktok-native",
    name: "Native Story",
    category: "UGC",
    tagline: "Classic TikTok inverted subtitle box",
    description: "Familiar in-app social feel with white text on dark card and white background on spoken word.",
    style: {
      fontFamily: "'Inter', sans-serif",
      fontSize: 28,
      fontWeight: 700,
      textTransform: "none",
      textColor: "#FFFFFF",
      highlightColor: "#000000",
      highlightBg: "#FFFFFF",
      containerBg: "rgba(0, 0, 0, 0.8)",
      containerBorderRadius: 8,
      containerPadding: "8px 16px",
      alignment: "center",
      position: "center",
      positionYPercent: 62,
      maxWordsPerLine: 3,
      lineSpacing: 1.25,
      letterSpacing: "0.01em",
      animation: "pop",
      animationSpeed: 0.16,
      highlightingMode: "current-word",
    },
  },

  // 15. CINEMATIC: Letterbox Classic
  {
    id: "cinematic-letterbox",
    name: "Cinematic Film",
    category: "Cinematic",
    tagline: "Letterspaced documentary title",
    description: "Wide letterspacing, subtle lower-third placement, and smooth cinematic dissolve.",
    style: {
      fontFamily: "'Montserrat', sans-serif",
      fontSize: 20,
      fontWeight: 600,
      textTransform: "uppercase",
      textColor: "#E2E8F0",
      highlightColor: "#FFFFFF",
      shadowColor: "rgba(0, 0, 0, 0.95)",
      shadowBlur: 14,
      shadowOffsetX: 0,
      shadowOffsetY: 2,
      containerBg: "rgba(0, 0, 0, 0.5)",
      containerBorderRadius: 6,
      containerPadding: "6px 16px",
      alignment: "center",
      position: "bottom",
      positionYPercent: 86,
      maxWordsPerLine: 5,
      lineSpacing: 1.4,
      letterSpacing: "0.22em",
      animation: "fade",
      animationSpeed: 0.25,
      highlightingMode: "full-line",
    },
  },

  // 16. EDUCATIONAL: Vox Tape
  {
    id: "vox-tape",
    name: "Vox Explainer",
    category: "Educational",
    tagline: "Yellow highlighter tape reveal",
    description: "Documentary explainer style with yellow tape background on key concepts and figures.",
    style: {
      fontFamily: "'Oswald', 'Bebas Neue', sans-serif",
      fontSize: 32,
      fontWeight: 700,
      textTransform: "uppercase",
      textColor: "#FFFFFF",
      highlightColor: "#000000",
      highlightBg: "#FACC15",
      shadowColor: "rgba(0, 0, 0, 0.8)",
      shadowBlur: 10,
      shadowOffsetX: 0,
      shadowOffsetY: 3,
      containerBg: "rgba(15, 23, 42, 0.85)",
      containerBorderRadius: 10,
      containerPadding: "8px 20px",
      alignment: "center",
      position: "center",
      positionYPercent: 60,
      maxWordsPerLine: 3,
      lineSpacing: 1.25,
      letterSpacing: "0.03em",
      animation: "type",
      animationSpeed: 0.2,
      highlightingMode: "keyword",
    },
  },
];

// Studio presets share the same catalogue across standalone captions and the editor.
const studioBase: CaptionStyleConfig = {
  fontFamily: "'Montserrat', sans-serif", fontSize: 38, fontWeight: 900,
  textTransform: "uppercase", textColor: "#FFFFFF", highlightColor: "#FFFFFF",
  strokeColor: "#111827", strokeWidth: 2, shadowColor: "#000000", shadowBlur: 6,
  shadowOffsetX: 0, shadowOffsetY: 2, containerBg: "transparent", alignment: "center",
  position: "bottom", positionYPercent: 80, maxWordsPerLine: 3, lineSpacing: 1.12,
  letterSpacing: "0.01em", animation: "fade", animationSpeed: 0.15, highlightingMode: "keyword",
};
export const STUDIO_CAPTION_TEMPLATES: CaptionTemplate[] = [
  {id:"studio-lime",name:"Creator Lime",category:"Trending",tagline:"Lime type. Strong contrast.",description:"A punchy lime caption for short creator clips.",style:{...studioBase,textColor:"#D9FF43",highlightColor:"#D9FF43",strokeWidth:3}},
  {id:"studio-cobalt",name:"Cobalt Block",category:"Bold",tagline:"White on electric blue",description:"A clear blue caption block for strong statements.",style:{...studioBase,fontFamily:"'Outfit', sans-serif",fontSize:36,containerBg:"#3448F5",strokeWidth:0,shadowBlur:0,containerBorderRadius:8,containerPadding:"10px 18px"}},
  {id:"studio-ivory",name:"Soft Ivory",category:"Minimal",tagline:"Warm white. Quiet confidence.",description:"Understated warm captions for personal stories and interviews.",style:{...studioBase,fontFamily:"'Poppins', sans-serif",fontSize:28,fontWeight:500,textTransform:"none",textColor:"#FFF3DC",highlightColor:"#FFF3DC",strokeWidth:0,shadowBlur:12,maxWordsPerLine:5,lineSpacing:1.3}},
  {id:"studio-ink",name:"Ink Outline",category:"Bold",tagline:"Oversized white, deep outline",description:"Heavy clean lettering with a dark outline for busy footage.",style:{...studioBase,fontFamily:"'Oswald', sans-serif",fontSize:44,strokeWidth:4,shadowBlur:0,maxWordsPerLine:2}},
  {id:"studio-amber",name:"Amber Focus",category:"Creator",tagline:"Warm amber on midnight",description:"A warm editorial caption with a dark background.",style:{...studioBase,fontSize:34,textColor:"#FFD27D",highlightColor:"#FFD27D",containerBg:"#171B2A",strokeWidth:0,shadowBlur:0,containerPadding:"8px 16px",containerBorderRadius:10}},
  {id:"studio-mono",name:"Mono Notes",category:"Educational",tagline:"Precise, clean, technical",description:"Monospace notes for explanations and tutorials.",style:{...studioBase,fontFamily:"'JetBrains Mono', monospace",fontSize:26,fontWeight:600,textTransform:"none",textColor:"#B9F4FF",highlightColor:"#B9F4FF",containerBg:"#101B2A",strokeWidth:0,shadowBlur:0,maxWordsPerLine:5,letterSpacing:"0em",lineSpacing:1.3}},
  {id:"studio-rose",name:"Rose Punch",category:"Trending",tagline:"Hot pink, bold delivery",description:"Vivid pink type for energetic short-form stories.",style:{...studioBase,fontFamily:"'Outfit', sans-serif",fontSize:40,textColor:"#FF8DC7",highlightColor:"#FF8DC7",strokeWidth:3}},
  {id:"studio-podcast",name:"Podcast Slate",category:"Podcast",tagline:"White type, soft slate backdrop",description:"A restrained subtitle treatment for conversations.",style:{...studioBase,fontFamily:"'Inter', sans-serif",fontSize:30,fontWeight:600,textTransform:"none",containerBg:"#263247",strokeWidth:0,shadowBlur:0,maxWordsPerLine:5,lineSpacing:1.3,containerBorderRadius:8,containerPadding:"8px 16px"}},
];

// Mixed fonts are real word-level typography, not fallback font lists.
export const FONT_PAIR_CAPTION_TEMPLATES: CaptionTemplate[] = [
 {id:"signature-poppins",name:"Signature Pop",category:"Creator",tagline:"Poppins + Caveat",description:"Clean Poppins with a handwritten final word.",style:{...studioBase,fontFamily:"'Poppins', sans-serif",fontWeight:600,fontSize:38,fontAccent:{font:"Caveat",weight:700},textTransform:"none",strokeWidth:1,shadowBlur:5,lineSpacing:1.35,maxWordsPerLine:4}},
 {id:"dancing-poppins",name:"Dancing Story",category:"UGC",tagline:"Poppins + Dancing Script",description:"Soft creator captions with a calligraphy accent.",style:{...studioBase,fontFamily:"'Poppins', sans-serif",fontWeight:500,fontSize:38,fontAccent:{font:"Dancing Script",weight:700},textTransform:"none",textColor:"#FFF3DC",highlightColor:"#FFD27D",highlightingMode:"keyword",strokeWidth:1,shadowBlur:6,lineSpacing:1.4,maxWordsPerLine:4}},
 {id:"editorial-serif",name:"Editorial Duo",category:"Cinematic",tagline:"Montserrat + Playfair Display",description:"Modern sans-serif captions with an elegant serif ending.",style:{...studioBase,fontFamily:"'Montserrat', sans-serif",fontWeight:600,fontSize:36,fontAccent:{font:"Playfair Display",weight:600},textTransform:"none",textColor:"#FFF8ED",highlightColor:"#FFF8ED",strokeWidth:1,shadowBlur:6,lineSpacing:1.35,maxWordsPerLine:5}},
 {id:"handwritten-outfit",name:"Handwritten Hook",category:"Trending",tagline:"Outfit + Caveat",description:"Bold white captions with handwritten personality.",style:{...studioBase,fontFamily:"'Outfit', sans-serif",fontWeight:700,fontSize:42,fontAccent:{font:"Caveat",weight:700},textTransform:"none",highlightColor:"#D9FF43",highlightingMode:"keyword",strokeWidth:2,lineSpacing:1.35,maxWordsPerLine:3}}
];
STUDIO_CAPTION_TEMPLATES.unshift(...FONT_PAIR_CAPTION_TEMPLATES);
DEFAULT_CAPTION_TEMPLATES.push(...FONT_PAIR_CAPTION_TEMPLATES);
DEFAULT_CAPTION_TEMPLATES.push(...STUDIO_CAPTION_TEMPLATES.filter(t=>!FONT_PAIR_CAPTION_TEMPLATES.includes(t)));

export {isImportantWord as isViralKeyword} from "./highlighting";

export function getTemplateById(id: string, customTemplates: CaptionTemplate[] = []): CaptionTemplate {
  const match = [...customTemplates, ...DEFAULT_CAPTION_TEMPLATES].find((t) => t.id === id);
  return match || DEFAULT_CAPTION_TEMPLATES[0];
}
