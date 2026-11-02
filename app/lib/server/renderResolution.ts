/** Enforce the delivery ceiling on server input, including portrait and square video. */
export function assertRenderResolution(value:unknown,maxResolution=1080):void {
 const size=value as {width?:unknown;height?:unknown}|null;
 const width=size?.width,height=size?.height;
 if(typeof width!=='number'||typeof height!=='number'||!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<=0||height<=0||Math.min(width,height)>maxResolution||Math.max(width,height)>Math.floor(maxResolution*16/9)){
  throw new Error(`Use a valid video resolution up to ${maxResolution}p.`);
 }
}
