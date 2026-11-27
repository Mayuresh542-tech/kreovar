"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Eye, Search, Sparkles, X } from "lucide-react";
import { assetHeaders, assetResponse, uploadAssetFile, projectAssetItem } from "../../lib/assets/client";
import { downloadBlob } from "../../lib/assets/downloadBlob";
import type { StudioAsset } from "../../lib/assets/types";
import { readMediaDuration } from "../../lib/media/metadata";
import { mediaFilename } from "../../lib/media/download";
import {
  KREOVAR_MOTION_TEMPLATES,
  type KreovarMotionTemplate,
} from "../../lib/editor/kreovarMotionTemplates";
import MotionGraphicCanvasPreview from "./MotionGraphicCanvasPreview";
import SpatialTiltCard from "../3d/SpatialTiltCard";
import AddToProjectModal from "../projects/AddToProjectModal";

interface MotionItem {
  id: string;
  videoUrl: string;
  duration: number;
  size: number;
  thumbnail: string;
  creatorName: string;
  sourcePage: string;
}

const CATEGORIES = [
  "All",
  "Data & Charts",
  "Lists & Explainers",
  "Broadcast & Social",
  "Callouts & Offers",
] as const;

export default function MotionLibrary({
  compact = false,
  onCreated,
}: {
  compact?: boolean;
  onCreated?: (asset: StudioAsset) => Promise<void> | void;
}) {
  const [query, setQuery] = useState("abstract");
  const [videos, setVideos] = useState<MotionItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<StudioAsset>();
  const [searched, setSearched] = useState(false);

  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("All");
  const [templateFilter, setTemplateFilter] = useState("");
  const [inspectTemplate, setInspectTemplate] = useState<KreovarMotionTemplate | null>(null);

  const lock = useRef(false);
  const button = compact
    ? "vx-secondary vx-wide"
    : "rounded-xl border border-slate-200/90 bg-white/90 hover:bg-white px-3.5 py-2 text-sm font-medium text-[#142440] transition-colors disabled:opacity-50 cursor-pointer";

  const filteredTemplates = useMemo(() => {
    const q = templateFilter.trim().toLowerCase();
    return KREOVAR_MOTION_TEMPLATES.filter((tpl) => {
      if (category !== "All" && tpl.category !== category) return false;
      if (!q) return true;
      return `${tpl.name} ${tpl.description} ${tpl.kind} ${tpl.category}`.toLowerCase().includes(q);
    });
  }, [category, templateFilter]);

  async function action(work: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Motion graphics request failed.");
    } finally {
      setBusy(false);
      lock.current = false;
    }
  }

  async function save(item: MotionItem, download = false) {
    await action(async () => {
      const response = await fetch(
        "/api/broll/download?" + new URLSearchParams({ url: item.videoUrl, filename: "Motion-" + item.id + ".mp4" }),
        { headers: await assetHeaders(), signal: AbortSignal.timeout(110000) }
      );
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Download failed.");
      }
      const blob = await response.blob(),
        file = new File([blob], mediaFilename("Motion-" + item.id, blob.type), { type: blob.type });
      if (download) {
        downloadBlob(blob, file.name);
        return;
      }
      const duration = await readMediaDuration(file);
      const saved = await uploadAssetFile(file, {
        duration,
        providerAssetId: item.id,
        sourcePage: item.sourcePage,
      });
      if (onCreated) await onCreated(saved);
      else setSelected(saved);
    });
  }

  return (
    <div className={compact ? "space-y-4" : "space-y-10"}>
      {/* 1. Interactive Live Procedural Motion Graphics Templates */}
      {!compact && (
        <section aria-labelledby="procedural-templates-heading" className="space-y-5">
          <div className="vx-frosted-surface rounded-3xl p-5 sm:p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 border border-blue-200/80 px-2.5 py-1 text-[10px] font-mono font-semibold uppercase tracking-wider text-[#1D4FB1]">
                  <Sparkles className="w-3 h-3" /> Interactive Canvas2D Previews
                </div>
                <h2 id="procedural-templates-heading" className="mt-2 text-lg sm:text-xl font-bold text-[#142440]">
                  Built-In Parametric Motion Graphics ({KREOVAR_MOTION_TEMPLATES.length})
                </h2>
                <p className="text-xs sm:text-sm text-[#52647e]">
                  Live animated vector cards rendered in real time. Click Preview to scrub frames and test themes before adding in the editor.
                </p>
              </div>
              <div className="relative w-full sm:w-64 shrink-0">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  aria-label="Filter procedural motion templates"
                  value={templateFilter}
                  onChange={(e) => setTemplateFilter(e.target.value)}
                  placeholder="Filter stat, chart, lower third…"
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200/90 bg-white/90 text-xs text-[#142440] placeholder:text-slate-400 focus:outline-none focus:border-[#1D4FB1]"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter templates by category">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategory(cat)}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                    category === cat
                      ? "bg-[#13223E] text-white shadow-xs"
                      : "bg-white/80 text-slate-600 border border-slate-200/80 hover:bg-white hover:text-[#142440]"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          <div className="vx-stagger-row grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredTemplates.map((tpl) => (
              <SpatialTiltCard
                key={tpl.id}
                maxTilt={4}
                className="vx-frosted-surface rounded-2xl p-4 flex flex-col justify-between gap-3"
              >
                <div className="space-y-3">
                  <MotionGraphicCanvasPreview template={tpl} compact aspect="16:9" />
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-sm font-bold text-[#142440] truncate">{tpl.name}</h3>
                      <span
                        className="rounded-md px-2 py-0.5 text-[10px] font-mono font-semibold shrink-0"
                        style={{ backgroundColor: `${tpl.accent}18`, color: tpl.accent }}
                      >
                        {tpl.kind}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-[#52647e] line-clamp-2">{tpl.description}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-slate-200/60">
                  <button
                    type="button"
                    onClick={() => setInspectTemplate(tpl)}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200/90 bg-white/85 hover:bg-white py-2 px-3 text-xs font-semibold text-[#142440] transition-colors cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5 text-[#1D4FB1]" />
                    <span>Preview &amp; Scrub</span>
                  </button>
                  <Link
                    href="/editor"
                    className="inline-flex items-center justify-center gap-1 rounded-xl bg-[#13223E] hover:bg-[#1D4FB1] py-2 px-3 text-xs font-semibold text-white transition-colors"
                  >
                    <span>Editor</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </SpatialTiltCard>
            ))}
          </div>
        </section>
      )}

      {/* 2. Stock Animated Motion Clips Search */}
      <section className={compact ? "vx-feature-note" : "vx-frosted-surface rounded-3xl p-5 sm:p-6 space-y-5"}>
        <div className="space-y-1">
          <strong className="text-[#142440] text-base">{compact ? "Motion graphics" : "Stock Motion Overlays & Backgrounds"}</strong>
          <p className={compact ? "vx-hint" : "text-sm text-[#52647e]"}>
            Search animation clips and save them to your private Asset Library.
          </p>
        </div>

        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void action(async () => {
              const data = await assetResponse(
                await fetch("/api/stock/motion?" + new URLSearchParams({ query }), {
                  headers: await assetHeaders(),
                })
              );
              setVideos(data.videos);
              setSearched(true);
            });
          }}
        >
          <input
            aria-label="Search motion graphics"
            placeholder="Particles, abstract, transitions…"
            maxLength={100}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 min-w-[200px] rounded-xl border border-slate-200/90 bg-white/90 px-3.5 py-2 text-sm text-[#142440] focus:outline-none focus:border-[#1D4FB1]"
          />
          <button className={button} disabled={busy || !query.trim()}>
            {busy ? "Working…" : "Search motion graphics"}
          </button>
        </form>

        {error && (
          <p role="alert" className={compact ? "vx-error" : "text-sm text-rose-600"}>
            {error}
          </p>
        )}
        {searched && !videos.length && <p className="text-sm text-[#52647e]">No matching animation clips.</p>}
        {videos.length > 0 && (
          <p className={compact ? "vx-hint" : "text-sm text-[#52647e]"}>
            Videos provided by{" "}
            <a href="https://pixabay.com" target="_blank" rel="noreferrer" className="underline text-[#1D4FB1]">
              Pixabay
            </a>
          </p>
        )}

        <div className={compact ? "space-y-3" : "grid sm:grid-cols-2 xl:grid-cols-3 gap-4"}>
          {videos.map((item) => (
            <article key={item.id} className={compact ? "space-y-2" : "rounded-2xl bg-white/90 border border-slate-200/90 p-4 space-y-3"}>
              <video
                src={item.videoUrl}
                controls
                preload="none"
                poster={item.thumbnail || undefined}
                className="w-full max-h-48 rounded-lg"
              />
              <p className="text-xs text-[#52647e]">
                {item.duration}s ·{" "}
                <a href={item.sourcePage} target="_blank" rel="noreferrer" className="underline">
                  {item.creatorName}
                </a>
              </p>
              <div className="flex flex-wrap gap-2">
                <button className={button} disabled={busy || item.size > 100 * 1048576} onClick={() => void save(item)}>
                  {onCreated ? "Add to timeline" : "Save and add to project"}
                </button>
                <button className={button} disabled={busy || item.size > 100 * 1048576} onClick={() => void save(item, true)}>
                  Download
                </button>
              </div>
              {item.size > 100 * 1048576 && <p className="text-xs text-rose-600">This clip exceeds the 100 MB import limit.</p>}
            </article>
          ))}
        </div>

        {selected && (
          <AddToProjectModal
            isOpen
            onClose={() => setSelected(undefined)}
            assetType="broll_assets"
            assetItem={projectAssetItem(selected)}
            assetLabel={selected.name}
          />
        )}
      </section>

      {/* Interactive Inspector Modal */}
      {inspectTemplate && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Inspect ${inspectTemplate.name}`}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 backdrop-blur-sm p-4"
          onClick={() => setInspectTemplate(null)}
        >
          <div
            className="vx-frosted-surface w-full max-w-2xl rounded-3xl p-5 sm:p-6 space-y-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-mono font-semibold uppercase tracking-wider text-[#1D4FB1]">
                  {inspectTemplate.category} · {inspectTemplate.kind}
                </p>
                <h3 className="text-xl font-bold text-[#142440] mt-0.5">{inspectTemplate.name}</h3>
                <p className="text-xs text-[#52647e] mt-1">{inspectTemplate.description}</p>
              </div>
              <button
                type="button"
                aria-label="Close preview"
                onClick={() => setInspectTemplate(null)}
                className="rounded-xl border border-slate-200 bg-white p-2 text-slate-600 hover:text-slate-900 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <MotionGraphicCanvasPreview template={inspectTemplate} interactive showControls />

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <p className="text-xs text-[#52647e]">
                Rendered live with Kreovar&apos;s compositor engine. Open the Video Editor to customize values, timing, and accent color.
              </p>
              <Link
                href="/editor"
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#13223E] hover:bg-[#1D4FB1] px-4 py-2.5 text-xs font-semibold text-white transition-colors"
              >
                <span>Open in Editor</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
