import {analysisFootage,type FootageFrame} from '../editor/footageContext';
import type {EditorProject} from '../editor/model';
export function readFootageFrames(value:unknown,p:EditorProject,selection:string[]):FootageFrame[]{
 if(value===undefined)return [];if(!Array.isArray(value)||value.length>6)throw Error('AI analysis supports up to six footage frames.');const allowed=new Set(analysisFootage(p,selection).map(c=>c.id));
 return value.map(item=>{if(!item||typeof item!=='object')throw Error('Invalid footage frame.');const f=item as Record<string,unknown>,clip=typeof f.clipId==='string'?p.clips[f.clipId]:undefined;
  if(!clip||!allowed.has(clip.id)||typeof f.timelineTime!=='number'||!Number.isFinite(f.timelineTime)||typeof f.sourceTime!=='number'||!Number.isFinite(f.sourceTime)||f.timelineTime<clip.startTime||f.timelineTime>clip.startTime+clip.duration||Math.abs(f.sourceTime-(clip.sourceStart+(f.timelineTime-clip.startTime)*clip.speed))>.04||f.sourceTime>clip.sourceEnd+.04)throw Error('Footage frame does not match the selected source timing.');
  if(typeof f.width!=='number'||!Number.isInteger(f.width)||f.width<1||f.width>480||typeof f.height!=='number'||!Number.isInteger(f.height)||f.height<1||f.height>480||typeof f.data!=='string'||f.data.length>48000||!/^[A-Za-z0-9+/]+={0,2}$/.test(f.data))throw Error('Invalid footage image.');
  const bytes=Buffer.from(f.data,'base64');if(bytes.length<4||bytes[0]!==255||bytes[1]!==216||bytes[2]!==255||bytes[bytes.length-2]!==255||bytes[bytes.length-1]!==217)throw Error('Footage analysis requires JPEG frames.');
  return {clipId:clip.id,timelineTime:f.timelineTime,sourceTime:f.sourceTime,width:f.width,height:f.height,data:f.data};
 });
}
