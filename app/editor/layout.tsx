import "../components/editor/workspace/editor.css";
import "../components/editor/workspace/editor-layout.css";
import CaptionFonts from "../components/captions/CaptionFonts";
import type { ReactNode } from "react";
import type { Viewport } from "next";
import { privateMetadata } from "../lib/seo";

export const metadata = privateMetadata("Video Editor");

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <>
      <CaptionFonts />
      {children}
    </>
  );
}
