/** Compare media against the current clock, not the previous rendered frame. Supports forward and reverse shuttle. */
export function playbackTime(time:number,playing:boolean,buffering:boolean,delta:number,duration:number,speed=1){
 if (!playing || buffering) return time;
 const next = time + Math.max(0, delta) * speed;
 return Math.max(0, Math.min(duration, next));
}
