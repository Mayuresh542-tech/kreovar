/** Parse only this project's old public URLs; no foreign hosts, encoded separators or traversal. */
export function legacyStoragePath(raw:string,configured=process.env.NEXT_PUBLIC_SUPABASE_URL){
 if(!configured)return null;let url:URL;try{url=new URL(raw);}catch{return null;}
 if(url.origin!==new URL(configured).origin)return null;
 if(/%(?:2f|5c|2e)/i.test(raw)||raw.includes("/../"))throw new Error("Invalid legacy media URL.");
 const match=url.pathname.match(/^\/storage\/v1\/object\/public\/(videos|images|voiceovers)\/(.+)$/);if(!match)return null;
 if(url.username||url.password||url.hash||url.search||/%(?:2f|5c|2e)/i.test(url.pathname))throw new Error("Invalid legacy media URL.");
 const path=decodeURIComponent(match[2]);if(path.split('/').some(p=>!p||p==='.'||p==='..')||path.includes('\\')||/[\x00-\x1f]/.test(path))throw new Error("Invalid legacy media path.");
 return {bucket:match[1],path};
}
export function legacyStorageEndpoint(raw:string){return legacyStoragePath(raw)?"/api/media/legacy?url="+encodeURIComponent(raw):raw;}
