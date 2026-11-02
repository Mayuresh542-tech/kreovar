"use client";

import React from "react";
import NormalizedEditorComposition from "./NormalizedEditorComposition";
import type {EditorProject} from "../lib/editor/model";
import {
  AbsoluteFill,
  Sequence,
  Audio,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
} from "remotion";
import { VeeloxScene, VeeloxTimeline, VeeloxCaption } from "../lib/services/types";
import {
  CaptionStyleConfig,
  getTemplateById,
  isViralKeyword,
} from "../lib/captions/templates";

export interface VeeloxCompositionProps {
  timeline: VeeloxTimeline & {
    editorModel?:EditorProject;
    settings?: {
      captionPreset?: string;
      captionStyle?: CaptionStyleConfig;
      captionPosition?: string;
    };
  };
  scenes: VeeloxScene[];
}

export const VeeloxVideoComposition: React.FC<VeeloxCompositionProps> = ({
  timeline,
  scenes,
}) => {
  const { fps } = useVideoConfig();
  if(timeline.editorModel)return <NormalizedEditorComposition project={timeline.editorModel}/>;

  let currentFrameOffset = 0;

  return (
    <AbsoluteFill style={{ backgroundColor: "#08090C" }}>
      {/* 1. Visual Scenes Layer */}
      {scenes.map((scene, index) => {
        const sceneFrames = Math.max(1, Math.round((scene.duration || 5) * fps));
        const fromFrame = currentFrameOffset;
        currentFrameOffset += sceneFrames;

        return (
          <Sequence
            key={`scene_${scene.id}_${index}`}
            from={fromFrame}
            durationInFrames={sceneFrames}
          >
            <SceneRenderer scene={scene} durationInFrames={sceneFrames} />
          </Sequence>
        );
      })}

      {/* 2. Captions Layer */}
      {timeline.captionTrack && timeline.captionTrack.length > 0 && (
        <CaptionsLayer
          captions={timeline.captionTrack}
          fps={fps}
          styleConfig={
            timeline.settings?.captionStyle ||
            getTemplateById(timeline.settings?.captionPreset || "clean").style
          }
        />
      )}

      {/* 3. Audio Layer (Voiceover & Background Music) */}
      {scenes.map((scene, index) => {
        if (!scene.voiceAudioUrl) return null;
        let startFrame = 0;
        for (let i = 0; i < index; i++) {
          startFrame += Math.round((scenes[i].duration || 5) * fps);
        }
        const voiceFrames = Math.round((scene.voiceDuration || scene.duration || 5) * fps);

        return (
          <Sequence
            key={`voice_${scene.id}_${index}`}
            from={startFrame}
            durationInFrames={voiceFrames}
          >
            <Audio src={scene.voiceAudioUrl} volume={1.0} />
          </Sequence>
        );
      })}

      {/* Background Music if present */}
      {timeline.backgroundMusicUrl && (
        <Audio
          src={timeline.backgroundMusicUrl}
          volume={timeline.musicVolume ?? 0.15}
          loop
        />
      )}
    </AbsoluteFill>
  );
};

interface SceneRendererProps {
  scene: VeeloxScene;
  durationInFrames: number;
}

const SceneRenderer: React.FC<SceneRendererProps> = ({ scene, durationInFrames }) => {
  const frame = useCurrentFrame();

  // Ken Burns subtle cinematic zoom & pan
  const scale = interpolate(frame, [0, durationInFrames], [1.0, 1.12], {
    extrapolateRight: "clamp",
  });
  const translateY = interpolate(frame, [0, durationInFrames], [0, -15], {
    extrapolateRight: "clamp",
  });

  // Fade-in transition
  const opacity = interpolate(frame, [0, 10], [0.3, 1], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      {/* Background Image / Asset */}
      {scene.assetUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={scene.assetUrl}
          alt={scene.visualPrompt || "Scene visual"}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            transform: `scale(${scale}) translateY(${translateY}px)`,
            opacity,
          }}
        />
      ) : (
        <div
          style={{
            width: "100%",
            height: "100%",
            background: "linear-gradient(135deg, #090D12 0%, #16202B 50%, #070B0E 100%)",
          }}
        />
      )}

      {/* Dark Vignette Overlay for High Contrast */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(circle at center, rgba(6, 15, 22, 0.2) 0%, rgba(6, 15, 22, 0.85) 100%)",
        }}
      />

      {/* On-Screen Text Overlay */}
      {scene.onScreenText && (
        <div
          style={{
            position: "absolute",
            top: "16%",
            left: "8%",
            right: "8%",
            display: "flex",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              padding: "16px 28px",
              backgroundColor: "rgba(13, 19, 26, 0.88)",
              backdropFilter: "blur(12px)",
              border: "1px solid rgba(0, 242, 152, 0.35)",
              borderRadius: "16px",
              boxShadow: "0 20px 40px rgba(0, 0, 0, 0.6)",
              textAlign: "center",
            }}
          >
            <span
              style={{
                fontFamily: "monospace",
                fontWeight: 900,
                fontSize: "26px",
                letterSpacing: "0.08em",
                color: "#FFFFFF",
                textTransform: "uppercase",
                textShadow: "0 2px 10px rgba(0,0,0,0.8)",
              }}
            >
              {scene.onScreenText}
            </span>
          </div>
        </div>
      )}
    </AbsoluteFill>
  );
};

interface CaptionsLayerProps {
  captions: VeeloxCaption[];
  fps: number;
  styleConfig?: CaptionStyleConfig;
}

const CaptionsLayer: React.FC<CaptionsLayerProps> = ({ captions, fps, styleConfig }) => {
  const frame = useCurrentFrame();
  const currentTime = frame / fps;

  const style = styleConfig || getTemplateById("clean").style;

  // Find active caption
  const activeCaption = captions.find(
    (c) => currentTime >= c.startTime && currentTime <= c.endTime
  );

  if (!activeCaption) return null;

  // Vertical placement
  let topPlacement: string | undefined = undefined;
  let bottomPlacement: string | undefined = undefined;
  let transformPlacement: string | undefined = undefined;

  if (style.position === "top") {
    topPlacement = "12%";
  } else if (style.position === "bottom") {
    bottomPlacement = "14%";
  } else if (style.position === "custom" && style.positionYPercent !== undefined) {
    topPlacement = `${style.positionYPercent}%`;
    transformPlacement = "translateY(-50%)";
  } else {
    topPlacement = "50%";
    transformPlacement = "translateY(-50%)";
  }

  // Stroke and Shadow
  const strokeStyle: React.CSSProperties =
    style.strokeWidth && style.strokeWidth > 0 && style.strokeColor
      ? {
          WebkitTextStroke: `${style.strokeWidth}px ${style.strokeColor}`,
          paintOrder: "stroke fill",
        }
      : {};

  const shadowStyle: React.CSSProperties = style.shadowColor
    ? {
        textShadow: `${style.shadowOffsetX ?? 0}px ${style.shadowOffsetY ?? 0}px ${
          style.shadowBlur ?? 0
        }px ${style.shadowColor}`,
      }
    : {};

  return (
    <div
      style={{
        position: "absolute",
        top: topPlacement,
        bottom: bottomPlacement,
        transform: transformPlacement,
        left: "6%",
        right: "6%",
        display: "flex",
        justifyContent: "center",
        pointerEvents: "none",
        zIndex: 25,
      }}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: style.alignment || "center",
          gap: "6px 10px",
          padding: style.containerPadding || (style.containerBg !== "transparent" ? "10px 22px" : "4px 8px"),
          backgroundColor: style.containerBg || "transparent",
          borderRadius: style.containerBorderRadius ? `${style.containerBorderRadius}px` : undefined,
          border: style.containerBorder || "none",
          backdropFilter: style.backdropBlur ? `blur(${style.backdropBlur}px)` : undefined,
          WebkitBackdropFilter: style.backdropBlur ? `blur(${style.backdropBlur}px)` : undefined,
          maxWidth: "92%",
          textAlign: style.alignment || "center",
        }}
      >
        {activeCaption.words && activeCaption.words.length > 0 ? (
          activeCaption.words.map((w, idx) => {
            const isWordActive = currentTime >= w.start && currentTime <= w.end;
            const isImpact = isViralKeyword(w.word);

            let isHighlighted = false;
            let color = style.textColor;
            let bg: string | undefined = undefined;

            switch (style.highlightingMode) {
              case "keyword":
                isHighlighted = isImpact || isWordActive;
                color = isHighlighted ? style.highlightColor : style.textColor;
                if (isWordActive && style.highlightBg) bg = style.highlightBg;
                break;
              case "alternating":
                isHighlighted = idx % 2 === 1 || isWordActive;
                color = isHighlighted ? style.highlightColor : style.textColor;
                if (isWordActive && style.highlightBg) bg = style.highlightBg;
                break;
              case "full-line":
                isHighlighted = true;
                color = style.highlightColor;
                break;
              case "current-word":
              default:
                isHighlighted = isWordActive;
                color = isWordActive ? style.highlightColor : style.textColor;
                if (isWordActive && style.highlightBg) bg = style.highlightBg;
                break;
            }

            return (
              <span
                key={idx}
                style={{
                  fontFamily: style.fontFamily,
                  fontWeight: style.fontWeight,
                  fontSize: `${style.fontSize}px`,
                  textTransform: style.textTransform,
                  letterSpacing: style.letterSpacing,
                  lineHeight: style.lineSpacing,
                  color,
                  backgroundColor: bg || "transparent",
                  padding: bg ? "0 4px" : undefined,
                  borderRadius: bg ? "4px" : undefined,
                  transform: isWordActive ? "scale(1.12)" : "scale(1)",
                  transition: `all ${style.animationSpeed || 0.18}s ease`,
                  display: "inline-block",
                  ...strokeStyle,
                  ...shadowStyle,
                }}
              >
                {w.word}
              </span>
            );
          })
        ) : (
          <span
            style={{
              fontFamily: style.fontFamily,
              fontWeight: style.fontWeight,
              fontSize: `${style.fontSize}px`,
              textTransform: style.textTransform,
              letterSpacing: style.letterSpacing,
              lineHeight: style.lineSpacing,
              color: style.textColor,
              ...strokeStyle,
              ...shadowStyle,
            }}
          >
            {activeCaption.text}
          </span>
        )}
      </div>
    </div>
  );
};
