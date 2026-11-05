/** Bounded, original geometry only: no SVG, scripts, remote assets or arbitrary commands. */
export const STROKE_PATH_KINDS = ['rough-ellipse', 'box', 'underline', 'polyline'] as const;
export type StrokePathKind = typeof STROKE_PATH_KINDS[number];
export interface StrokePoint { x: number; y: number }
export interface StrokePathStyle {
  kind: StrokePathKind;
  seed?: number;
  roughness?: number;
  loops?: number;
  points?: StrokePoint[];
  /** Absolute source-clock seconds, so split/trim/move/speed retain the original reveal. */
  revealStart?: number;
  revealDuration?: number;
}
export interface StrokeDrawContext { sourceTime?: number; progress?: number }
const fail = () => { throw Error('Choose a valid bounded stroke path, time and progress.'); };
const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail();
  return value as Record<string, unknown>;
};
function bounded(value: unknown, fallback: number, low: number, high: number, integer = false): number {
  const n = value === undefined ? fallback : value;
  if (typeof n !== 'number' || !Number.isFinite(n) || n < low || n > high || integer && !Number.isInteger(n)) return fail();
  return n;
}
export function readStrokePath(value: unknown): StrokePathStyle {
  const s = record(value);
  if (Object.keys(s).some(key => !['kind', 'seed', 'roughness', 'loops', 'points', 'revealStart', 'revealDuration'].includes(key)) || !STROKE_PATH_KINDS.includes(s.kind as StrokePathKind)) return fail();
  const out: StrokePathStyle = {
    kind: s.kind as StrokePathKind,
    seed: bounded(s.seed, 0, 0, 0xffffffff, true),
    roughness: bounded(s.roughness, .025, 0, .12),
    loops: bounded(s.loops, 2, 1, 3, true),
    revealStart: bounded(s.revealStart, 0, 0, 86400),
    revealDuration: bounded(s.revealDuration, .6, 0, 60),
  };
  if (s.kind === 'polyline') {
    if (!Array.isArray(s.points) || s.points.length < 2 || s.points.length > 64) return fail();
    out.points = s.points.map(raw => {
      const p = record(raw);
      if (Object.keys(p).some(key => key !== 'x' && key !== 'y') || p.x === undefined || p.y === undefined) return fail();
      return { x: bounded(p.x, 0, -.5, .5), y: bounded(p.y, 0, -.5, .5) };
    });
  } else if (s.points !== undefined) return fail();
  return out;
}
export function strokeProgress(path: StrokePathStyle, context: StrokeDrawContext = {}): number {
  if (context.sourceTime !== undefined && (!Number.isFinite(context.sourceTime) || context.sourceTime < 0 || context.sourceTime > 86400)) return fail();
  if (context.progress !== undefined) return bounded(context.progress, 1, 0, 1);
  if (context.sourceTime === undefined) return 1;
  const start = path.revealStart ?? 0, duration = path.revealDuration ?? .6;
  return duration === 0 ? (context.sourceTime < start ? 0 : 1) : Math.min(1, Math.max(0, (context.sourceTime - start) / duration));
}
/** Normalized points remain within [-.5,.5]; maximum generated size is 193 points. */
export function strokeGeometry(path: StrokePathStyle): { points: StrokePoint[]; closed: boolean } {
  const s = readStrokePath(path);
  if (s.kind === 'box') return { points: [{x:-.5,y:-.5},{x:.5,y:-.5},{x:.5,y:.5},{x:-.5,y:.5},{x:-.5,y:-.5}], closed: true };
  if (s.kind === 'polyline') return { points: s.points!, closed: false };
  let seed = s.seed! >>> 0;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const phaseA = random() * Math.PI * 2, phaseB = random() * Math.PI * 2, rough = s.roughness!;
  if (s.kind === 'underline') {
    return { points: Array.from({length:33}, (_, i) => ({x:i/32-.5,y:rough*(Math.sin(i/32*Math.PI*2+phaseA)*.65+Math.sin(i/32*Math.PI*5+phaseB)*.25)})), closed:false };
  }
  const steps = s.loops! * 64, points = Array.from({length:steps+1}, (_, i) => {
    const angle = -Math.PI / 2 + i / 64 * Math.PI * 2;
    const rx = .5 - rough + rough * (.65 * Math.sin(angle * 2.7 + phaseA) + .25 * Math.sin(angle * 5.1 + phaseB));
    const ry = .5 - rough + rough * (.65 * Math.cos(angle * 3.1 + phaseB) + .25 * Math.sin(angle * 4.7 + phaseA));
    return {x:Math.cos(angle)*rx,y:Math.sin(angle)*ry};
  });
  return {points,closed:true};
}
/** Reveal by pixel arclength, including a partial final segment instead of point-count jumps. */
export function drawStrokePath(ctx: CanvasRenderingContext2D, path: StrokePathStyle, width: number, height: number, context: StrokeDrawContext = {}, fill = false, stroke = true): void {
  if (![width,height].every(n => Number.isFinite(n) && n > 0 && n <= 32768)) return fail();
  const normalized = readStrokePath(path), progress = strokeProgress(normalized, context);
  if (progress === 0) return;
  const geometry = strokeGeometry(normalized), points = geometry.points.map(p=>({x:p.x*width,y:p.y*height}));
  if (geometry.closed) points[points.length-1] = {...points[0]};
  const lengths = points.slice(1).map((p,i)=>Math.hypot(p.x-points[i].x,p.y-points[i].y));
  let remaining = lengths.reduce((sum,n)=>sum+n,0)*progress;
  if (remaining <= 0) return;
  ctx.beginPath();ctx.moveTo(points[0].x,points[0].y);
  for(let i=1;i<points.length&&remaining>0;i++) {
    const before=points[i-1], after=points[i], length=lengths[i-1];
    if(length===0) continue;
    const fraction=Math.min(1,remaining/length);
    ctx.lineTo(before.x+(after.x-before.x)*fraction,before.y+(after.y-before.y)*fraction);
    remaining-=length;
  }
  if(geometry.closed&&progress===1){ctx.closePath();if(fill)ctx.fill();}
  if(stroke)ctx.stroke();
}

