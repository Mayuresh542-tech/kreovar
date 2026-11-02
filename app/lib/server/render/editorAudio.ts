import {assertVideoDuration} from "../../editor/limits";
import {assertRenderResolution} from "../renderResolution";
import {spawn} from "node:child_process";
import {mkdtemp,writeFile,readFile,rm} from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import {getAdminClient} from "../adminAuth";
import {validateAssetBytes} from "../assetPolicy";
import {getStudioAsset} from "../assetStore";
import {aiProjectSnapshot} from "../../editor/aiValidation";
import {projectDuration,type EditorProject,type Clip} from "../../editor/model";

const MAX_FILE=100*1048576,MAX_TOTAL=250*1048576;
function run(binary:string,args:string[],signal:AbortSignal):Promise<string>{
 return new Promise((resolve,reject)=>{signal.throwIfAborted();const child=spawn(binary,args,{windowsHide:true,shell:false});let output="",error="",done=false;
 const abort=()=>{child.kill();finish(new Error("Export cancelled or timed out."));};
 const finish=(failure?:Error)=>{if(done)return;done=true;signal.removeEventListener("abort",abort);if(failure)reject(failure);else resolve(output);};
 signal.addEventListener("abort",abort,{once:true});
 child.stdout.on("data",d=>{output=(output+d).slice(-64000);});child.stderr.on("data",d=>{error=(error+d).slice(-4000);});
 child.on("error",()=>finish(new Error("The export server needs FFmpeg and FFprobe installed.")));
 child.on("close",code=>finish(code===0?undefined:new Error("Could not process the original media. Check its codec or import another file.")));
 if(signal.aborted)abort();
 });
}
export function audioClipFilter(c:Clip,input:number,name:string){
 const tempo=c.speed<.5?[.5,c.speed/.5]:c.speed>2?[2,c.speed/2]:[c.speed];
 const chain=["atrim=start="+c.sourceStart+":end="+c.sourceEnd,"asetpts=PTS-STARTPTS",...tempo.map(n=>"atempo="+n),"atrim=duration="+c.duration,"volume="+c.volume];
 if(c.fadeIn)chain.push("afade=t=in:st=0:d="+Math.min(c.fadeIn,c.duration));
 if(c.fadeOut)chain.push("afade=t=out:st="+Math.max(0,c.duration-c.fadeOut)+":d="+Math.min(c.fadeOut,c.duration));
 chain.push("adelay="+Math.round(c.startTime*1000)+":all=1");return "["+input+":a:0]"+chain.join(",")+"["+name+"]";
}
/** Reuse the browser's complete visual composition; mix original audio on exact timeline timestamps. */
export async function finalizeEditorMp4(userId:string,raw:unknown,recording:Buffer,signal:AbortSignal,fps=30){
 const project=aiProjectSnapshot(raw),duration=projectDuration(project);
 assertVideoDuration(duration);
 if(!recording.length||recording.length>MAX_FILE)throw new Error("Use a smaller edit or lower quality; MP4 finishing supports up to 100 MB.");
 validateAssetBytes(recording,"video/mp4");
 const sourceAssets=(raw as EditorProject).assets,clips=Object.values(project.clips).filter(c=>c.assetId&&!project.tracks[c.trackId].hidden&&!project.tracks[c.trackId].muted&&c.volume>0&&project.assets[c.assetId!]?.kind!=="image");
 if(clips.length>32)throw new Error("Use up to 32 audible clips per export.");
 const dir=await mkdtemp(path.join(os.tmpdir(),"veelox-export-"));
 try{
  await writeFile(path.join(dir,"composition.mp4"),recording);
  const inputs:string[]=[],indices=new Map<string,{index:number;duration:number;audio:boolean}>();let total=0;
  for(const c of clips){signal.throwIfAborted();const id=sourceAssets[c.assetId!]?.libraryId;
   if(typeof id!=="string"||!/^[0-9a-f-]{36}$/i.test(id))throw new Error("Save all audible originals to your Asset Library before exporting MP4.");
   if(indices.has(id))continue;
   const row=await getStudioAsset(userId,id);if(!row||!["video","audio"].includes(row.kind)||row.size_bytes>MAX_FILE)throw new Error("An original is unavailable in your private library.");
   total+=Number(row.size_bytes);if(total>MAX_TOTAL)throw new Error("Audio originals exceed the 250 MB export budget.");
   const {data,error}=await getAdminClient().storage.from("studio-assets").download(row.storage_path);if(error||!data)throw new Error("An original could not be downloaded. Retry export.");
   const bytes=Buffer.from(await data.arrayBuffer());if(bytes.length!==Number(row.size_bytes))throw new Error("An original download is incomplete.");
   signal.throwIfAborted();const file=path.join(dir,"source-"+indices.size);await writeFile(file,bytes);
   const probe=JSON.parse(await run(process.env.FFPROBE_PATH||"ffprobe",["-v","error","-protocol_whitelist","file,pipe","-format_whitelist","mov,matroska,webm,wav,mp3,ogg","-show_entries","format=duration:stream=codec_type","-of","json",file],signal));
   const audio=probe.streams?.some((s:{codec_type:string})=>s.codec_type==="audio"),sourceDuration=Number(probe.format?.duration);
   if(!Number.isFinite(sourceDuration)||sourceDuration<=0||row.kind==="audio"&&!audio)throw new Error("An original audio stream cannot be decoded.");
   const index=inputs.length+1;inputs.push(file);indices.set(id,{index,duration:sourceDuration,audio});
  }
  const filters:string[]=[],mixes:string[]=[];
  for(const c of clips){const info=indices.get(sourceAssets[c.assetId!].libraryId!)!;
   if(c.sourceEnd>info.duration+.03||Math.abs(c.duration-(c.sourceEnd-c.sourceStart)/c.speed)>.04)throw new Error("A clip exceeds its original audio range. Trim it and retry.");
   if(!info.audio)continue;const name="mix"+mixes.length;filters.push(audioClipFilter(c,info.index,name));mixes.push("["+name+"]");
  }
  const probe=JSON.parse(await run(process.env.FFPROBE_PATH||"ffprobe",["-v","error","-protocol_whitelist","file,pipe","-format_whitelist","mov","-select_streams","v:0","-show_entries","stream=width,height","-of","json",path.join(dir,"composition.mp4")],signal));
  assertRenderResolution(probe.streams?.[0]);
  const args=["-hide_banner","-loglevel","error","-y","-protocol_whitelist","file,pipe","-f","mov","-i",path.join(dir,"composition.mp4")];
  for(const input of inputs)args.push("-protocol_whitelist","file,pipe","-format_whitelist","mov,matroska,webm,wav,mp3,ogg","-threads","2","-i",input);
  if(mixes.length){filters.push(mixes.join("")+"amix=inputs="+mixes.length+":normalize=0:duration=longest,apad,atrim=duration="+duration+"[audio]");args.push("-filter_complex",filters.join(";"),"-map","0:v:0","-map","[audio]","-c:a","aac","-b:a","192k");}
  else args.push("-map","0:v:0","-an");
  // Re-encode generic browser MP4 codecs when needed; visuals/captions remain baked into the composition.
  args.push("-vf","fps="+fps,"-c:v","libx264","-preset","veryfast","-crf","18","-pix_fmt","yuv420p","-threads","2","-t",String(duration),"-movflags","+faststart",path.join(dir,"finished.mp4"));
  await run(process.env.FFMPEG_PATH||"ffmpeg",args,signal);const output=await readFile(path.join(dir,"finished.mp4"));
  if(!output.length||output.length>MAX_FILE)throw new Error("The finished export exceeds 100 MB. Lower the quality or shorten the edit.");return output;
 }finally{await rm(dir,{recursive:true,force:true});}
}

