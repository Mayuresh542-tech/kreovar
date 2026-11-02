import {loadCaptionFonts} from './typography';
import {resolveCaptionStyle} from './studioCanvas';
import type {CaptionSegment} from './presets';
import type {CaptionStyleConfig} from './templates';
export async function loadCaptionDocumentFonts(segments:CaptionSegment[],global:CaptionStyleConfig){
 const styles=[global,...segments.filter(s=>s.templateId||s.styleOverride).map(s=>resolveCaptionStyle(s,global))];
 const sample=segments.map(s=>s.text).join(' '),needs=new Set<string>();
 for(const s of styles){const d=s.studio;await loadCaptionFonts(s.fontFamily,s.fontWeight,s.fontSize,s.fontAccent,sample);if(d?.italic)needs.add(`italic ${s.fontWeight} ${s.fontSize}px "${s.fontFamily}"`);if(d?.edgeFont)needs.add(`${d.edgeItalic?'italic ':' '}${s.fontWeight} ${s.fontSize}px "${d.edgeFont}"`);if(d?.emphasisFont)needs.add(`${d.emphasisItalic?'italic ':''}${d.emphasisWeight||s.fontWeight} ${s.fontSize}px "${d.emphasisFont}"`);}
 await Promise.all([...needs].map(font=>document.fonts.load(font,sample||' ')));await document.fonts.ready;
}
