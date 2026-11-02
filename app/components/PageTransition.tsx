"use client";

import { motion, useReducedMotion } from "framer-motion";
import { pageVariants } from "../lib/motion";

interface PageTransitionProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Wraps page content with a smooth fade + slide-up entry animation.
 * Use inside any page rendered within StudioShell or the dashboard layout.
 *
 * Respects prefers-reduced-motion via Framer Motion's built-in support.
 */
export default function PageTransition({ children, className }: PageTransitionProps) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      initial={reduced ? false : "hidden"}
      animate="visible"
      variants={pageVariants}
      className={className}
    >
      {children}
    </motion.div>
  );
}
