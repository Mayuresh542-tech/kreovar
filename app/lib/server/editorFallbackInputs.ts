import type {EditorFallbackOptions} from './editorFallbackOptions';
export interface InputImage {data:string;label:Record<string,unknown>}
export function fallbackInputImages(options:EditorFallbackOptions):InputImage[]{
 const references=options.referenceImages||[],footage=options.fallbackFootageFrames?.length?options.fallbackFootageFrames:options.footageFrames||[],candidates=options.candidateImages||[];
 if(references.length>6||footage.length>6||candidates.length>6)throw Error('Too many editor images.');
 if(references.some(i=>i.mediaType!=='image/jpeg'))throw Error('Invalid reference image.');
 const images:InputImage[]=[
  ...references.map(i=>({data:i.data,label:{kind:'reference',styleId:i.styleId,timeSecondsApprox:i.timeSecondsApprox}})),
  ...footage.map(i=>({data:i.data,label:{kind:'footage',clipId:i.clipId,timelineTime:i.timelineTime,sourceTime:i.sourceTime}})),
  ...candidates.map(i=>({data:i.data,label:{kind:'candidate',candidateId:i.candidateId}})),
 ];
 if(images.some(i=>i.data.length>50000||!i.data.length||!/^[A-Za-z0-9+/]*={0,2}$/.test(i.data)))throw Error('Invalid editor image.');
 return images;
}


export interface VisionBatch {sheets:string[];panels:Record<string,unknown>[];offset:number;mode:'sheet'|'individual'}
