"use client";
import { useState } from "react";
import CaptionStylePreview from "../captions/CaptionStylePreview";
import { DEFAULT_CAPTION_TEMPLATES } from "../../lib/captions/templates";

export default function CaptionDemo() {
  const templates = DEFAULT_CAPTION_TEMPLATES.slice(0, 3);
  const [selected, setSelected] = useState(0);
  return (
    <div>
      <CaptionStylePreview style={templates[selected].style} compact />
      <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Sample caption templates">
        {templates.map((t, i) => (
          <button
            key={t.id}
            type="button"
            aria-pressed={selected === i}
            onClick={() => setSelected(i)}
            className={
              "rounded-full border px-4 py-2 text-sm font-medium transition-all focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600 cursor-pointer " +
              (selected === i
                ? "border-[#1D4FB1] bg-[#1D4FB1] text-white shadow-sm"
                : "border-slate-200/80 bg-white/85 text-slate-700 hover:bg-white")
            }
          >
            {t.name}
          </button>
        ))}
      </div>
      <p className="mt-3 text-xs text-[#52647e]">
        Interactive style sample using the Caption Studio renderer. Open the studio to use your own video.
      </p>
    </div>
  );
}
