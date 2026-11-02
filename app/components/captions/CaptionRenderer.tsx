"use client";

import {wordHighlight,distinctHighlight} from "@/app/lib/captions/highlighting";
import {captionFontFamily,textDirection} from "@/app/lib/captions/languages";
import {wordTypography} from "@/app/lib/captions/typography";
import React, { useMemo } from "react";
import { motion } from "framer-motion";
import {
  CaptionStyleConfig,
} from "@/app/lib/captions/templates";
import { TTSWordTimestamp } from "@/app/lib/captions/presets";

export interface CaptionRendererProps {
  text: string;
  words?: TTSWordTimestamp[];
  currentTime: number;
  style: CaptionStyleConfig;
  className?: string;
  scaleMultiplier?: number; // for scaling down in thumbnail cards
}

export default function CaptionRenderer({
  text,
  words = [],
  currentTime,
  style,
  className = "",
  scaleMultiplier = 1,
}: CaptionRendererProps) {
  const hasWords = words && words.length > 0;

  // Compute text stroke style
  const strokeStyle = useMemo(() => {
    if (!style.strokeWidth || style.strokeWidth <= 0 || !style.strokeColor) {
      return {};
    }
    const scaledStroke = Math.max(1, Math.round(style.strokeWidth * scaleMultiplier));
    return {
      WebkitTextStroke: `${scaledStroke}px ${style.strokeColor}`,
      paintOrder: "stroke fill",
    };
  }, [style.strokeWidth, style.strokeColor, scaleMultiplier]);

  // Compute text shadow
  const shadowStyle = useMemo(() => {
    if (!style.shadowColor) return {};
    const ox = (style.shadowOffsetX ?? 0) * scaleMultiplier;
    const oy = (style.shadowOffsetY ?? 0) * scaleMultiplier;
    const blur = (style.shadowBlur ?? 0) * scaleMultiplier;
    return {
      textShadow: `${ox}px ${oy}px ${blur}px ${style.shadowColor}`,
    };
  }, [style.shadowColor, style.shadowOffsetX, style.shadowOffsetY, style.shadowBlur, scaleMultiplier]);

  // Font size calculation
  const computedFontSize = Math.max(12, Math.round(style.fontSize * scaleMultiplier));

  // Highlighting mode helper
  function getWordAppearance(wordObj: TTSWordTimestamp, index: number) {
    const isCurrent = currentTime >= wordObj.start && currentTime <= wordObj.end;
    const isPast = currentTime > wordObj.end;
    const isFuture = currentTime < wordObj.start;
    const isHighlighted=wordHighlight(style.highlightingMode,wordObj.word,index,isCurrent,style.highlightWords);
    const color=isHighlighted?(style.highlightingMode==='full-line'?style.highlightColor:distinctHighlight(style.textColor,style.highlightColor)):style.textColor;
    const bg=isCurrent?style.highlightBg:undefined;

    return { isCurrent, isPast, isFuture, isHighlighted, color, bg };
  }

  // Animation variants per word or line
  function getWordAnimationProps(isCurrent: boolean, isFuture: boolean) {
    const speed = style.animationSpeed || 0.18;

    switch (style.animation) {
      case "pop":
        return {
          animate: isCurrent
            ? { scale: [1, 1.25, 1.15] }
            : { scale: 1 },
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
        return {
          animate: isCurrent ? { scale: 1.18 } : { scale: 1 },
          transition: { duration: speed },
        };

      case "slide-up":
        return {
          initial: { y: 10 * scaleMultiplier, opacity: 0.6 },
          animate: { y: 0, opacity: 1 },
          transition: { duration: speed },
        };

      case "slide-down":
        return {
          initial: { y: -10 * scaleMultiplier, opacity: 0.6 },
          animate: { y: 0, opacity: 1 },
          transition: { duration: speed },
        };

      case "word-by-word":
        return {
          animate: {
            opacity: isFuture ? 0 : 1,
            scale: isCurrent ? 1.12 : 1,
          },
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

  return (
    <div
      dir={textDirection(text)}
      className={`inline-block select-none text-center transition-all ${className}`}
      style={{
        backgroundColor: style.containerBg || "transparent",
        border: style.containerBorder || "none",
        borderRadius: style.containerBorderRadius
          ? `${style.containerBorderRadius * scaleMultiplier}px`
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
        className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1"
        style={{
          fontFamily: style.fontFamily,
          fontSize: `${computedFontSize}px`,
          fontWeight: style.fontWeight,
          textTransform: style.textTransform,
          letterSpacing: style.letterSpacing,
          lineHeight: style.lineSpacing,
          textAlign: style.alignment,
        }}
      >
        {hasWords ? (
          words.map((w, idx) => {
            const { isCurrent, isFuture, color, bg } = getWordAppearance(w, idx);
            const animProps = getWordAnimationProps(isCurrent, isFuture);
            const type=wordTypography(style.fontFamily,style.fontWeight,style.fontAccent,idx,words.length);

            return (
              <motion.span
                key={`${idx}_${w.word}`}
                {...animProps}
                className="inline-block transition-colors rounded-sm"
                style={{
                  ...strokeStyle,
                  ...shadowStyle,
                  fontFamily:captionFontFamily(type.font,w.word),
                  fontWeight:type.weight,
                  color,
                  backgroundColor: bg || "transparent",
                  padding: bg ? `0 ${Math.max(2, Math.round(4 * scaleMultiplier))}px` : undefined,
                  display: "inline-block",
                }}
              >
                {w.word}
              </motion.span>
            );
          })
        ) : (
          <motion.span
            initial={{ opacity: 0.7, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: style.animationSpeed || 0.18 }}
            style={{
              ...strokeStyle,
              ...shadowStyle,
              color: style.textColor,
            }}
          >
            {text.split(/\s+/).filter(Boolean).map((word,index,all)=>{const type=wordTypography(style.fontFamily,style.fontWeight,style.fontAccent,index,all.length),highlight=wordHighlight(style.highlightingMode,word,index,false,style.highlightWords);return <React.Fragment key={index}>{index>0?' ':''}<span style={{fontFamily:captionFontFamily(type.font,word),fontWeight:type.weight,color:highlight?(style.highlightingMode==='full-line'?style.highlightColor:distinctHighlight(style.textColor,style.highlightColor)):style.textColor}}>{word}</span></React.Fragment>;})}
          </motion.span>
        )}
      </div>
    </div>
  );
}
