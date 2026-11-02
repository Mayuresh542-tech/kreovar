import "../components/editor/workspace/editor.css";
import "../components/editor/workspace/editor-layout.css";
import CaptionFonts from "../components/captions/CaptionFonts";
import type {ReactNode} from "react";
import {privateMetadata} from "../lib/seo";
export const metadata=privateMetadata("Video Editor");
export default function Layout({children}:{children:ReactNode}){return <><CaptionFonts/>{children}</>;}
