import { parseSRT,parseVTT } from "../captions/subtitlesParser";
export const STUDIO_BUCKET="studio-assets";
export const MAX_STUDIO_FILE=100*1024*1024;
export const assetExtensions:Record<string,string>={"video/mp4":"mp4","video/quicktime":"mov","video/webm":"webm","audio/mpeg":"mp3","audio/wav":"wav","audio/x-wav":"wav","audio/mp4":"m4a","audio/ogg":"ogg","audio/webm":"webm","image/png":"png","image/jpeg":"jpg","image/webp":"webp","application/x-subrip":"srt","text/vtt":"vtt","text/plain":"txt"};
export function assetFilename(name:string,mime:string){const extension=assetExtensions[mime];if(!extension)throw new Error("Unsupported file format.");const stem=name.normalize("NFC").replace(/[\x00-\x1f\x7f<>:"/\\|?*]/g,"_").replace(/\.[a-z0-9]{1,8}$/i,"").replace(/[. ]+$/g,"").trim().slice(0,140)||"Kreovar asset";return (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(stem)?"Kreovar-":"")+stem+"."+extension;}
export function assetMetadata(raw:unknown){const result:Record<string,unknown>={};if(!raw||typeof raw!=="object")return result;const input=raw as Record<string,unknown>;for(const key of ["duration","width","height"]){const v=input[key];if(typeof v==="number"&&Number.isFinite(v)&&v>=0&&v<86400)result[key]=v;}for(const key of ["prompt","aspectRatio","providerAssetId","sourcePage","captionPreset","timingSource","toolType","topic"]){const v=input[key];if(typeof v==="string"&&v.length<=2000)result[key]=v;}if(typeof input.text==="string"&&input.text.length<=20000)result.text=input.text;return result;}
export function validateAssetBytes(bytes:Buffer,mime:string){
 if(!bytes.length||bytes.length>MAX_STUDIO_FILE||!assetExtensions[mime])throw new Error("Choose a supported file up to 100 MB.");
 if(mime==="text/plain"){if(bytes.length>100000||!bytes.toString("utf8").trim()||bytes.includes(0))throw new Error("Choose a text document up to 100 KB.");return {}; }
 const ascii=(start:number,end:number)=>bytes.subarray(start,end).toString("ascii");let valid=false;
 if(mime==="image/png")valid=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
 if(mime==="image/jpeg")valid=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
 if(mime==="image/webp")valid=ascii(0,4)==="RIFF"&&ascii(8,12)==="WEBP";
 if(mime.includes("wav"))valid=ascii(0,4)==="RIFF"&&ascii(8,12)==="WAVE";
 if(mime==="audio/mpeg")valid=ascii(0,3)==="ID3"||(bytes[0]===255&&(bytes[1]&224)===224);
 if(mime==="audio/ogg")valid=ascii(0,4)==="OggS";
 if(mime.endsWith("/webm"))valid=bytes.subarray(0,4).equals(Buffer.from([26,69,223,163]));
 if(mime.endsWith("/mp4")||mime==="video/quicktime")valid=["ftyp","moov","mdat","wide"].includes(ascii(4,8));
 if(mime==="application/x-subrip"||mime==="text/vtt"){
   if(bytes.length>1024*1024)throw new Error("Caption files support up to 1 MB.");
   const text=bytes.toString("utf8").replace(/^\uFEFF/,""),segments=(mime==="text/vtt"?parseVTT:parseSRT)(text);
   if(!segments.length||segments.length>10000||segments.some(s=>!s.text.trim()||s.start<0||!Number.isFinite(s.start)||!Number.isFinite(s.end)||s.end<=s.start))throw new Error("Choose a valid timed SRT or VTT file.");
   return {segments};
 }
 if(!valid)throw new Error("The file contents do not match its media format.");
 return {};
}
