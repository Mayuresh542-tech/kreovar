import type {InputImage,VisionBatch} from './editorFallbackInputs';
export {fallbackInputImages} from './editorFallbackInputs';

/** Validate bounded JPEG dimensions without decoding pixels or native modules. */
export function jpegDimensions(data:string){
 if(!data.length||data.length>50000||!/^[A-Za-z0-9+/]*={0,2}$/.test(data))throw Error('Invalid editor image.');
 const bytes=Buffer.from(data,'base64');
 if(bytes.length<4||bytes[0]!==255||bytes[1]!==216)throw Error('Invalid JPEG.');
 let offset=2,frameComponents=0,sawScan=false,entropyBytes=0;
 let dimensions:{width:number;height:number}|undefined;
 while(offset+1<bytes.length){
  if(bytes[offset++]!==255)throw Error('Invalid JPEG marker.');
  while(bytes[offset]===255)offset++;
  const marker=bytes[offset++];
  if(marker===0xd9){
   if(!dimensions||!sawScan||!entropyBytes||offset!==bytes.length)throw Error('Incomplete JPEG.');
   return dimensions;
  }
  if(marker===0x01||marker>=0xd0&&marker<=0xd7)continue;
  if(offset+2>bytes.length)break;const length=bytes.readUInt16BE(offset);
  if(length<2||offset+length>bytes.length)throw Error('Invalid JPEG segment.');
  if([0xc0,0xc1,0xc2].includes(marker)){
   if(length<11||dimensions)throw Error('Invalid JPEG frame.');
   const height=bytes.readUInt16BE(offset+3),width=bytes.readUInt16BE(offset+5),components=bytes[offset+7];
   if(!width||!height||width*height>4000000)throw Error('Editor image exceeds the pixel limit.');
   if(bytes[offset+2]!==8||components<1||components>4||length!==8+3*components)throw Error('Invalid JPEG components.');
   dimensions={width,height};frameComponents=components;
  }
  if(marker===0xda){
   const components=bytes[offset+2];
   if(!dimensions||!components||components>frameComponents||length!==6+2*components)throw Error('Invalid JPEG scan.');
   sawScan=true;offset+=length;
   while(offset<bytes.length){
    if(bytes[offset]!==255){entropyBytes++;offset++;continue;}
    const next=bytes[offset+1];
    if(next===0||next>=0xd0&&next<=0xd7){entropyBytes++;offset+=2;continue;}
    break;
   }
  }else offset+=length;
 }
 throw Error('JPEG dimensions unavailable.');
}

/** Workers send every original JPEG to the same vision model in groups of at
 * most three. Local panel numbers are remapped only after strict validation. */
export async function fallbackVisionBatches(images:InputImage[],signal?:AbortSignal):Promise<VisionBatch[]>{
 if(images.length>18)throw Error('Too many editor images.');
 const dimensions=images.map(image=>jpegDimensions(image.data));
 const batches=[];
 for(let offset=0;offset<images.length;offset+=3){
  signal?.throwIfAborted();const page=images.slice(offset,offset+3);
  batches.push({offset,mode:'individual' as const,sheets:page.map(image=>image.data),panels:page.map((image,index)=>({
   ...image.label,panel:index+1,image:index+1,...dimensions[offset+index],
   sourceBounds:{x:0,y:0,width:1,height:1},regionCoordinates:'3x3 grid of this entire original source image',
  }))});
 }
 return batches;
}
