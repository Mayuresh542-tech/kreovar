import {readSpeechLanguage} from "./speechLanguages";
/** The original stays local for preview/export. Transcription sends compact speech audio only. */
export async function openCaptionVideo(file:File,signal:AbortSignal){
 signal.throwIfAborted();
 if(!file.size||file.size>100*1024*1024||!(/\.(mp4|mov|webm|m4v)$/i.test(file.name)))throw new Error("Choose an MP4, MOV or WebM video up to 100 MB.");
 const url=URL.createObjectURL(file),probe=document.createElement("video");probe.preload="metadata";
 try{
  const metadata=await new Promise<{duration:number;width:number;height:number}>((resolve,reject)=>{
   const cleanup=()=>{clearTimeout(timer);signal.removeEventListener("abort",abort);probe.onloadedmetadata=null;probe.onerror=null;};
   const fail=(error:Error)=>{cleanup();reject(error);};
   const abort=()=>fail(new DOMException("Video import cancelled.","AbortError"));
   const timer=setTimeout(()=>fail(new Error("Video metadata could not load. Try H.264 MP4.")),20000);
   probe.onloadedmetadata=()=>{cleanup();resolve({duration:probe.duration,width:probe.videoWidth,height:probe.videoHeight});};
   probe.onerror=()=>fail(new Error("This video cannot be played. Try H.264 MP4."));
   signal.addEventListener("abort",abort,{once:true});probe.src=url;
  });
  signal.throwIfAborted();
  if(!Number.isFinite(metadata.duration)||metadata.duration<=0||metadata.duration>60)throw new Error("Captions Studio supports videos up to 60 seconds.");
  if(!metadata.width||!metadata.height)throw new Error("This file has no playable video track.");
  return {url,...metadata};
 }catch(error){URL.revokeObjectURL(url);throw error;}
 finally{probe.removeAttribute("src");probe.load();}
}

export async function transcribeCaptionVideo(file:File,duration:number,signal:AbortSignal,onStage:(message:string)=>void,language="auto"){
 const languageHint=readSpeechLanguage(language);
 onStage("Preparing speech audio on your device…");
 const [{prepareSpeechFile},{assetHeaders,assetResponse}]=await Promise.all([import("../editor/transcriptionAudio"),import("../assets/client")]);
 signal.throwIfAborted();const speech=await prepareSpeechFile(file,duration,signal);
 if(!speech)throw new Error("Speech extraction requires updated Chrome or Edge. You can import an SRT file instead.");
 signal.throwIfAborted();onStage("Sending speech audio and generating captions…");
 const form=new FormData();form.append("file",speech.file);if(languageHint)form.append("language",languageHint);
 return assetResponse(await fetch("/api/transcribe",{method:"POST",headers:await assetHeaders(),body:form,signal:AbortSignal.any([signal,AbortSignal.timeout(90000)])}));
}
