"use client";

import React, { useMemo } from "react";
import { motion } from "framer-motion";
import { wordHighlight, distinctHighlight } from "@/app/lib/captions/highlighting";
import { captionFontFamily, textDirection } from "@/app/lib/captions/languages";
import { wordTypography } from "@/app/lib/captions/typography";
import type { CaptionStyleConfig } from "@/app/lib/captions/templates";
import type { TTSWordTimestamp, CaptionSegment } from "@/app/lib/captions/presets";
import type { CaptionStudioDesign } from "@/app/lib/captions/studioDesign";

export interface CaptionRendererProps {
  text: string;
  words?: TTSWordTimestamp[];
  currentTime: number;
  style: CaptionStyleConfig;
  className?: string;
  scaleMultiplier?: number; // for scaling down in thumbnail cards
  segment?: Partial<CaptionSegment>;
}

interface WordWithLayout {
  word: string;
  start: number;
  end: number;
  index: number;
  isEmp: boolean;
  isEdge: boolean;
  resolvedFont: string;
  weight: number;
  wordFontSize: number;
  isItalic: boolean;
  displayText: string;
  wordSpacing: string | undefined;
  isCurrent: boolean;
  isPast: boolean;
  isFuture: boolean;
  isHighlighted: boolean;
  wordColor: string;
  isGradient: boolean;
  gradientCss: string;
  textShadow: string | undefined;
  strokeStyle: React.CSSProperties;
  hasUnderline: boolean;
  underlineColor: string;
  spotlightAlpha: number;
  bg?: string;
}

function checkIsEmphasis(
  d: CaptionStudioDesign,
  index: number,
  count: number,
  wordText: string,
  highlightWordsStr?: string,
  emphasizedWords?: number[]
): boolean {
  if (emphasizedWords && emphasizedWords.length > 0) {
    return emphasizedWords.includes(index);
  }
  const selection = d.emphasisSelection || (d.layout === "hero" ? "middle" : undefined);
  if (selection === "first") return index === 0;
  if (selection === "second-row") return index >= Math.max(1, Math.round(count * (d.rowSplit ?? 0.4)));
  if (selection === "middle-pair") return index === Math.floor(count / 2) || index === Math.max(0, Math.floor(count / 2) - 1);
  if (selection === "last") return index === count - 1;
  if (selection === "middle") return index === Math.floor(count / 2);
  if (selection === "alternating") return index % 2 === 0;
  if (highlightWordsStr) {
    const list = highlightWordsStr.split(",").map((w) => w.trim().toLocaleLowerCase()).filter(Boolean);
    const clean = wordText.toLocaleLowerCase().replace(/[\p{P}]/gu, "");
    if (list.includes(clean)) return true;
  }
  return false;
}

export default function CaptionRenderer({
  text,
  words = [],
  currentTime,
  style,
  className = "",
  scaleMultiplier = 1,
  segment,
}: CaptionRendererProps) {
  const d: CaptionStudioDesign = style.studio || {};

  // Extract raw words, synthesizing timed items if words array is empty
  const rawWords = useMemo<TTSWordTimestamp[]>(() => {
    if (words && words.length > 0) {
      return words;
    }
    const tokens = (text || "").split(/\s+/).filter(Boolean);
    if (!tokens.length) return [];
    const duration = Math.max(2.4, tokens.length * 0.45);
    return tokens.map((word, i, all) => ({
      word,
      start: Number(((i / all.length) * duration).toFixed(2)),
      end: Number((((i + 1) / all.length) * duration).toFixed(2)),
    }));
  }, [words, text]);

  const count = rawWords.length;
  const computedFontSize = Math.max(10, Math.round(style.fontSize * scaleMultiplier));
  const baseGap = Math.max(3, Math.round(computedFontSize * 0.22));
  const gapY = Math.max(2, Math.round(computedFontSize * 0.14));

  // Compute word appearance and typography
  const wordsWithLayout = useMemo<WordWithLayout[]>(() => {
    return rawWords.map((w, index) => {
      const isEmp = checkIsEmphasis(d, index, count, w.word, style.highlightWords, segment?.emphasizedWords);
      const isEdge = !!d.edgeFont && (index === 0 || index === count - 1);

      // Typography selection
      const rawFontFamily = isEmp
        ? (d.emphasisFont || style.fontAccent?.font || style.fontFamily)
        : isEdge
        ? d.edgeFont!
        : (style.fontAccent && index === count - 1 ? style.fontAccent.font : style.fontFamily);

      const resolvedFont = captionFontFamily(rawFontFamily, w.word);

      const weight = isEmp
        ? (d.emphasisWeight || style.fontAccent?.weight || style.fontWeight)
        : (style.fontAccent && index === count - 1 ? style.fontAccent.weight : style.fontWeight);

      const scale = isEmp ? (d.emphasisScale || 1) : isEdge ? (d.edgeScale || 1) : 1;
      const wordFontSize = Math.max(9, Math.round(computedFontSize * scale));

      const isItalic = isEmp
        ? (d.emphasisItalic ?? d.italic ?? false)
        : isEdge
        ? (d.edgeItalic ?? false)
        : (d.italic ?? false);

      // Casing
      const casing = isEmp && d.emphasisCase
        ? d.emphasisCase
        : d.lowercase
        ? "lowercase"
        : style.textTransform;

      const displayText = casing === "uppercase"
        ? w.word.toLocaleUpperCase()
        : casing === "lowercase"
        ? w.word.toLocaleLowerCase()
        : casing === "capitalize"
        ? w.word.charAt(0).toUpperCase() + w.word.slice(1)
        : w.word;

      // Spacing
      const wordSpacing = isEmp && d.emphasisLetterSpacing !== undefined
        ? `${d.emphasisLetterSpacing * scaleMultiplier}em`
        : style.letterSpacing;

      // Active timing states
      const isCurrent = currentTime >= w.start && currentTime <= w.end;
      const isPast = currentTime > w.end;
      const isFuture = currentTime < w.start;

      // Highlighting & Color
      const isHighlighted = isEmp || wordHighlight(style.highlightingMode, w.word, index, isCurrent, style.highlightWords, !isFuture);

      const wordColor = isHighlighted
        ? (style.highlightingMode === "full-line" ? style.highlightColor : distinctHighlight(style.textColor, style.highlightColor))
        : style.textColor;

      // Gradient
      const grad = isEmp ? (d.emphasisGradient || d.gradient) : d.gradient;
      let isGradient = false;
      let gradientCss = "";
      if (grad) {
        isGradient = true;
        const cssAngle = ((grad.angle ?? 90) + 90) % 360;
        const stops = grad.stops && grad.stops.length > 0
          ? grad.stops.map((s) => `${s.color} ${(s.offset * 100).toFixed(1)}%`).join(", ")
          : `${grad.from} 0%, ${grad.to} 100%`;
        gradientCss = `linear-gradient(${cssAngle}deg, ${stops})`;
      }

      // 3D Depth
      const depthShadows: string[] = [];
      if (d.depth && d.depth > 0 && (d.depthTarget !== "emphasis" || isEmp)) {
        const steps = Math.min(16, Math.max(1, Math.ceil(d.depth)));
        const angleRad = ((d.depthAngle ?? 45) * Math.PI) / 180;
        const depthCol = d.depthColor || "#000000";
        for (let j = 1; j <= steps; j++) {
          const dx = Math.round(Math.cos(angleRad) * j * scaleMultiplier * 10) / 10;
          const dy = Math.round(Math.sin(angleRad) * j * scaleMultiplier * 10) / 10;
          depthShadows.push(`${dx}px ${dy}px 0px ${depthCol}`);
        }
      }

      // Glow
      const glowShadows: string[] = [];
      const glowAmount = d.glowTarget === "emphasis" && !isEmp ? 0 : (d.glow || 0);
      if (glowAmount > 0) {
        const glowCol = d.glowColor || (isHighlighted ? style.highlightColor : style.textColor);
        const blur = Math.max(2, Math.round(glowAmount * scaleMultiplier));
        glowShadows.push(`0px 0px ${blur}px ${glowCol}`);
        glowShadows.push(`0px 0px ${Math.round(blur * 1.5)}px ${glowCol}`);
      }

      // Base drop shadows
      const baseShadows: string[] = [];
      if (style.shadowColor && style.shadowColor !== "transparent") {
        const ox = (style.shadowOffsetX ?? 0) * scaleMultiplier;
        const oy = (style.shadowOffsetY ?? 0) * scaleMultiplier;
        const blur = (style.shadowBlur ?? 0) * scaleMultiplier;
        baseShadows.push(`${ox}px ${oy}px ${blur}px ${style.shadowColor}`);
      }

      const allShadows = [...depthShadows, ...glowShadows, ...baseShadows];
      const textShadow = allShadows.length > 0 ? allShadows.join(", ") : undefined;

      // Stroke
      let strokeStyle: React.CSSProperties = {};
      if (style.strokeWidth && style.strokeWidth > 0 && style.strokeColor) {
        const scaledStroke = Math.max(0.5, style.strokeWidth * scaleMultiplier);
        strokeStyle = {
          WebkitTextStroke: `${scaledStroke}px ${style.strokeColor}`,
          paintOrder: "stroke fill",
        };
      }

      // Underlines
      const hasUnderline = !!(d.underline || (isEmp && d.emphasisUnderline));
      const underlineColor = d.underlineColor || (isHighlighted ? style.highlightColor : style.textColor);

      // Spotlight dimming
      const isSpotlight = !!d.spotlight;
      const spotlightAlpha = isSpotlight ? (isCurrent ? 1 : 0.35) : 1;

      // Background highlight pill
      const bg = isCurrent && style.highlightBg ? style.highlightBg : undefined;

      return {
        word: w.word,
        start: w.start,
        end: w.end,
        index,
        isEmp,
        isEdge,
        resolvedFont,
        weight,
        wordFontSize,
        isItalic,
        displayText,
        wordSpacing,
        isCurrent,
        isPast,
        isFuture,
        isHighlighted,
        wordColor,
        isGradient,
        gradientCss,
        textShadow,
        strokeStyle,
        hasUnderline,
        underlineColor,
        spotlightAlpha,
        bg,
      };
    });
  }, [rawWords, d, count, style, computedFontSize, scaleMultiplier, segment?.emphasizedWords, currentTime]);

  // Partition words into layout rows
  const lines = useMemo<WordWithLayout[][]>(() => {
    if (!wordsWithLayout.length) return [];

    if (d.layout === "hero") {
      const ordinary = wordsWithLayout.filter((w) => !w.isEmp);
      const hero = wordsWithLayout.filter((w) => w.isEmp);
      const pivot = hero[0]?.index ?? count;
      const res: WordWithLayout[][] = [];
      if (d.heroPlacement === "banner") {
        if (ordinary.length) res.push(ordinary);
        if (hero.length) res.push(hero);
      } else {
        const before = ordinary.filter((w) => w.index < pivot);
        const after = ordinary.filter((w) => w.index >= pivot);
        if (before.length) res.push(before);
        if (hero.length) res.push(hero);
        if (after.length) res.push(after);
      }
      return res.filter((l) => l.length > 0);
    }

    if (d.layout === "stacked") {
      const split = Math.max(1, Math.round(count * (d.rowSplit ?? 0.6)));
      const res: WordWithLayout[][] = [];
      res.push(wordsWithLayout.slice(0, split));
      if (wordsWithLayout.length > split) {
        res.push(wordsWithLayout.slice(split));
      }
      return res.filter((l) => l.length > 0);
    }

    if (d.layout === "dynamic") {
      const split = Math.max(2, Math.ceil(count / 2));
      const res: WordWithLayout[][] = [];
      res.push(wordsWithLayout.slice(0, 1));
      if (wordsWithLayout.length > 1) res.push(wordsWithLayout.slice(1, split));
      if (wordsWithLayout.length > split) res.push(wordsWithLayout.slice(split));
      return res.filter((l) => l.length > 0);
    }

    if (d.layout === "split") {
      const mid = Math.ceil(count / 2);
      return [
        wordsWithLayout.slice(0, mid),
        wordsWithLayout.slice(mid),
      ].filter((l) => l.length > 0);
    }

    // Default & Inline: wrap by maxWordsPerLine
    const maxWords = Math.max(1, style.maxWordsPerLine || 4);
    const res: WordWithLayout[][] = [];
    for (let i = 0; i < wordsWithLayout.length; i += maxWords) {
      res.push(wordsWithLayout.slice(i, i + maxWords));
    }
    return res.filter((l) => l.length > 0);
  }, [wordsWithLayout, d.layout, d.heroPlacement, d.rowSplit, count, style.maxWordsPerLine]);

  // Motion variants per word
  function getWordAnimationProps(item: WordWithLayout) {
    const entrance = d.entrance || style.animation || "fade";
    const speed = d.transitionDuration || style.animationSpeed || 0.18;
    const { isCurrent, isFuture } = item;

    if (style.animation === "word-by-word" && isFuture) {
      return { animate: { opacity: 0 } };
    }

    switch (entrance) {
      case "pop":
        return {
          animate: isCurrent ? { scale: [1, 1.25, 1.15] } : { scale: 1 },
          transition: { duration: speed, ease: "easeOut" as const },
        };
      case "punch":
        return {
          animate: isCurrent ? { scale: [0.7, 1.28, 1.08] } : { scale: 1 },
          transition: { duration: speed, ease: "easeOut" as const },
        };
      case "bounce":
        return {
          animate: isCurrent
            ? { y: [0, -8 * scaleMultiplier, 0], scale: 1.12 }
            : { y: 0, scale: 1 },
          transition: { duration: speed, ease: "easeInOut" as const },
        };
      case "scale":
      case "zoom":
        return {
          animate: isCurrent ? { scale: 1.18 } : { scale: 1 },
          transition: { duration: speed },
        };
      case "slide-up":
      case "rise-up":
        return {
          initial: { y: 10 * scaleMultiplier, opacity: 0.6 },
          animate: { y: 0, opacity: 1 },
          transition: { duration: speed },
        };
      case "slide-down":
      case "rise-down":
        return {
          initial: { y: -10 * scaleMultiplier, opacity: 0.6 },
          animate: { y: 0, opacity: 1 },
          transition: { duration: speed },
        };
      case "slide-left":
        return {
          initial: { x: 16 * scaleMultiplier, opacity: 0.6 },
          animate: { x: 0, opacity: 1 },
          transition: { duration: speed },
        };
      case "slide-right":
        return {
          initial: { x: -16 * scaleMultiplier, opacity: 0.6 },
          animate: { x: 0, opacity: 1 },
          transition: { duration: speed },
        };
      case "drop":
        return {
          initial: { y: -18 * scaleMultiplier, rotate: 6, opacity: 0.3 },
          animate: { y: 0, rotate: 0, opacity: 1 },
          transition: { duration: speed },
        };
      case "flicker":
        return {
          animate: isCurrent ? { opacity: [0.3, 1, 0.4, 1] } : { opacity: 1 },
          transition: { duration: speed },
        };
      case "fade":
      default:
        return {
          animate: {
            opacity: isCurrent ? 1 : 0.85,
            scale: isCurrent ? 1.05 : 1,
          },
          transition: { duration: speed },
        };
    }
  }

  // Row styling: offsets, margins, split alignment
  function getRowStyle(lineIndex: number): React.CSSProperties {
    const rowStyle: React.CSSProperties = {};

    // Row margins
    if (d.rowMargins && d.rowMargins[lineIndex] !== undefined) {
      rowStyle.marginTop = `${Math.round(d.rowMargins[lineIndex] * computedFontSize)}px`;
    }

    // Dynamic layout edge offsets & rotation
    if (d.layout === "dynamic") {
      const isFirst = lineIndex === 0;
      const isLast = lineIndex === lines.length - 1;
      if (isFirst || isLast) {
        const offsetPx = (isFirst ? -1 : 1) * (d.rowOffset || 0) * computedFontSize * 0.45;
        const rotDeg = isFirst ? (d.rowRotation || 0) : 0;
        rowStyle.transform = `translateX(${offsetPx}px) rotate(${rotDeg}deg)`;
      }
    }

    // Split layout left/right alternating
    if (d.layout === "split") {
      rowStyle.justifyContent = lineIndex % 2 === 0 ? "flex-start" : "flex-end";
      rowStyle.width = "100%";
    }

    return rowStyle;
  }

  if (!rawWords.length) {
    return null;
  }

  return (
    <div
      dir={textDirection(text)}
      className={`inline-block select-none text-center transition-all ${className}`}
      style={{
        backgroundColor: style.containerBg || "transparent",
        border: style.containerBorder || "none",
        borderRadius: (d.backgroundRadius ?? style.containerBorderRadius)
          ? `${(d.backgroundRadius ?? style.containerBorderRadius ?? 8) * scaleMultiplier}px`
          : undefined,
        padding: style.containerPadding
          ? style.containerPadding
              .split(" ")
              .map((p) => {
                const num = parseInt(p, 10);
                return isNaN(num) ? p : `${Math.round(num * scaleMultiplier)}px`;
              })
              .join(" ")
          : undefined,
        backdropFilter: style.backdropBlur
          ? `blur(${style.backdropBlur * scaleMultiplier}px)`
          : undefined,
        WebkitBackdropFilter: style.backdropBlur
          ? `blur(${style.backdropBlur * scaleMultiplier}px)`
          : undefined,
        maxWidth: "96%",
      }}
    >
      <div
        className="flex flex-col items-center justify-center"
        style={{
          fontFamily: style.fontFamily,
          fontSize: `${computedFontSize}px`,
          fontWeight: style.fontWeight,
          textTransform: style.textTransform,
          letterSpacing: style.letterSpacing,
          lineHeight: style.lineSpacing || 1.15,
          textAlign: style.alignment || "center",
          rowGap: `${Math.max(2, Math.round(gapY * (style.lineSpacing || 1)))}px`,
        }}
      >
        {lines.map((row, rowIdx) => {
          const rowStyle = getRowStyle(rowIdx);
          return (
            <div
              key={`row_${rowIdx}`}
              className="flex flex-wrap items-center justify-center"
              style={{
                columnGap: `${baseGap}px`,
                rowGap: `${Math.max(2, Math.round(baseGap * 0.5))}px`,
                ...rowStyle,
              }}
            >
              {row.map((item) => {
                const animProps = getWordAnimationProps(item);
                return (
                  <motion.span
                    key={`${item.index}_${item.word}_${item.start}`}
                    {...animProps}
                    className="relative inline-flex items-center justify-center transition-colors rounded-xs select-none"
                    style={{
                      fontFamily: item.resolvedFont,
                      fontSize: `${item.wordFontSize}px`,
                      fontWeight: item.weight,
                      fontStyle: item.isItalic ? "italic" : "normal",
                      letterSpacing: item.wordSpacing,
                      lineHeight: style.lineSpacing || 1.15,
                      color: item.isGradient ? "transparent" : item.wordColor,
                      backgroundColor: item.bg || (d.letterBoxes ? (d.letterBoxColor || "#00000088") : "transparent"),
                      padding: item.bg ? `0 ${Math.max(2, Math.round(4 * scaleMultiplier))}px` : undefined,
                      borderRadius: item.bg ? `${Math.max(2, Math.round(4 * scaleMultiplier))}px` : undefined,
                      opacity: item.spotlightAlpha,
                      textShadow: item.textShadow,
                      ...item.strokeStyle,
                      ...(item.isGradient
                        ? {
                            backgroundImage: item.gradientCss,
                            WebkitBackgroundClip: "text",
                            backgroundClip: "text",
                            WebkitTextFillColor: "transparent",
                          }
                        : {}),
                      ...(d.scaleX && d.scaleX !== 1 ? { transform: `scaleX(${d.scaleX})` } : {}),
                    }}
                  >
                    {item.displayText}
                    {item.hasUnderline && (
                      <span
                        className="absolute left-0 right-0 pointer-events-none rounded-full"
                        style={{
                          bottom: `-${Math.max(1, Math.round(item.wordFontSize * 0.1))}px`,
                          height: `${Math.max(2, Math.round(item.wordFontSize * 0.08))}px`,
                          backgroundColor: item.underlineColor,
                        }}
                      />
                    )}
                  </motion.span>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
