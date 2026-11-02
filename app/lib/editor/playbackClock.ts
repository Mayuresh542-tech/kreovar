/** Compare media against the current clock, not the previous rendered frame. */
export function playbackTime(time:number,playing:boolean,buffering:boolean,delta:number,duration:number){
 return Math.min(duration,Math.max(0,time)+(playing&&!buffering?Math.max(0,delta):0));
}
