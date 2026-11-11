"use client";

import React, { memo } from "react";
import { formatTime } from "@/app/lib/editor/model";

interface ScrubberProps {
  time: number;
  pps: number;
  height: number;
  fps?: number;
  showHandle?: boolean;
}

/**
 * High-precision timeline playhead and scrubber bar synchronized with playback clock and frame updates.
 * Features a red needle pointer head and a crisp 2px red laser playhead bar.
 */
export const Scrubber = memo(function Scrubber({
  time,
  pps,
  height,
  fps = 30,
  showHandle = true,
}: ScrubberProps) {
  const left = Math.max(0, time * pps);

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
          <div className="w-[14px] h-[14px] bg-red-500 rounded-sm shadow-md shadow-red-500/40 flex items-center justify-center">
            <div className="w-[2px] h-[6px] bg-white rounded-full opacity-80" />
          </div>
          {/* Triangular pointer tip */}
          <div className="w-0 h-0 border-l-[7px] border-l-transparent border-r-[7px] border-r-transparent border-t-[6px] border-t-red-500 -mt-[1px]" />
          
          {/* Floating Timecode Pill on Hover */}
          <div className="absolute -top-6 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-[#0F172A] border border-slate-800 text-white font-mono text-[10px] px-1.5 py-0.5 rounded shadow-lg whitespace-nowrap pointer-events-none">
            {formatTime(time, fps)}
          </div>
        </div>
      )}

      {/* Synchronized Vertical Laser Playhead Bar */}
      <div
        className="w-[2px] bg-red-500 z-50 pointer-events-none shadow-[0_0_8px_rgba(239,68,68,0.7)]"
        style={{
          height: `${Math.max(0, height - (showHandle ? 18 : 0))}px`,
        }}
      />
    </div>
  );
});

export default Scrubber;
