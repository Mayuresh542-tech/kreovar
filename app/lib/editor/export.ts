import {withExportAllowance} from './exportAllowance';
import {assertVideoDuration} from './limits';
import {projectDuration,type EditorProject} from './model';
import type {MediaRepository} from './media';
export interface ExportOptions {resolution:720|1080;fps:24|30|60;quality:'standard'|'high';mime:string}
export interface ExportProgress {stage:string;progress:number}
export interface ExportBackend {render(project:EditorProject,options:ExportOptions,onProgress:(p:ExportProgress)=>void,signal:AbortSignal):Promise<Blob>}
export const serverMp4Enabled=process.env.NEXT_PUBLIC_SERVER_MP4_ENABLED!=='false';
export function exportFormats(){
 if(typeof VideoEncoder==='undefined'||typeof AudioEncoder==='undefined')return [];
 return [{label:'MP4 (H.264 + AAC)',mime:'video/mp4'},{label:'WebM (VP8 + Opus)',mime:'video/webm;codecs=vp8,opus'},{label:'WebM (VP9 + Opus)',mime:'video/webm;codecs=vp9,opus'}];
}
export class BrowserExportBackend implements ExportBackend{
 constructor(private repository:MediaRepository){}
 async render(project:EditorProject,options:ExportOptions,onProgress:(p:ExportProgress)=>void,signal:AbortSignal){
  assertVideoDuration(projectDuration(project));
  if(!['video/mp4','video/webm;codecs=vp8,opus','video/webm;codecs=vp9,opus'].includes(options.mime))throw new Error('Choose a supported export format.');
  return withExportAllowance({resolution:options.resolution,fps:options.fps,duration:projectDuration(project),projectId:project.id},signal,async()=> (await import('./offlineExport')).renderOffline(project,options,this.repository,onProgress,signal));
 }
}
