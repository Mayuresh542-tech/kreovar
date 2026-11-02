/**
 * Veelox Motion Design System
 * ─────────────────────────────
 * Centralized motion configuration for consistent, premium animations.
 *
 * Style: Smooth, cinematic, fast, intentional, minimal, professional.
 * Reference: Apple-level smoothness + modern AI SaaS.
 *
 * Avoid: Bouncy cartoons, excessive scaling, random movement,
 *        slow transitions, over-animation, distracting effects.
 */

import { type Variants, type Transition } from "framer-motion";

/* ─── Easing Curves ─── */

/** Apple-style smooth deceleration — use for enter / appear */
export const EASE_OUT: [number, number, number, number] = [0.16, 1, 0.3, 1];

/** Smooth acceleration — use for exit / disappear */
export const EASE_IN: [number, number, number, number] = [0.4, 0, 1, 0.5];

/** Balanced curve — use for interactive transitions (tabs, toggles) */
export const EASE_IN_OUT: [number, number, number, number] = [0.4, 0, 0.2, 1];

/** Gentle spring-like feel without bounce — use for hover micro-interactions */
export const EASE_SPRING: [number, number, number, number] = [0.22, 1, 0.36, 1];

/* ─── Timing Constants ─── */

/** Ultra-fast for micro-interactions (hover, active states) */
export const DURATION_MICRO = 0.15;

/** Fast for UI feedback (buttons, toggles, tooltips) */
export const DURATION_FAST = 0.18;

/** Standard for content transitions (cards, sections) */
export const DURATION_NORMAL = 0.22;

/** Cinematic for page / hero reveals */
export const DURATION_SLOW = 0.3;

/** Stagger delay between sibling elements */
export const STAGGER_CHILDREN = 0.025;

/** Stagger delay between major sections */
export const STAGGER_SECTIONS = 0.04;

/* ─── Page / Section Transition Variants ─── */

export const pageVariants: Variants = {
  hidden: {
    opacity: 0,
    y: 16,
    filter: "blur(4px)",
  },
  visible: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: {
      duration: DURATION_NORMAL,
      ease: EASE_OUT,
      staggerChildren: STAGGER_SECTIONS,
    },
  },
  exit: {
    opacity: 0,
    y: -8,
    filter: "blur(2px)",
    transition: {
      duration: DURATION_FAST,
      ease: EASE_IN,
    },
  },
};

/* ─── Card / Item Variants (stagger children) ─── */

export const staggerContainer: Variants = {
  hidden: { opacity: 1 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: STAGGER_CHILDREN,
      delayChildren: 0.08,
    },
  },
};

export const staggerItem: Variants = {
  hidden: {
    opacity: 0,
    y: 12,
  },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: DURATION_NORMAL,
      ease: EASE_OUT,
    },
  },
};

/* ─── Slide-in Variants ─── */

export const slideInLeft: Variants = {
  hidden: { opacity: 0, x: -20 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: DURATION_NORMAL, ease: EASE_OUT },
  },
  exit: {
    opacity: 0,
    x: -20,
    transition: { duration: DURATION_FAST, ease: EASE_IN },
  },
};

export const slideInRight: Variants = {
  hidden: { opacity: 0, x: 20 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: DURATION_NORMAL, ease: EASE_OUT },
  },
  exit: {
    opacity: 0,
    x: 20,
    transition: { duration: DURATION_FAST, ease: EASE_IN },
  },
};

export const slideInUp: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: DURATION_NORMAL, ease: EASE_OUT },
  },
  exit: {
    opacity: 0,
    y: 8,
    transition: { duration: DURATION_FAST, ease: EASE_IN },
  },
};

/* ─── Fade Variants ─── */

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: DURATION_NORMAL, ease: EASE_OUT },
  },
  exit: {
    opacity: 0,
    transition: { duration: DURATION_FAST, ease: EASE_IN },
  },
};

/* ─── Scale Variants (subtle — max 1.02) ─── */

export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.97 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: DURATION_NORMAL, ease: EASE_OUT },
  },
  exit: {
    opacity: 0,
    scale: 0.97,
    transition: { duration: DURATION_FAST, ease: EASE_IN },
  },
};

/* ─── Modal / Overlay Variants ─── */

export const overlayVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: DURATION_FAST, ease: EASE_OUT },
  },
  exit: {
    opacity: 0,
    transition: { duration: DURATION_FAST, ease: EASE_IN },
  },
};

export const modalVariants: Variants = {
  hidden: { opacity: 0, scale: 0.96, y: 8 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { duration: DURATION_NORMAL, ease: EASE_OUT },
  },
  exit: {
    opacity: 0,
    scale: 0.96,
    y: 8,
    transition: { duration: DURATION_FAST, ease: EASE_IN },
  },
};

/* ─── Dropdown Variants ─── */

export const dropdownVariants: Variants = {
  hidden: {
    opacity: 0,
    scale: 0.95,
    y: -4,
  },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: {
      duration: DURATION_FAST,
      ease: EASE_OUT,
    },
  },
  exit: {
    opacity: 0,
    scale: 0.95,
    y: -4,
    transition: {
      duration: DURATION_MICRO,
      ease: EASE_IN,
    },
  },
};

/* ─── Sidebar Drawer Variants ─── */

export const sidebarDrawerVariants: Variants = {
  hidden: { x: "-100%" },
  visible: {
    x: 0,
    transition: { duration: DURATION_NORMAL, ease: EASE_OUT },
  },
  exit: {
    x: "-100%",
    transition: { duration: DURATION_FAST, ease: EASE_IN },
  },
};

/* ─── Hover Presets (use with whileHover) ─── */

export const hoverLift = {
  y: -3,
  transition: { duration: DURATION_MICRO, ease: EASE_SPRING },
};

export const hoverScale = {
  scale: 1.02,
  transition: { duration: DURATION_MICRO, ease: EASE_SPRING },
};

export const hoverGlow = {
  boxShadow: "0 0 20px rgba(14, 165, 233, 0.25)",
  transition: { duration: DURATION_FAST, ease: EASE_OUT },
};

/* ─── Tap Presets (use with whileTap) ─── */

export const tapScale = {
  scale: 0.97,
  transition: { duration: DURATION_MICRO, ease: EASE_IN_OUT },
};

/* ─── Shared Transition Presets ─── */

export const springTransition: Transition = {
  type: "spring",
  stiffness: 350,
  damping: 30,
  mass: 0.8,
};

export const smoothTransition: Transition = {
  duration: DURATION_NORMAL,
  ease: EASE_OUT,
};

/* ─── Viewport Animation Config ─── */

export const viewportOnce = {
  once: true,
  margin: "-60px" as const,
};

/* ─── Reduced Motion Hook ─── */

export function useReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  return mq.matches;
}
