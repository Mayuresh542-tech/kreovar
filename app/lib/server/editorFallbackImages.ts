import sharp from 'sharp';
import type {InputImage,VisionBatch} from './editorFallbackInputs';
export {fallbackInputImages} from './editorFallbackInputs';

/** Groq accepts three images. Contact sheets preserve every bounded input, with
 * stable numbered panels; no frame is silently discarded or fetched from a URL.
 */
export async function fallbackContactSheets(images:InputImage[],signal?:AbortSignal){
 const panels:Record<string,unknown>[]=[],sheets:string[]=[];
 if(!images.length)return {sheets,panels};
 const metadata=await Promise.all(images.map(image=>sharp(Buffer.from(image.data,'base64'),{limitInputPixels:4000000}).metadata()));signal?.throwIfAborted();
 const sizes=metadata.map(m=>m.orientation&&m.orientation>=5?{width:m.height||1,height:m.width||1}:{width:m.width||1,height:m.height||1});
 const portrait=sizes.filter(m=>m.height>m.width).length>sizes.length/2,tileWidth=portrait?216:384,tileHeight=portrait?384:280,gutter=12,rowHeight=tileHeight+32+gutter;
 const perSheet=images.length;
 for(let offset=0;offset<images.length;offset+=perSheet){
  signal?.throwIfAborted();
  const page=images.slice(offset,offset+perSheet),columns=Math.min(3,page.length),width=columns*(tileWidth+gutter)+gutter,height=Math.ceil(page.length/columns)*rowHeight+gutter;
  const tiles=await Promise.all(page.map(async(image,index)=>{
   const number=offset+index+1,left=(index%columns)*(tileWidth+gutter)+gutter,top=Math.floor(index/columns)*rowHeight+gutter;
   const input=await sharp(Buffer.from(image.data,'base64'),{limitInputPixels:4000000}).rotate().resize(tileWidth,tileHeight,{fit:'contain',background:'#161b26'}).jpeg().toBuffer();
   const caption=Buffer.from(`<svg width="${tileWidth}" height="32"><rect width="${tileWidth}" height="32" fill="#2453a1"/><text x="12" y="23" fill="white" font-size="18" font-family="sans-serif" font-weight="bold">Panel ${number}</text></svg>`);
   const size=sizes[offset+index],scale=Math.min(tileWidth/size.width,tileHeight/size.height),w=size.width*scale,h=size.height*scale;
   panels.push({panel:number,sheet:sheets.length+1,...image.label,row:Math.floor(index/columns)+1,column:index%columns+1,imageBounds:{x:left,y:top+32,width:tileWidth,height:tileHeight},sheetWidth:width,sheetHeight:height,sourceBounds:{x:(tileWidth-w)/(2*tileWidth),y:(tileHeight-h)/(2*tileHeight),width:w/tileWidth,height:h/tileHeight},regionCoordinates:'3x3 grid of source image only; exclude tile padding and panel-number strip'});
   return [{input,left,top:top+32},{input:caption,left,top}];
  }));
  signal?.throwIfAborted();
  sheets.push((await sharp({create:{width,height,channels:3,background:'#161b26'}}).composite(tiles.flat()).jpeg({quality:85}).toBuffer()).toString('base64'));
 }
 return {sheets,panels:panels.sort((a,b)=>Number(a.panel)-Number(b.panel))};
}

/** Native hosts retain one numbered contact sheet and one observation request. */
export async function fallbackVisionBatches(images:InputImage[],signal?:AbortSignal):Promise<VisionBatch[]>{
 return images.length?[{...await fallbackContactSheets(images,signal),offset:0,mode:'sheet' as const}]:[];
}
