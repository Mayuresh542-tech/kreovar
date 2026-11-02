import {getAsset,projectAssetItem} from './client';
import {addAssetToProject} from '../services/projectService';
import type {AssetRole,StudioAsset,StudioAssetKind} from './types';
export type ProjectImportRole=Exclude<AssetRole,'backgrounds'>;
export const projectImportKinds:Record<ProjectImportRole,StudioAssetKind>={raw_footage:'video',broll_assets:'video',voiceovers:'audio',sfx_assets:'audio',thumbnails:'image',captions:'caption'};
/** Link the canonical owned asset, preserving its ID and original bytes. No duplicate upload. */
export async function importProjectAsset(projectId:string,role:ProjectImportRole,selection:Pick<StudioAsset,'id'>){
 const asset=await getAsset(selection.id);
 if(asset.kind!==projectImportKinds[role])throw Error('Choose an asset that matches this project section.');
 if(role==='captions'&&(!Array.isArray(asset.metadata.segments)||!asset.metadata.segments.length))throw Error('This caption file has no valid timed captions. Choose another SRT or VTT file.');
 const saved=await addAssetToProject(projectId,role,projectAssetItem(asset));
 if(!saved)throw Error('The asset could not be added to this project. Please retry.');
 return saved;
}
