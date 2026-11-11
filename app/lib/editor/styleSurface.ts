/** Original procedural accents: no external artwork, random state, or media downloads. */
export const STYLE_SURFACES=['none','paper','grid','grain','marker','retro'] as const;
export type StyleSurface=typeof STYLE_SURFACES[number];
export function readStyleSurface(value:unknown):StyleSurface{if(!STYLE_SURFACES.includes(value as StyleSurface))throw Error('Choose a supported visual surface.');return value as StyleSurface;}
type SurfaceCanvas = OffscreenCanvas | HTMLCanvasElement;
const surfaceCache = new Map<string, SurfaceCanvas>();
const MAX_SURFACE_CACHE = 24;

function makeSurfaceCanvas(w: number, h: number): { canvas: SurfaceCanvas; ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null } {
 if (typeof OffscreenCanvas !== 'undefined') {
  const canvas = new OffscreenCanvas(w, h);
  return { canvas, ctx: canvas.getContext('2d') };
 }
 const canvas = document.createElement('canvas');
 canvas.width = w;
 canvas.height = h;
 return { canvas, ctx: canvas.getContext('2d') };
}

function renderSurfaceToContext(ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D, w: number, h: number, seedBase: number, surface: StyleSurface) {
 if (surface === 'paper' || surface === 'grain') {
  if (surface === 'paper') { ctx.fillStyle = '#ad793414'; ctx.fillRect(0, 0, w, h); }
  // A stable sparse pattern produces the same image for preview and offline export.
  let seed = seedBase;
  const next = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const size = Math.max(1, w / 650);
  const evenX: number[] = [], evenY: number[] = [], evenW: number[] = [];
  const oddX: number[] = [], oddY: number[] = [], oddW: number[] = [];
  for (let i = 0; i < 620; i++) {
   const x = next() * w, y = next() * h, rw = size * (1 + next() * 2);
   if (i % 2) { oddX.push(x); oddY.push(y); oddW.push(rw); }
   else { evenX.push(x); evenY.push(y); evenW.push(rw); }
  }
  ctx.fillStyle = '#241b1915';
  for (let i = 0; i < evenX.length; i++) ctx.fillRect(evenX[i], evenY[i], evenW[i], size);
  ctx.fillStyle = '#ffffff16';
  for (let i = 0; i < oddX.length; i++) ctx.fillRect(oddX[i], oddY[i], oddW[i], size);
  if (surface === 'paper') {
   ctx.strokeStyle = '#65462812'; ctx.lineWidth = Math.max(1, w / 900);
   ctx.beginPath();
   for (let y = h * .1; y < h; y += h * .065) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
   ctx.stroke();
  }
 } else if (surface === 'grid') {
  ctx.strokeStyle = '#75baf728'; ctx.lineWidth = Math.max(1, w / 1000); const cell = Math.min(w, h) / 12;
  ctx.beginPath();
  for (let x = 0; x <= w; x += cell) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
  for (let y = 0; y <= h; y += cell) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
  ctx.stroke();
 } else if (surface === 'marker') {
  ctx.fillStyle = '#f5dc5b4d'; ctx.save(); ctx.translate(w * .12, h * .76); ctx.rotate(-.025); ctx.fillRect(0, 0, w * .76, h * .025); ctx.restore();
  ctx.strokeStyle = '#f8f1d850'; ctx.lineWidth = Math.max(2, w * .004); ctx.beginPath(); ctx.moveTo(w * .04, h * .13); ctx.lineTo(w * .12, h * .12); ctx.lineTo(w * .1, h * .18); ctx.stroke();
 } else if (surface === 'retro') {
  const colors = ['#fda15e', '#ec5fa7', '#a788f5'];
  colors.forEach((c, i) => { ctx.fillStyle = c + 'a6'; ctx.fillRect(w * .035, h * (.13 + i * .014), w * (.24 - i * .025), h * .009); });
  ctx.strokeStyle = '#fff4c069'; ctx.lineWidth = Math.max(1, w * .002); ctx.strokeRect(w * .025, h * .025, w * .95, h * .95);
 }
}

export function drawStyleSurface(ctx:CanvasRenderingContext2D,w:number,h:number,time:number,surface:StyleSurface){
 if(surface==='none')return;
 const cw=Math.max(1,Math.round(w)),ch=Math.max(1,Math.round(h));
 const seedBase=surface==='paper'?219:Math.floor(time*12)+918;
 const key=surface==='grain'?`grain:${cw}:${ch}:${seedBase}`:`${surface}:${cw}:${ch}`;
 let cached=surfaceCache.get(key);
 if(!cached&&(typeof OffscreenCanvas!=='undefined'||typeof document!=='undefined')){
  const off=makeSurfaceCanvas(cw,ch);
  if(off.ctx){
   renderSurfaceToContext(off.ctx,cw,ch,seedBase,surface);
   if(surfaceCache.size>=MAX_SURFACE_CACHE){const first=surfaceCache.keys().next().value;if(first!==undefined)surfaceCache.delete(first);}
   surfaceCache.set(key,off.canvas);
   cached=off.canvas;
  }
 }
 ctx.save();ctx.translate(-w/2,-h/2);ctx.filter='none';
 if(cached)ctx.drawImage(cached,0,0,w,h);
 else renderSurfaceToContext(ctx,w,h,seedBase,surface);
 ctx.restore();
}
