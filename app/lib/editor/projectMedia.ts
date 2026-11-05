import type {EditorProject} from './model';
import {removeClip} from './operations';
/** Remove only this project's reference, never the private cloud original or cache. */
export function removeProjectMedia(project:EditorProject,assetId:string,removeTimelineClips=false):EditorProject{
 if(!project.assets[assetId])throw Error('This media is no longer in the project.');
 const clips=Object.values(project.clips).filter(c=>c.assetId===assetId);
 if(clips.length&&!removeTimelineClips)throw Error('This file is used on the timeline. Confirm removal of its clips first.');
 if(clips.some(c=>project.tracks[c.trackId].locked))throw Error('Unlock the tracks using this file before removing it.');
 const next=clips.reduce((p,c)=>removeClip(p,c.id),project),assets={...next.assets};delete assets[assetId];return {...next,assets,removedProjectAssetIds:[...new Set([...(project.removedProjectAssetIds||[]),assetId,...(project.assets[assetId].libraryId?[project.assets[assetId].libraryId!]:[])])]};
}
