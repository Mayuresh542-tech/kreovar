export interface RgbOffset {x:number;y:number}
/** Shift original channels rather than tinting duplicate footage. Alpha uses their union, avoiding additive opaque PNG edges. */
export function shiftRgbPixels(pixels:Uint8ClampedArray,width:number,height:number,offsetX:number,offsetY:number,output=new Uint8ClampedArray(pixels.length)){
 const dx=Math.round(offsetX),dy=Math.round(offsetY);
 if(!dx&&!dy){output.set(pixels);return output;}
 const rowBytes=width*4;
 for(let y=0;y<height;y++){
  const rowBase=y*rowBytes;
  const ry=y-dy,by=y+dy;
  const rValidY=ry>=0&&ry<height,bValidY=by>=0&&by<height;
  const rRowBase=ry*rowBytes,bRowBase=by*rowBytes;
  for(let x=0;x<width;x++){
   const to=rowBase+x*4;
   const rx=x-dx,bx=x+dx;
   const r=rValidY&&rx>=0&&rx<width?rRowBase+rx*4:-1;
   const b=bValidY&&bx>=0&&bx<width?bRowBase+bx*4:-1;
   const ra=r<0?0:pixels[r+3],ga=pixels[to+3],ba=b<0?0:pixels[b+3];
   if((ra&ga&ba)===255){
    output[to]=pixels[r];output[to+1]=pixels[to+1];output[to+2]=pixels[b+2];output[to+3]=255;
    continue;
   }
   const alpha=ra>=ga?(ra>=ba?ra:ba):(ga>=ba?ga:ba);
   if(!alpha){output[to]=0;output[to+1]=0;output[to+2]=0;output[to+3]=0;continue;}
   output[to]=r>=0?pixels[r]*ra/alpha:0;
   output[to+1]=pixels[to+1]*ga/alpha;
   output[to+2]=b>=0?pixels[b+2]*ba/alpha:0;
   output[to+3]=alpha;
  }
 }
 return output;
}
type RasterCanvas=OffscreenCanvas|HTMLCanvasElement;
type RasterContext=OffscreenCanvasRenderingContext2D|CanvasRenderingContext2D;
interface Scratch {input:RasterCanvas;output:RasterCanvas;inputCtx:RasterContext;outputCtx:RasterContext;result?:ImageData}
const scratch=new WeakMap<CanvasRenderingContext2D,Scratch>();
function createScratch():Scratch {
 const create=():RasterCanvas=>typeof OffscreenCanvas!=='undefined'?new OffscreenCanvas(1,1):document.createElement('canvas');
 const input=create(),output=create(),inputCtx=input.getContext('2d',{willReadFrequently:true}) as RasterContext|null,outputCtx=output.getContext('2d') as RasterContext|null;
 if(!inputCtx||!outputCtx)throw Error('RGB accents require a readable 2D canvas.');
 return {input,output,inputCtx,outputCtx};
}
/** Bounded transient CPU raster only while an RGB accent is active. No provider, asset, shader or SVG is involved. */
export function drawChromaticMedia(ctx:CanvasRenderingContext2D,image:CanvasImageSource,x:number,y:number,width:number,height:number,offset:RgbOffset){
 if(Math.abs(offset.x)<.001&&Math.abs(offset.y)<.001){ctx.drawImage(image,x,y,width,height);return;}
 let buffers=scratch.get(ctx);if(!buffers){buffers=createScratch();scratch.set(ctx,buffers);}
 // Limit peak pixel buffers even when a tall cover crop extends far outside a small card.
 const rasterScale=Math.min(1,1536/Math.max(width,height),Math.sqrt(1500000/(width*height))),pad=Math.ceil(Math.max(Math.abs(offset.x),Math.abs(offset.y))*rasterScale)+2;
 const w=Math.max(1,Math.ceil(width*rasterScale))+pad*2,h=Math.max(1,Math.ceil(height*rasterScale))+pad*2;
 for(const canvas of [buffers.input,buffers.output])if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
 buffers.inputCtx.clearRect(0,0,w,h);buffers.inputCtx.drawImage(image,pad,pad,width*rasterScale,height*rasterScale);
 const original=buffers.inputCtx.getImageData(0,0,w,h);
 if(!buffers.result||buffers.result.width!==w||buffers.result.height!==h)buffers.result=buffers.outputCtx.createImageData(w,h);
 shiftRgbPixels(original.data,w,h,offset.x*rasterScale,offset.y*rasterScale,buffers.result.data);buffers.outputCtx.putImageData(buffers.result,0,0);
 ctx.drawImage(buffers.output,x-pad/rasterScale,y-pad/rasterScale,w/rasterScale,h/rasterScale);
}
