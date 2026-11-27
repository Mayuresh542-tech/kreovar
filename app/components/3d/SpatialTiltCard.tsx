"use client";

import React, { useRef, useCallback, useEffect } from "react";

export interface SpatialTiltCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  maxTilt?: number;
  glare?: boolean;
  disabled?: boolean;
}

/**
 * Frosted spatial 3D tilt container with cursor-following specular sheen.
 * Automatically disables transform motion when `prefers-reduced-motion: reduce` or touch-only pointer is active.
 */
export default function SpatialTiltCard({
  children,
  className = "",
  maxTilt = 5.5,
  glare = true,
  disabled = false,
  onPointerMove,
  onPointerLeave,
  ...rest
}: SpatialTiltCardProps) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number>(0);
  const enabledRef = useRef(true);

  useEffect(() => {
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    const finePointer = window.matchMedia?.("(hover: hover) and (pointer: fine)")?.matches;
    enabledRef.current = !disabled && !reduced && (finePointer ?? true);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [disabled]);

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      onPointerMove?.(e);
      if (!enabledRef.current || !cardRef.current) return;
      const el = cardRef.current;
      // Do not tilt the outer wrapper when pointer is interacting directly with an embedded 3D WebGL stage
      if ((e.target as HTMLElement | null)?.closest?.(".vx-3d-viewport")) {
        el.style.setProperty("--vx-rx", "0deg");
        el.style.setProperty("--vx-ry", "0deg");
        el.removeAttribute("data-tilted");
        return;
      }
      const rect = el.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const px = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const py = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
      const rx = ((0.5 - py) * 2 * maxTilt).toFixed(2);
      const ry = ((px - 0.5) * 2 * maxTilt).toFixed(2);
      const gx = (px * 100).toFixed(1);
      const gy = (py * 100).toFixed(1);

      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        el.style.setProperty("--vx-rx", `${rx}deg`);
        el.style.setProperty("--vx-ry", `${ry}deg`);
        el.style.setProperty("--vx-gx", `${gx}%`);
        el.style.setProperty("--vx-gy", `${gy}%`);
        el.setAttribute("data-tilted", "true");
      });
    },
    [maxTilt, onPointerMove]
  );

  const handlePointerLeave = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      onPointerLeave?.(e);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      const el = cardRef.current;
      if (!el) return;
      el.style.setProperty("--vx-rx", "0deg");
      el.style.setProperty("--vx-ry", "0deg");
      el.removeAttribute("data-tilted");
    },
    [onPointerLeave]
  );

  return (
    <div
      ref={cardRef}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      className={`vx-tilt-card ${glare ? "vx-tilt-glare" : ""} ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}
