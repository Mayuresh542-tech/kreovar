/** Original procedural accents: no external artwork, random state, or media downloads. */
export const STYLE_SURFACES=['none','paper','grid','grain','marker','retro'] as const;
export type StyleSurface=typeof STYLE_SURFACES[number];
export function readStyleSurface(value:unknown):StyleSurface{if(!STYLE_SURFACES.includes(value as StyleSurface))throw Error('Choose a supported visual surface.');return value as StyleSurface;}
export function drawStyleSurface(ctx:CanvasRenderingContext2D,w:number,h:number,time:number,surface:StyleSurface){
 if(surface==='none')return;ctx.save();ctx.translate(-w/2,-h/2);ctx.filter='none';
 if(surface==='paper'||surface==='grain'){
  if(surface==='paper'){ctx.fillStyle='#ad793414';ctx.fillRect(0,0,w,h);}
  // A stable sparse pattern produces the same image for preview and offline export.
  let seed=surface==='paper'?219:Math.floor(time*12)+918;const next=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const size=Math.max(1,w/650);for(let i=0;i<620;i++){ctx.fillStyle=i%2?'#ffffff16':'#241b1915';ctx.fillRect(next()*w,next()*h,size*(1+next()*2),size);}
  if(surface==='paper'){ctx.strokeStyle='#65462812';ctx.lineWidth=Math.max(1,w/900);for(let y=h*.1;y<h;y+=h*.065){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();}}
 }else if(surface==='grid'){
  ctx.strokeStyle='#75baf728';ctx.lineWidth=Math.max(1,w/1000);const cell=Math.min(w,h)/12;
  for(let x=0;x<=w;x+=cell){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke();}for(let y=0;y<=h;y+=cell){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();}
 }else if(surface==='marker'){
  ctx.fillStyle='#f5dc5b4d';ctx.save();ctx.translate(w*.12,h*.76);ctx.rotate(-.025);ctx.fillRect(0,0,w*.76,h*.025);ctx.restore();
  ctx.strokeStyle='#f8f1d850';ctx.lineWidth=Math.max(2,w*.004);ctx.beginPath();ctx.moveTo(w*.04,h*.13);ctx.lineTo(w*.12,h*.12);ctx.lineTo(w*.1,h*.18);ctx.stroke();
 }else if(surface==='retro'){
  const colors=['#fda15e','#ec5fa7','#a788f5'];colors.forEach((c,i)=>{ctx.fillStyle=c+'a6';ctx.fillRect(w*.035,h*(.13+i*.014),w*(.24-i*.025),h*.009);});
  ctx.strokeStyle='#fff4c069';ctx.lineWidth=Math.max(1,w*.002);ctx.strokeRect(w*.025,h*.025,w*.95,h*.95);
 }ctx.restore();
}
