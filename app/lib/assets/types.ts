export type StudioAssetKind="video"|"audio"|"image"|"caption"|"document";
export interface StudioAsset {id:string;kind:StudioAssetKind;name:string;mime:string;size:number;url:string;source:string;duration:number;width:number;height:number;created_at:string;metadata:Record<string,unknown>}
export type AssetRole="raw_footage"|"broll_assets"|"voiceovers"|"thumbnails"|"backgrounds"|"sfx_assets"|"captions";
