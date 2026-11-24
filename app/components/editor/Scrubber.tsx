"use client";

import React, { memo } from "react";
import { formatTime } from "@/app/lib/editor/model";

interface ScrubberProps {
  time: number;
  pps: number;
  height: number;
  fps?: number;
  showHandle?: boolean;
  color?: string;
}

/**
 * High-precision CapCut Studio timeline playhead and scrubber bar
 * synchronized with playback clock and frame updates.
 * Features a signature CapCut Cyan (#00E5FF) needle head and vertical laser playhead line.
 */
export const Scrubber = memo(function Scrubber({
  time,
  pps,
  height,
  fps = 30,
  showHandle = true,
  color = "#0284c7",
}: ScrubberProps) {
  const left = Math.max(0, time * pps);
  const isCyan = color === "#0284c7" || color === "#00E5FF";

  return (
    <div
      className="absolute top-0 bottom-0 pointer-events-none z-40 transition-transform duration-75 will-change-transform"
      style={{
        transform: `translateX(${left}px)`,
        height: `${height}px`,
      }}
      aria-hidden="true"
    >
      {/* Top Handle / Needle */}
      {showHandle && (
        <div className="relative -left-[7px] -top-0 flex flex-col items-center pointer-events-auto cursor-ew-resize group">
          <div
            className={`w-[14px] h-[14px] rounded-sm shadow-md flex items-center justify-center ${
              isCyan ? "bg-sky-500 shadow-sky-500/50" : "bg-red-500 shadow-red-500/40"
            }`}
            style={{ backgroundColor: color }}
          >
            <div className="w-[2px] h-[6px] bg-white rounded-full opacity-90" />
          </div>
          {/* Triangular pointer tip */}
          <div
            className="w-0 h-0 border-l-[7px] border-l-transparent border-r-[7px] border-r-transparent border-t-[6px] -mt-[1px]"
            style={{ borderTopColor: color }}
          />
          
          {/* Floating Timecode Pill on Hover */}
          <div className="absolute -top-6 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-900 border border-slate-700 text-white font-mono text-[10px] px-1.5 py-0.5 rounded shadow-lg whitespace-nowrap pointer-events-none z-50">
            {formatTime(time, fps)}
          </div>
        </div>
      )}

      {/* Synchronized Vertical Laser Playhead Bar */}
      <div
        className={`w-[2px] z-50 pointer-events-none ${
          isCyan ? "shadow-[0_0_6px_rgba(2,132,199,0.5)]" : "shadow-[0_0_8px_rgba(239,68,68,0.7)]"
        }`}
        style={{
          backgroundColor: color,
          height: `${Math.max(0, height - (showHandle ? 18 : 0))}px`,
        }}
      />
    </div>
  );
});

export default Scrubber;
