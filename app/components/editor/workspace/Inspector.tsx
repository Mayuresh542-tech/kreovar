"use client";
import React, { useState } from "react";
import MediaAnimationControls from "./MediaAnimationControls";
import ShapeControls from "./ShapeControls";
import { STYLE_SURFACES, type StyleSurface } from "@/app/lib/editor/styleSurface";
import KeyframeControls from "./KeyframeControls";
import TextFillControls from "./TextFillControls";
import { audioRole } from "@/app/lib/editor/audioMix";
import { visualDimensions } from "@/app/lib/editor/media";
import {
  SlidersHorizontal,
  Layers,
  Trash2,
  Split,
  Copy,
  RotateCcw,
  Volume2,
  VolumeX,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Gauge,
  Music,
  Type,
  Sparkles,
} from "lucide-react";
import { TextStyle, textForClip, canPlace, Caption } from "@/app/lib/editor/model";
import { Edit, useProject } from "@/app/lib/editor/store";
import {
  changeClipProperty,
  changeText,
  moveClip,
  trimClip,
  splitClip,
  duplicateClip,
  removeClip,
  frameClip,
  addAsset,
  replaceClipAsset,
  resetClipTransform,
  changeCaptionProperty,
} from "@/app/lib/editor/operations";
import { useEditor } from "./EditorContext";

const SPEED_PRESETS = [0.5, 1, 1.5, 2] as const;
const CAPTION_HIGHLIGHT_SWATCHES = [
  "#FAFF00", // Electric Yellow
  "#00F0FF", // Neon Cyan
  "#00F298", // Bright Green
  "#FF6B00", // Neon Orange
  "#FF2A85", // Hot Pink
  "#FFFFFF", // Pure White
];
const FONT_FAMILIES = [
  "Inter",
  "Montserrat",
  "Outfit",
  "Oswald",
  "Poppins",
  "JetBrains Mono",
  "Impact",
  "Playfair Display",
  "Caveat",
];

function NumberField({
  label,
  value,
  min,
  max,
  step = 0.01,
  edit,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  edit: (value: number) => Edit;
}) {
  const { store, run } = useEditor();
  return (
    <label className="vx-field">
      <span>{label}</span>
      <input
        type="number"
        aria-label={label}
        value={Number.isFinite(value) ? Number(value.toFixed(3)) : 0}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          if (e.target.value !== "" && Number.isFinite(e.target.valueAsNumber)) {
            run(edit(e.target.valueAsNumber));
          }
        }}
        onFocus={() => {
          if (store.interacting) store.commit();
        }}
      />
    </label>
  );
}

function Slider({
  label,
  value,
  min = 0,
  max = 100,
  step = 1,
  unit = "",
  displayValue,
  edit,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  displayValue?: string;
  edit: (value: number) => Edit;
}) {
  const { store, run, notify } = useEditor();
  function change(val: number) {
    try {
      if (store.interacting) store.preview(edit(val));
      else run(edit(val));
    } catch (e) {
      store.cancel();
      notify(e instanceof Error ? e.message : "Adjustment failed.");
    }
  }
  const formatted =
    displayValue !== undefined
      ? displayValue
      : `${value.toFixed(step < 1 ? 2 : 0)}${unit}`;

  return (
    <label className="vx-slider-field">
      <span>
        {label}
        <output>{formatted}</output>
      </span>
      <input
        aria-label={label}
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onPointerDown={() => store.begin()}
        onChange={(e) => change(Number(e.target.value))}
        onPointerUp={() => store.commit()}
        onPointerCancel={() => store.cancel()}
        onBlur={() => store.commit()}
      />
    </label>
  );
}

export default function Inspector() {
  const { store, playback, repository, selection, select, run, notify } = useEditor();
  const p = useProject(store);
  const c = p.clips[selection[0]];
  const layer = c ? textForClip(p, c) : undefined;
  const caption = c?.contentId ? p.captions[c.contentId] : undefined;
  const track = c ? p.tracks[c.trackId] : undefined;
  const asset = c?.assetId ? p.assets[c.assetId] : undefined;
  const visual = track?.kind !== "audio";
  const isCaption = track?.kind === "caption" || Boolean(caption);
  const hasAudio = asset ? asset.kind !== "image" : track?.kind === "audio";
  const transition = c
    ? Object.values(p.transitions).find((t) => t.toClipId === c.id)
    : undefined;
  const [framing, setFraming] = useState(false);

  async function frame(mode: "fit" | "fill") {
    if (!c || !asset || framing) return;
    setFraming(true);
    try {
      const size = await visualDimensions(asset, repository);
      run((project) => {
        if (project.assets[asset.id] !== asset)
          throw new Error("The original changed. Please try again.");
        return frameClip(addAsset(project, { ...asset, ...size }), c.id, mode);
      });
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not frame this clip.");
    } finally {
      setFraming(false);
    }
  }

  const textStyle = (changes: Partial<TextStyle>) => (project: typeof p) =>
    changeText(project, c.id, layer!.text, changes);

  // Compute decibel readout for audio volume
  const dbValue =
    c && c.volume > 0 ? (20 * Math.log10(c.volume)).toFixed(1) : "-∞";
  const dbLabel =
    c && c.volume > 0
      ? Number(dbValue) >= 0
        ? `+${dbValue} dB`
        : `${dbValue} dB`
      : "-∞ dB (Muted)";

  return (
    <aside
      data-vx-motion="right"
      className="vx-inspector vx-panel"
      aria-label="Properties inspector"
    >
      <header className="vx-panel-heading">
        <span>Clip controls</span>
        <SlidersHorizontal size={14} />
      </header>

      {!c ? (
        <div className="vx-empty">
          <Layers size={28} />
          <strong>Make it yours</strong>
          <p>Select a clip in the timeline or a layer in the preview to edit its properties.</p>
          <div className="vx-project-info">
            <span>
              Project format <b>{p.settings.aspectRatio}</b>
            </span>
            <span>
              Frame rate <b>{p.settings.fps} fps</b>
            </span>
            <span>
              Editing <b>Non-destructive</b>
            </span>
          </div>
        </div>
      ) : (
        <div className="vx-inspector-content">
          <div className="vx-inspector-title">
            <strong>{c.name}</strong>
            <span className="vx-badge">
              {selection.length > 1 ? `${selection.length} selected` : track?.kind}
            </span>
          </div>

          {selection.length > 1 && (
            <p className="vx-hint">
              Showing the first selected clip. Timeline actions apply to the selection.
            </p>
          )}
          {track?.locked && (
            <p className="vx-hint">This track is locked. Unlock it in the timeline to edit.</p>
          )}

          <fieldset disabled={track?.locked}>
            {/* Quick Actions */}
            <section className="vx-property-section">
              <h3>Quick actions</h3>
              <div className="vx-quick-actions">
                <button
                  type="button"
                  onClick={() =>
                    run((project) =>
                      splitClip(project, c.id, playback.getSnapshot().time)
                    )
                  }
                >
                  <Split size={12} /> Split here
                </button>
                <button
                  type="button"
                  onClick={() => run((project) => duplicateClip(project, c.id))}
                >
                  <Copy size={12} /> Duplicate
                </button>
                <button
                  type="button"
                  onClick={() => {
                    run((project) => removeClip(project, c.id));
                    select([]);
                  }}
                >
                  <Trash2 size={12} /> Delete
                </button>
                {hasAudio && (
                  <button
                    type="button"
                    onClick={() =>
                      run((project) =>
                        changeClipProperty(project, c.id, {
                          volume: c.volume > 0 ? 0 : 1,
                        })
                      )
                    }
                  >
                    {c.volume > 0 ? <Volume2 size={12} /> : <VolumeX size={12} />}{" "}
                    {c.volume > 0 ? "Mute" : "Unmute"}
                  </button>
                )}
              </div>
            </section>

            {/* Timing */}
            <section className="vx-property-section">
              <h3>Timing</h3>
              <div className="vx-field-grid">
                <NumberField
                  label="Start (s)"
                  value={c.startTime}
                  min={0}
                  step={0.05}
                  edit={(value) => (project) => moveClip(project, c.id, value)}
                />
                <NumberField
                  label="Duration (s)"
                  value={c.duration}
                  min={1 / p.settings.fps}
                  step={0.05}
                  edit={(value) => (project) =>
                    trimClip(project, c.id, "right", c.startTime + value)
                  }
                />
              </div>

              {asset && (
                <label className="vx-field">
                  <span>Replace clip media</span>
                  <select
                    aria-label="Replace clip media"
                    value={asset.id}
                    onChange={(e) =>
                      run((project) =>
                        replaceClipAsset(project, c.id, e.target.value)
                      )
                    }
                  >
                    {Object.values(p.assets)
                      .filter((a) => canPlace(track!.kind, a.kind))
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                  </select>
                  <small>
                    Uses project media; preserves timing, framing and audio settings.
                  </small>
                </label>
              )}

              {asset && asset.kind !== "image" && (
                <NumberField
                  label="Source in (s)"
                  value={c.sourceStart}
                  min={0}
                  max={Math.max(0, asset.duration - c.duration * c.speed)}
                  step={0.05}
                  edit={(value) => (project) =>
                    replaceClipAsset(project, c.id, asset.id, value)
                  }
                />
              )}
              {asset && (
                <p className="vx-hint">
                  Source {c.sourceStart.toFixed(2)}s → {c.sourceEnd.toFixed(2)}s
                </p>
              )}
            </section>

            {/* SPEED PANEL: 0.1x to 10x slider, preset chips, pitch preservation toggle */}
            <section className="vx-property-section">
              <h3>
                <Gauge size={13} style={{ display: "inline", verticalAlign: "middle", marginRight: 4 }} />
                Speed
              </h3>

              {/* Preset Chips */}
              <div className="vx-chip-group" role="group" aria-label="Speed presets">
                {SPEED_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    className={`vx-chip ${
                      Math.abs(c.speed - preset) < 0.01 ? "vx-active" : ""
                    }`}
                    onClick={() =>
                      run((project) =>
                        changeClipProperty(project, c.id, { speed: preset })
                      )
                    }
                  >
                    {preset}×
                  </button>
                ))}
              </div>

              {/* Speed Slider (0.1x to 10x) */}
              <Slider
                label="Playback speed"
                value={c.speed}
                min={0.1}
                max={10}
                step={0.05}
                displayValue={`${c.speed.toFixed(2)}×`}
                edit={(v) => (project) =>
                  changeClipProperty(project, c.id, {
                    speed: Math.max(0.1, Math.min(10, v)),
                  })
                }
              />

              <div className="vx-field-grid">
                <NumberField
                  label="Fine tune (×)"
                  value={c.speed}
                  min={0.1}
                  max={10}
                  step={0.05}
                  edit={(v) => (project) =>
                    changeClipProperty(project, c.id, {
                      speed: Math.max(0.1, Math.min(10, v)),
                    })
                  }
                />
              </div>

              {/* Pitch Preservation Toggle */}
              {hasAudio && (
                <label className="vx-check" style={{ marginTop: 6 }}>
                  <input
                    aria-label="Preserve audio pitch"
                    type="checkbox"
                    checked={c.preservePitch !== false}
                    onChange={(e) =>
                      run((project) =>
                        changeClipProperty(project, c.id, {
                          preservePitch: e.target.checked,
                        })
                      )
                    }
                  />
                  <span>Preserve pitch (voice tone)</span>
                </label>
              )}
            </section>

            {/* AUDIO PANEL: Volume slider (0% to 200%), dB readout, Fade-in/Fade-out sliders, Mute button */}
            {hasAudio && (
              <section className="vx-property-section">
                <h3>
                  <Music size={13} style={{ display: "inline", verticalAlign: "middle", marginRight: 4 }} />
                  Audio &amp; Volume
                </h3>

                {/* Volume Slider & dB readout */}
                <Slider
                  label="Volume"
                  value={c.volume * 100}
                  min={0}
                  max={200}
                  step={1}
                  displayValue={`${(c.volume * 100).toFixed(0)}% (${dbLabel})`}
                  edit={(v) => (project) =>
                    changeClipProperty(project, c.id, {
                      volume: Math.max(0, Math.min(2, v / 100)),
                    })
                  }
                />

                {/* Mute Button & Role Controls */}
                <div className="vx-quick-actions" style={{ marginBottom: 10 }}>
                  <button
                    type="button"
                    className={`vx-secondary ${c.volume === 0 ? "vx-active" : ""}`}
                    onClick={() =>
                      run((project) =>
                        changeClipProperty(project, c.id, {
                          volume: c.volume > 0 ? 0 : 1,
                        })
                      )
                    }
                  >
                    {c.volume > 0 ? <Volume2 size={13} /> : <VolumeX size={13} />}{" "}
                    {c.volume > 0 ? "Mute audio" : "Unmute audio"}
                  </button>
                </div>

                {/* Fade In & Fade Out Sliders */}
                <Slider
                  label="Fade in"
                  value={c.fadeIn}
                  min={0}
                  max={Math.min(c.duration, 10)}
                  step={0.05}
                  displayValue={`${c.fadeIn.toFixed(2)}s`}
                  edit={(v) => (project) =>
                    changeClipProperty(project, c.id, {
                      fadeIn: Math.max(0, Math.min(c.duration, v)),
                    })
                  }
                />

                <Slider
                  label="Fade out"
                  value={c.fadeOut}
                  min={0}
                  max={Math.min(c.duration, 10)}
                  step={0.05}
                  displayValue={`${c.fadeOut.toFixed(2)}s`}
                  edit={(v) => (project) =>
                    changeClipProperty(project, c.id, {
                      fadeOut: Math.max(0, Math.min(c.duration, v)),
                    })
                  }
                />

                <div className="vx-field-grid">
                  <NumberField
                    label="Fade in (s)"
                    value={c.fadeIn}
                    min={0}
                    max={c.duration}
                    step={0.05}
                    edit={(v) => (project) =>
                      changeClipProperty(project, c.id, { fadeIn: v })
                    }
                  />
                  <NumberField
                    label="Fade out (s)"
                    value={c.fadeOut}
                    min={0}
                    max={c.duration}
                    step={0.05}
                    edit={(v) => (project) =>
                      changeClipProperty(project, c.id, { fadeOut: v })
                    }
                  />
                </div>

                {/* Audio role & Ducking */}
                <label className="vx-field" style={{ marginTop: 8 }}>
                  <span>Audio role</span>
                  <select
                    aria-label="Audio role"
                    value={audioRole(p, c)}
                    onChange={(e) =>
                      run((project) =>
                        changeClipProperty(project, c.id, {
                          audioRole: e.target.value as "speech" | "background" | "sfx",
                        })
                      )
                    }
                  >
                    <option value="speech">Speech / voiceover</option>
                    <option value="background">Background / music</option>
                    <option value="sfx">Sound effect</option>
                  </select>
                </label>

                {audioRole(p, c) !== "speech" && (
                  <label className="vx-check">
                    <input
                      aria-label="Duck this clip under speech"
                      type="checkbox"
                      checked={c.ducking !== false}
                      onChange={(e) =>
                        run((project) =>
                          changeClipProperty(project, c.id, {
                            ducking: e.target.checked,
                          })
                        )
                      }
                    />
                    <span>Soften under speech (when Audio balance is on)</span>
                  </label>
                )}
              </section>
            )}

            {/* TRANSFORM & POSITIONING PANEL: X/Y inputs, Scale slider (10% to 500%), Rotation (-180° to +180°), Reset Transform */}
            {visual && (
              <section className="vx-property-section">
                <h3>Position &amp; Transform</h3>

                {asset && (
                  <div className="vx-quick-actions">
                    <button
                      type="button"
                      disabled={framing}
                      onClick={() => void frame("fit")}
                    >
                      Fit frame
                    </button>
                    <button
                      type="button"
                      disabled={framing}
                      onClick={() => void frame("fill")}
                    >
                      Fill frame
                    </button>
                  </div>
                )}

                {/* X and Y Position Inputs */}
                <div className="vx-field-grid">
                  <NumberField
                    label="Position X (%)"
                    value={c.transform.x * 100}
                    step={1}
                    edit={(v) => (project) =>
                      changeClipProperty(project, c.id, {
                        transform: { ...c.transform, x: v / 100 },
                      })
                    }
                  />
                  <NumberField
                    label="Position Y (%)"
                    value={c.transform.y * 100}
                    step={1}
                    edit={(v) => (project) =>
                      changeClipProperty(project, c.id, {
                        transform: { ...c.transform, y: v / 100 },
                      })
                    }
                  />
                </div>

                {/* Scale Slider (10% to 500%) */}
                <Slider
                  label="Scale"
                  value={c.transform.scale * 100}
                  min={10}
                  max={500}
                  step={1}
                  unit="%"
                  edit={(v) => (project) =>
                    changeClipProperty(project, c.id, {
                      transform: { ...c.transform, scale: v / 100 },
                    })
                  }
                />

                {/* Rotation Slider (-180° to +180°) */}
                <Slider
                  label="Rotation"
                  value={c.transform.rotation}
                  min={-180}
                  max={180}
                  step={1}
                  unit="°"
                  edit={(v) => (project) =>
                    changeClipProperty(project, c.id, {
                      transform: { ...c.transform, rotation: v },
                    })
                  }
                />

                <div className="vx-field-grid">
                  <NumberField
                    label="Scale (%)"
                    value={c.transform.scale * 100}
                    min={10}
                    max={500}
                    step={1}
                    edit={(v) => (project) =>
                      changeClipProperty(project, c.id, {
                        transform: { ...c.transform, scale: v / 100 },
                      })
                    }
                  />
                  <NumberField
                    label="Rotation (°)"
                    value={c.transform.rotation}
                    min={-180}
                    max={180}
                    step={1}
                    edit={(v) => (project) =>
                      changeClipProperty(project, c.id, {
                        transform: { ...c.transform, rotation: v },
                      })
                    }
                  />
                </div>

                {/* Opacity Slider */}
                <Slider
                  label="Opacity"
                  value={c.transform.opacity * 100}
                  min={0}
                  max={100}
                  step={1}
                  unit="%"
                  edit={(v) => (project) =>
                    changeClipProperty(project, c.id, {
                      transform: { ...c.transform, opacity: v / 100 },
                    })
                  }
                />

                {/* Reset Transform Button */}
                <div style={{ marginTop: 8 }}>
                  <button
                    type="button"
                    className="vx-secondary vx-wide"
                    onClick={() =>
                      run((project) => resetClipTransform(project, c.id))
                    }
                  >
                    <RotateCcw size={13} /> Reset transform
                  </button>
                </div>
              </section>
            )}

            {/* Media Animation Controls */}
            {asset && visual && <MediaAnimationControls key={c.id} clipId={c.id} />}

            {/* Shape Controls */}
            {c.shape && <ShapeControls clipId={c.id} />}

            {/* Surface Treatment */}
            {asset && visual && (
              <section className="vx-property-section">
                <h3>Surface treatment</h3>
                <label className="vx-field">
                  <span>Original procedural texture</span>
                  <select
                    aria-label="Surface treatment"
                    value={c.surface || "none"}
                    onChange={(e) =>
                      run((project) =>
                        changeClipProperty(project, c.id, {
                          surface: e.target.value as StyleSurface,
                        })
                      )
                    }
                  >
                    {STYLE_SURFACES.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                </label>
              </section>
            )}

            {/* Keyframes */}
            {visual && <KeyframeControls clipId={c.id} />}

            {/* Visual Adjustments */}
            {asset && visual && (
              <section className="vx-property-section">
                <h3>Adjustments</h3>
                {(["brightness", "contrast", "saturation"] as const).map((key) => (
                  <Slider
                    key={key}
                    label={key[0].toUpperCase() + key.slice(1)}
                    value={c.effects[key]}
                    min={-100}
                    max={100}
                    edit={(v) => (project) =>
                      changeClipProperty(project, c.id, {
                        effects: { ...c.effects, [key]: v },
                      })
                    }
                  />
                ))}
                <Slider
                  label="Blur"
                  value={c.effects.blur}
                  min={0}
                  max={20}
                  step={0.5}
                  edit={(v) => (project) =>
                    changeClipProperty(project, c.id, {
                      effects: { ...c.effects, blur: v },
                    })
                  }
                />
              </section>
            )}

            {/* TEXT & CAPTION STYLING PANEL: Font picker, size, color, background, alignment, active word highlight color */}
            {layer && (
              <section className="vx-property-section">
                <h3>
                  <Type size={13} style={{ display: "inline", verticalAlign: "middle", marginRight: 4 }} />
                  {isCaption ? "Caption" : "Text"} styling
                </h3>

                {/* Content */}
                <label className="vx-field">
                  <span>Content</span>
                  <textarea
                    aria-label="Text content"
                    value={layer.text}
                    rows={3}
                    onFocus={() => store.begin()}
                    onChange={(e) => {
                      try {
                        store.preview((project) =>
                          changeText(project, c.id, e.target.value)
                        );
                      } catch (error) {
                        notify(
                          error instanceof Error ? error.message : "Text edit failed."
                        );
                      }
                    }}
                    onBlur={() => store.commit()}
                  />
                </label>

                {/* Font Picker */}
                <label className="vx-field">
                  <span>Font</span>
                  <select
                    aria-label="Font"
                    value={layer.style.font}
                    onChange={(e) => run(textStyle({ font: e.target.value }))}
                  >
                    {FONT_FAMILIES.map((font) => (
                      <option key={font} value={font}>
                        {font}
                      </option>
                    ))}
                  </select>
                </label>

                {/* Font Size Slider & Number Field */}
                <Slider
                  label="Font size"
                  value={layer.style.size}
                  min={8}
                  max={400}
                  step={1}
                  edit={(v) => textStyle({ size: Math.max(8, Math.min(400, v)) })}
                />

                <div className="vx-field-grid">
                  <NumberField
                    label="Font size"
                    value={layer.style.size}
                    min={8}
                    max={400}
                    step={1}
                    edit={(v) => textStyle({ size: Math.max(8, Math.min(400, v)) })}
                  />
                  <label className="vx-field">
                    <span>Weight</span>
                    <select
                      aria-label="Font weight"
                      value={layer.style.weight}
                      onChange={(e) =>
                        run(textStyle({ weight: Number(e.target.value) }))
                      }
                    >
                      {[400, 500, 600, 700, 800, 900].map((weight) => (
                        <option key={weight} value={weight}>
                          {weight}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                {/* Alignment */}
                <div className="vx-field">
                  <span>Alignment</span>
                  <div className="vx-btn-group" role="group" aria-label="Text alignment">
                    <button
                      type="button"
                      className={layer.style.align === "left" ? "vx-active" : ""}
                      aria-label="Align left"
                      aria-pressed={layer.style.align === "left"}
                      onClick={() => run(textStyle({ align: "left" }))}
                    >
                      <AlignLeft size={14} />
                    </button>
                    <button
                      type="button"
                      className={layer.style.align === "center" ? "vx-active" : ""}
                      aria-label="Align center"
                      aria-pressed={layer.style.align === "center"}
                      onClick={() => run(textStyle({ align: "center" }))}
                    >
                      <AlignCenter size={14} />
                    </button>
                    <button
                      type="button"
                      className={layer.style.align === "right" ? "vx-active" : ""}
                      aria-label="Align right"
                      aria-pressed={layer.style.align === "right"}
                      onClick={() => run(textStyle({ align: "right" }))}
                    >
                      <AlignRight size={14} />
                    </button>
                  </div>
                </div>

                {/* Text Fill Controls (Solid / Gradient) */}
                <TextFillControls
                  style={layer.style}
                  onChange={(changes) => run(textStyle(changes))}
                />

                {/* Text Color & Stroke Color */}
                <div className="vx-field-grid">
                  <label className="vx-color-field">
                    Text color
                    <input
                      aria-label="Text color"
                      type="color"
                      value={layer.style.color}
                      onChange={(e) =>
                        run(textStyle({ color: e.target.value, gradient: null }))
                      }
                    />
                  </label>
                  <label className="vx-color-field">
                    Stroke color
                    <input
                      aria-label="Stroke color"
                      type="color"
                      value={layer.style.stroke}
                      onChange={(e) => run(textStyle({ stroke: e.target.value }))}
                    />
                  </label>
                </div>

                {/* Background Toggle & Background Color */}
                <label className="vx-check" style={{ marginTop: 6 }}>
                  <input
                    aria-label="Enable text background"
                    type="checkbox"
                    checked={layer.style.background !== "transparent"}
                    onChange={(e) =>
                      run(
                        textStyle({
                          background: e.target.checked ? "#172033" : "transparent",
                        })
                      )
                    }
                  />
                  <span>Text background</span>
                </label>

                {layer.style.background !== "transparent" && (
                  <label className="vx-color-field" style={{ marginTop: 4 }}>
                    Background color
                    <input
                      aria-label="Text background"
                      type="color"
                      value={layer.style.background}
                      onChange={(e) => run(textStyle({ background: e.target.value }))}
                    />
                  </label>
                )}

                {/* ACTIVE WORD HIGHLIGHT COLOR (for Captions) */}
                {isCaption && (
                  <div
                    className="vx-property-section"
                    style={{
                      borderTop: "1px solid #e2e8f0",
                      paddingTop: 10,
                      marginTop: 10,
                    }}
                  >
                    <h4
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: "#334155",
                        marginBottom: 6,
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      <Sparkles size={12} color="#2563eb" /> Active word highlight color
                    </h4>

                    <div className="vx-field-grid">
                      <label className="vx-color-field">
                        Highlight color
                        <input
                          aria-label="Active word highlight color"
                          type="color"
                          value={caption?.highlightColor || "#FAFF00"}
                          onChange={(e) =>
                            run((project) =>
                              changeCaptionProperty(project, c.id, {
                                highlightColor: e.target.value,
                              })
                            )
                          }
                        />
                      </label>
                      <div className="vx-field">
                        <span>Hex</span>
                        <input
                          type="text"
                          aria-label="Highlight color hex"
                          value={caption?.highlightColor || "#FAFF00"}
                          onChange={(e) => {
                            if (/^#[0-9A-Fa-f]{6}$/.test(e.target.value)) {
                              run((project) =>
                                changeCaptionProperty(project, c.id, {
                                  highlightColor: e.target.value,
                                })
                              );
                            }
                          }}
                          style={{
                            fontFamily: "monospace",
                            textTransform: "uppercase",
                          }}
                        />
                      </div>
                    </div>

                    {/* Quick Swatch Palette */}
                    <div
                      className="vx-color-swatches"
                      role="group"
                      aria-label="Highlight color swatches"
                    >
                      {CAPTION_HIGHLIGHT_SWATCHES.map((swatchColor) => (
                        <button
                          key={swatchColor}
                          type="button"
                          className={`vx-color-swatch ${
                            (caption?.highlightColor || "#FAFF00").toLowerCase() ===
                            swatchColor.toLowerCase()
                              ? "vx-active"
                              : ""
                          }`}
                          style={{ backgroundColor: swatchColor }}
                          title={`Set highlight color to ${swatchColor}`}
                          aria-label={`Highlight color ${swatchColor}`}
                          onClick={() =>
                            run((project) =>
                              changeCaptionProperty(project, c.id, {
                                highlightColor: swatchColor,
                              })
                            )
                          }
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Additional typography metrics */}
                <div className="vx-field-grid" style={{ marginTop: 10 }}>
                  <NumberField
                    label="Stroke width"
                    value={layer.style.strokeWidth}
                    min={0}
                    max={20}
                    step={1}
                    edit={(v) => textStyle({ strokeWidth: Math.max(0, v) })}
                  />
                  <NumberField
                    label="Shadow"
                    value={layer.style.shadow}
                    min={0}
                    max={50}
                    step={1}
                    edit={(v) => textStyle({ shadow: Math.max(0, v) })}
                  />
                  <NumberField
                    label="Letter spacing"
                    value={layer.style.letterSpacing}
                    min={-5}
                    max={30}
                    step={0.5}
                    edit={(v) => textStyle({ letterSpacing: v })}
                  />
                  <NumberField
                    label="Line spacing"
                    value={layer.style.lineHeight}
                    min={0.5}
                    max={3}
                    step={0.1}
                    edit={(v) => textStyle({ lineHeight: Math.max(0.5, v) })}
                  />
                </div>

                <NumberField
                  label="Text width (%)"
                  value={(layer.style.maxWidth ?? 0.86) * 100}
                  min={10}
                  max={86}
                  step={1}
                  edit={(v) =>
                    textStyle({
                      maxWidth: Math.max(0.1, Math.min(0.86, v / 100)),
                    })
                  }
                />
              </section>
            )}

            {/* Transitions */}
            {transition && (
              <section className="vx-property-section">
                <h3>Transition · {transition.kind}</h3>
                <NumberField
                  label="Transition duration (s)"
                  value={transition.duration}
                  min={1 / p.settings.fps}
                  max={Math.min(
                    c.duration,
                    p.clips[transition.fromClipId].duration
                  )}
                  edit={(v) => (project) => ({
                    ...project,
                    transitions: {
                      ...project.transitions,
                      [transition.id]: {
                        ...transition,
                        duration: Math.max(
                          1 / p.settings.fps,
                          Math.min(
                            v,
                            c.duration,
                            p.clips[transition.fromClipId].duration
                          )
                        ),
                      },
                    },
                  })}
                />
                <button
                  type="button"
                  className="vx-secondary vx-wide"
                  onClick={() =>
                    run((project) => {
                      const transitions = { ...project.transitions };
                      delete transitions[transition.id];
                      return { ...project, transitions };
                    })
                  }
                >
                  <Trash2 size={13} /> Remove transition
                </button>
              </section>
            )}
          </fieldset>
        </div>
      )}
    </aside>
  );
}
