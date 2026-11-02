import {DEFAULT_CAPTION_TEMPLATES} from './templates';
import {AI_EDIT_CAPTION_TEMPLATES} from './aiEditStyles';
import type {CaptionTemplate,CaptionStyleConfig} from './templates';
import type {CaptionStudioDesign} from './studioDesign';
import {REFERENCE_PREVIEW_FONT_SIZES} from './referencePreviewMetrics';
export interface ReferenceCaptionTemplate extends CaptionTemplate {referenceName:string;fontNote?:string;matchNote:string;previewFontSize:number;sampleText:string}
const base:CaptionStyleConfig={fontFamily:'Inter',fontSize:46,fontWeight:600,textTransform:'none',textColor:'#ffffff',highlightColor:'#c8ff00',alignment:'center',position:'center',maxWordsPerLine:5,lineSpacing:1.1,letterSpacing:'0em',animation:'fade',animationSpeed:.22,highlightingMode:'keyword',strokeWidth:0};
const make=(name:string,font:string,weight:number,color:string,highlight:string,studio:CaptionStudioDesign={},extra:Partial<CaptionStyleConfig>={},fontNote?:string):ReferenceCaptionTemplate=>({id:'study-'+name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/-$/,''),name,referenceName:name,category:studio.layout==='hero'?'Creator':'Trending',tagline:fontNote?'Free font equivalent':font+' · '+(studio.layout||'inline'),description:'Independent recreation from observed Kalakar typography and controls.',matchNote:'Measured typography and layout; source animation parity is not fully verified.',previewFontSize:REFERENCE_PREVIEW_FONT_SIZES[name]??85,sampleText:studio.layout||['Scribble','Kathmandu','Underline'].includes(name)?'Hello and Welcome to Kreovar.':'Welcome to Kreovar.',...(fontNote?{fontNote}:{}),style:{...base,fontFamily:font,fontWeight:weight,textColor:color,highlightColor:highlight,studio:{...studio,...(font==='Instrument Serif'?{italic:true}:{}),...(studio.emphasisFont==='Instrument Serif'?{emphasisItalic:true}:{})},...extra}});
const hero=(font='Anton',scale=2.2):CaptionStudioDesign=>({layout:'hero',emphasisFont:font,emphasisScale:scale,emphasisCase:'uppercase',emphasisSelection:'middle',entrance:'slide-up'});
export const REFERENCE_CAPTION_TEMPLATES:ReferenceCaptionTemplate[]=[
 make('Scribble','Outfit',700,'#ffffff','#e0251c',{emphasisFont:'Yellowtail',emphasisWeight:400,emphasisScale:1.3,emphasisSelection:'first',entrance:'typewriter',emphasisLetterSpacing:0},{letterSpacing:'-.067em'},'Yellowtail replaces the custom animated Yellowtail Scribble glyphs; stroke drawing differs.'),
 make('Lahore','Inter',800,'#ffffff','#a0d83e',{...hero('Noto Sans Devanagari',2.1867),emphasisWeight:900,emphasisGradient:{from:'#a0d83e',to:'#a0d83e',angle:0,stops:[{offset:0,color:'#a0d83e'},{offset:.2,color:'#a0d83e'},{offset:.4,color:'#aadc53'},{offset:.5,color:'#cae993'},{offset:.7,color:'#aadc53'},{offset:.8,color:'#a0d83e'},{offset:1,color:'#a0d83e'}]}},{lineSpacing:.9}),
 make('Dynamic','Inter',500,'#ffffff','#e4c813',{layout:'dynamic',rowOffset:1.5758,rowRotation:-2,rowMargins:[0,.0424,-.5879],edgeFont:'Instrument Serif',edgeItalic:true,edgeScale:2,emphasisFont:'Inter',emphasisWeight:700,emphasisScale:2,emphasisCase:'uppercase',emphasisSelection:'middle',entrance:'slide-left'},{lineSpacing:.9}),
 make('Devin Jatho 2.0','Saira',800,'#ffffff','#e3e3e3',{layout:'stacked',entrance:'punch',gradient:{from:'#ffffff',to:'#777777',angle:90},depth:2},{textTransform:'uppercase',lineSpacing:.95},'Saira replaces the custom Saira Extra Bold Wide font.'),
 make('Lala','Caveat',500,'#23434a','#23434a',{layout:'stacked',rowSplit:.6,emphasisFont:'Caveat',emphasisSelection:'second-row',emphasisScale:1.9,emphasisUnderline:true,underlineColor:'#ef6842',entrance:'type-on'},{fontSize:54,lineSpacing:1.05},'Caveat replaces the custom handwriting; orange underline is recreated. Promotional artwork is not included.'),
 make('Ali Abdaal','Poppins',600,'#000000','#f5f3eb',{entrance:'fade',spotlight:true},{containerBg:'#f5f3eb',strokeWidth:0}),
 make('Double Trouble','Montserrat',800,'#ffffff','#ffffff',{layout:'stacked',rowSplit:.6,emphasisFont:'Inter',emphasisWeight:300,emphasisSelection:'second-row',entrance:'fade'},{lineSpacing:1}),
 make('Delhi','Instrument Sans',500,'#ffffff','#ffffff',{emphasisFont:'Instrument Serif',emphasisScale:1.5,emphasisSelection:'last',glow:20,glowColor:'#ffffff',glowTarget:'emphasis',entrance:'fade'},{lineSpacing:1}),
 make('Kalakar Motion','Instrument Serif',500,'#fffff0','#a6190d',{...hero('Anton',3.158),heroPlacement:'banner',depthTarget:'emphasis',emphasisWeight:400,emphasisLetterSpacing:0,depth:5,depthAngle:210,depthColor:'#00000080'},{lineSpacing:.9,letterSpacing:'-.027083em'}),
 make('Kathmandu','Montserrat',800,'#ffffff','#f9fd45',{layout:'inline',emphasisSelection:'middle-pair',emphasisScale:1.34,lowercase:true,glow:36,glowColor:'#898b26',entrance:'slide-up'},{letterSpacing:'-.05291em',lineSpacing:1}),
 make('Bubbles','Roboto',500,'#ffffff','#ffffff',{entrance:'pop',backgroundRadius:12},{highlightBg:'#353535',highlightingMode:'current-word'}),
 make('IJ Template','Inter',700,'#f6efcc','#f6efcc',{layout:'stacked',rowSplit:.6,emphasisSelection:'second-row',emphasisScale:1.4,emphasisWeight:800,entrance:'fade'},{fontSize:50,textTransform:'uppercase',lineSpacing:1,letterSpacing:'.02em'},'Inter recreates the lettering visible in the IJ preview; exact source font is unverified. Promotional artwork is not included.'),
 make('Kalakar Glow','Inter',800,'#ffffff','#a0d83e',{...hero('Inter',2.1867),emphasisWeight:900,emphasisGradient:{from:'#a0d83e',to:'#a0d83e',angle:0,stops:[{offset:0,color:'#a0d83e'},{offset:.2,color:'#a0d83e'},{offset:.4,color:'#aadc53'},{offset:.5,color:'#cae993'},{offset:.7,color:'#aadc53'},{offset:.8,color:'#a0d83e'},{offset:1,color:'#a0d83e'}]}},{lineSpacing:.9}),
 make('Clean Motion','Inter',600,'#ffffff','#ffffff',{entrance:'slide-up'}),
 make('Goa','Onest',700,'#ffffff','#c79bff',{emphasisFont:'Parisienne',emphasisWeight:400,emphasisScale:1.38,emphasisSelection:'middle',glow:20,glowColor:'#c79bff',glowTarget:'emphasis',entrance:'pop'},{lineSpacing:1.06,letterSpacing:'-.00896em'}),
 make('Islamabad','Bebas Neue',400,'#ffffff','#ffffff',{layout:'stacked',entrance:'type-on'},{textTransform:'uppercase',letterSpacing:'.04em'},'Character animation/layout is a recreated treatment.'),
 make('Mumbai','Archivo Black',900,'#ffffff','#ffffff',{layout:'stacked',rowSplit:.4,emphasisFont:'Kaushan Script',emphasisWeight:400,emphasisSelection:'second-row',emphasisCase:'none',emphasisLetterSpacing:.00833,emphasisScale:1.0625,entrance:'scale'},{textTransform:'uppercase',lineSpacing:.6,letterSpacing:'.02083em'},'Archivo Black replaces Smart Sans Std Bold.'),
 make('Karachi','Jost',400,'#ffffff','#e3bb6c',{layout:'stacked',rowSplit:.4,emphasisFont:'Bitter',emphasisWeight:800,emphasisSelection:'second-row',emphasisScale:1.6875,entrance:'slide-up'},{textTransform:'uppercase',lineSpacing:1,letterSpacing:'.09067em'},'Jost replaces Acre Regular.'),
 make('Shamani','Montserrat',600,'#ffffff','#ffffff',{entrance:'typewriter'},{textTransform:'uppercase',letterSpacing:'.08em'}),
 make('Shamani 2','Bebas Neue',700,'#ffffff','#dddddd',{entrance:'scale',gradient:{from:'#ffffff',to:'#aaaaaa',angle:90},depth:2},{letterSpacing:'.015em'},'Bebas Neue replaces Baro Plain.'),
 make('Flicker','Inter',300,'#ffffff','#f0f6fc',{...hero('Michroma',2),emphasisCase:'none',emphasisWeight:400,entrance:'flicker'},{lineSpacing:.9},'Inter Light replaces Helvetica Light.'),
 make('Underline','Inter',600,'#ffffff','#ffffff',{layout:'stacked',rowSplit:.6,emphasisSelection:'last',emphasisUnderline:true,entrance:'fade'},{lineSpacing:1}),
 make('Pop Up','Montserrat',900,'#ffffff','#0bdd28',{emphasisScale:1.34,emphasisSelection:'last',entrance:'pop'},{textTransform:'uppercase',strokeWidth:3,strokeColor:'#000000'}),
 make('Dhaka','Chakra Petch',700,'#ffffff','#fefe00',{layout:'hero',scaleX:.9,emphasisSelection:'middle',emphasisScale:1.7,depth:2,depthColor:'#a7a20c',entrance:'punch'},{textTransform:'uppercase',lineSpacing:1,letterSpacing:'-.0629em',shadowColor:'#00000099',shadowBlur:3,shadowOffsetX:2,shadowOffsetY:3}),
 make('Kalakar Shadow','Inter',800,'#ffffff','#fe9c03',{...hero('Inter',1.4),emphasisWeight:900,gradient:{from:'#ffffff',to:'#555555',angle:90,stops:[{offset:0,color:'#ffffff'},{offset:.45,color:'#ffffff'},{offset:1,color:'#555555'}]},emphasisGradient:{from:'#fe9c03',to:'#555555',angle:90,stops:[{offset:0,color:'#fe9c03'},{offset:.45,color:'#fe9c03'},{offset:1,color:'#555555'}]}}),
 make('Kalakar','Inter',500,'#ffffff','#c8ff00',{...hero('Inter',2.9167),emphasisWeight:900},{lineSpacing:.9}),
 make('Hormozi Style','Anton',700,'#97de25','#a5fd4b',{gradient:{from:'#77a748',to:'#a5fd4b',angle:90},entrance:'pop'},{textTransform:'uppercase',strokeWidth:.2,strokeColor:'#000000'}),
 make('Editing Skool','Inter',700,'#ffffff','#ffffff',{entrance:'type-on'},{maxWordsPerLine:1}),
 make('Mr Beast Style 1','Luckiest Guy',400,'#ffffff','#ffffff',{entrance:'bounce'},{strokeWidth:1.5,strokeColor:'#000000'}),
 make('Mr Beast Style 2','Jost',900,'#ffd700','#ffd700',{entrance:'pop'},{textTransform:'uppercase'},'Jost replaces the licensed Futura font.'),
 make('Iman Gadzhi','Mona Sans',600,'#ffffff','#ffffff',{entrance:'fade'}),
 make('Devin Jatho','Montserrat',700,'#a34eff','#a34eff',{entrance:'scale'},{textTransform:'uppercase'}),
 make('Highlighted Word','Montserrat',600,'#ffffff','#f5a623',{}, {highlightingMode:'current-word'}),
 make('Clean Glow Style','Inter',500,'#ffffff','#ffffff',{glow:12,glowColor:'#ffffff',entrance:'fade'}),
 make('Kalakar Clean','Inter',500,'#ffffff','#ffffff',{entrance:'none'}),
 make('Black Punch','Anton',700,'#000000','#000000',{entrance:'punch'},{textTransform:'uppercase',strokeWidth:.3,strokeColor:'#b4b4b4'}),
 make('Kalakar Word','Inter',500,'#d7dad8','#d7dad8',{entrance:'type-on'}, {animation:'word-by-word'}),
 make('Pixelated Word','Press Start 2P',400,'#ffffff','#ffffff',{entrance:'type-on'},{fontSize:32},'Press Start 2P replaces VPPixel.'),
 make('Ziada','Inter',400,'#ffffff','#ffffff',{layout:'stacked',entrance:'slide-up'}),
 make('Liquid Glass','Mona Sans',400,'#ffffff','#ffffff',{spotlight:true,backgroundRadius:18,entrance:'fade'},{containerBg:'#454545aa'},'Translucent background approximates glass; no source-video backdrop blur.'),
 make('Top Up','Poppins',700,'#ffffff','#eccc5e',{emphasisSelection:'alternating',emphasisScale:1.4,entrance:'rise-up'}),
 make('Mota','Archivo Black',900,'#ffffff','#7fff33',{emphasisSelection:'alternating',emphasisScale:1.4,entrance:'punch'},{textTransform:'uppercase'},'Archivo Black replaces The Bold Font.'),
 make('Tabahi','Bangers',400,'#ffffff','#ffffff',{entrance:'bounce'},{textTransform:'uppercase',strokeWidth:3.3,strokeColor:'#000000'},'Bangers replaces Komika Axis.'),
 make('Deep Glow','Archivo Black',900,'#ffffff','#ffffff',{glow:24,glowColor:'#ffffff',entrance:'fade'},{textTransform:'uppercase'},'Archivo Black replaces The Bold Font.'),
 make('Seedha Saadha','Rubik',900,'#ffffff','#ffffff',{entrance:'none'},{textTransform:'uppercase',strokeWidth:4.2,strokeColor:'#000000'}),
 make('Thora Cinematic','Montserrat',600,'#ffffff','#ffffff',{layout:'stacked',rowSplit:.67,entrance:'fade'},{textTransform:'uppercase',lineSpacing:1,letterSpacing:'.20833em'}),
 make('Zero Gravity','Montserrat',400,'#ffffff','#ffffff',{layout:'split',hold:'float',entrance:'slide-up'}),
];
export function referenceCaptionTemplate(id:string){return REFERENCE_CAPTION_TEMPLATES.find(t=>t.id===id);}

export const ALL_CAPTION_TEMPLATES=[...DEFAULT_CAPTION_TEMPLATES,...REFERENCE_CAPTION_TEMPLATES,...AI_EDIT_CAPTION_TEMPLATES];
