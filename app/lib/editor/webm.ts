/** Finalize Chrome/Firefox MediaRecorder WebM without changing encoded frames.
 * Duration uses Segment ticks: https://www.matroska.org/technical/elements.html
 * Recorder streams use an unknown-size Segment and have no absolute seek index.
 */
function vint(bytes:Uint8Array,offset:number,id=false){const first=bytes[offset];if(!first)throw new Error("Invalid WebM header.");let width=1;while(width<=8&&!(first&(1<<(8-width))))width++;if(width>8||offset+width>bytes.length)throw new Error("Truncated WebM header.");let value=BigInt(id?first:first&((1<<(8-width))-1));for(let i=1;i<width;i++)value=(value<<BigInt(8))|BigInt(bytes[offset+i]);return{width,value,unknown:!id&&value===(BigInt(1)<<BigInt(width*7))-BigInt(1)};}
function sizeBytes(value:number,width:number){if(value>=2**(7*width)-1)throw new Error("WebM metadata size overflow.");const result=new Uint8Array(width);let n=BigInt(value);for(let i=width-1;i>=0;i--){result[i]=Number(n&BigInt(255));n>>=BigInt(8);}result[0]|=1<<(8-width);return result;}
export async function finalizeWebm(blob:Blob,duration:number):Promise<Blob>{
 if(!blob.type.includes("webm"))return blob;if(!Number.isFinite(duration)||duration<=0)throw new Error("Invalid export duration.");
 // Metadata precedes media clusters, so do not copy hundreds of MB into memory.
 const bytes=new Uint8Array(await blob.slice(0,65536).arrayBuffer());let offset=0,segment=false;
 while(offset<bytes.length){const id=vint(bytes,offset,true),sizeOffset=offset+id.width,size=vint(bytes,sizeOffset),start=sizeOffset+size.width;
  if(id.value===BigInt(0x18538067)){if(!size.unknown)return blob;segment=true;offset=start;continue;}
  if(segment&&id.value===BigInt(0x114d9b74))return blob; // Preserve indexed containers unchanged.
  if(segment&&id.value===BigInt(0x1549a966)){const end=start+Number(size.value);if(size.unknown||end>bytes.length)throw new Error("Invalid WebM export metadata.");let tickScale=1000000,durationOffset=-1,durationWidth=0;
   for(let child=start;child<end;){const tag=vint(bytes,child,true),length=vint(bytes,child+tag.width),data=child+tag.width+length.width,next=data+Number(length.value);if(length.unknown||next>end)throw new Error("Invalid WebM Info element.");if(tag.value===BigInt(0xbf))return blob;
    if(tag.value===BigInt(0x2ad7b1)){tickScale=0;for(let i=data;i<next;i++)tickScale=tickScale*256+bytes[i];}
    if(tag.value===BigInt(0x4489)){durationOffset=data;durationWidth=Number(length.value);}child=next;
   }
   if(tickScale<=0)throw new Error("Invalid WebM timestamp scale.");const value=duration*1e9/tickScale;
   if(durationOffset>=0){const copy=bytes.slice(0,end),view=new DataView(copy.buffer);if(durationWidth===8)view.setFloat64(durationOffset,value);else if(durationWidth===4)view.setFloat32(durationOffset,value);else throw new Error("Invalid WebM duration field.");return new Blob([copy,blob.slice(end)],{type:blob.type});}
   const field=new Uint8Array(11);field.set([0x44,0x89,0x88]);new DataView(field.buffer).setFloat64(3,value);let width=size.width;while(Number(size.value)+11>=2**(width*7)-1)width++;
   return new Blob([bytes.slice(0,sizeOffset),sizeBytes(Number(size.value)+11,width),bytes.slice(start,end),field,blob.slice(end)],{type:blob.type});
  }
  if(size.unknown)break;offset=start+Number(size.value);
 }
 throw new Error("The recorder returned a WebM file without its metadata.");
}
