import CaptionFonts from "../components/captions/CaptionFonts";
import type {ReactNode} from "react";
import {privateMetadata} from "../lib/seo";
export const metadata=privateMetadata("Templates");
export default function Layout({children}:{children:ReactNode}){return <><CaptionFonts/>{children}</>;}
