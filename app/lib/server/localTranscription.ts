import {readSpeechLanguage} from "../captions/speechLanguages";
import {spawn} from 'node:child_process';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
export interface LocalTranscript {text:string;words:{text:string;start:number;end:number;type:'word'}[];language_code:string;audio_duration_secs:number}
let busy=false;
export async function transcribeLocally(bytes:Buffer,signal:AbortSignal,language?:string):Promise<LocalTranscript>{
 const languageHint=readSpeechLanguage(language);
 signal.throwIfAborted();if(busy)throw new Error('LOCAL_TRANSCRIPTION_BUSY');
 if(!bytes.length||bytes.length>100*1024*1024)throw new Error('Invalid local speech input.');
 busy=true;let folder:string|undefined;
 try{
  folder=await mkdtemp(path.join(tmpdir(),'kreovar-speech-'));const file=path.join(folder,'source.media');await writeFile(file,bytes);signal.throwIfAborted();
  const output=await new Promise<string>((resolve,reject)=>{
   const child=spawn(process.env.LOCAL_TRANSCRIPTION_PYTHON||'python',[path.join(process.cwd(),'scripts','transcribe-local.py'),file,...(languageHint?[languageHint]:[])],{windowsHide:true,shell:false,env:{...process.env,HF_HUB_OFFLINE:'1',TRANSFORMERS_OFFLINE:'1'}});let text='',settled=false;
   const finish=(error?:Error)=>{if(settled)return;settled=true;signal.removeEventListener('abort',cancel);if(error)reject(error);else resolve(text);};
   const cancel=()=>{child.kill();finish(signal.reason instanceof Error?signal.reason:new DOMException('Transcription cancelled','AbortError'));};
   signal.addEventListener('abort',cancel,{once:true});
   child.stdout.on('data',chunk=>{text+=chunk;if(text.length>2*1024*1024){child.kill();finish(new Error('Local transcript exceeds the supported size.'));}});
   child.stderr.resume();child.on('error',()=>finish(new Error('LOCAL_TRANSCRIPTION_UNAVAILABLE')));child.on('close',code=>finish(code===0?undefined:new Error('LOCAL_TRANSCRIPTION_UNAVAILABLE')));if(signal.aborted)cancel();
  });
  signal.throwIfAborted();const value=JSON.parse(output) as LocalTranscript;
  if(!value||!Array.isArray(value.words)||typeof value.text!=='string'||!Number.isFinite(value.audio_duration_secs)||value.words.some(w=>typeof w.text!=='string'||!Number.isFinite(w.start)||!Number.isFinite(w.end)||w.start<0||w.end<w.start))throw new Error('Invalid local transcript.');
  return value;
 }finally{
  if(folder){const checked=path.resolve(folder);if(path.dirname(checked)===path.resolve(tmpdir())&&path.basename(checked).startsWith('kreovar-speech-'))await rm(checked,{recursive:true,force:true}).catch(()=>{});}
  busy=false;
 }
}
