/** These values are interpolated into FFmpeg filter syntax. TypeScript types
 * alone do not validate JSON received from a caller. Never coerce strings.
 */
export function assertRenderSettings(value:unknown):void {
 if(value===undefined||value===null)return;
 if(typeof value!=='object'||Array.isArray(value))throw Error('Invalid render settings.');
 const settings=value as Record<string,unknown>;
 const number=(value:unknown,min:number,max:number)=>{
  if(value!==undefined&&(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max))throw Error('Use finite numeric render settings within the supported range.');
 };
 number(settings.fps,1,60);number(settings.musicVolume,0,2);
 if(settings.watermark!==undefined&&settings.watermark!==null){
  if(typeof settings.watermark!=='object'||Array.isArray(settings.watermark))throw Error('Invalid watermark settings.');
  const watermark=settings.watermark as Record<string,unknown>;
  number(watermark.scale,.01,1);number(watermark.opacity,0,1);
  if(watermark.position!==undefined&&!['top-left','top-right','bottom-left','bottom-right'].includes(String(watermark.position)))throw Error('Choose a supported watermark position.');
 }
}
