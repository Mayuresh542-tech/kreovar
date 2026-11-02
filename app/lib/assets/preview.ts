import {assetHeaders,assetResponse} from './client';
/** Authorize just the small URL response; video bytes and range requests go directly to Storage. */
export async function resolveAssetPreview(value:string,signal:AbortSignal,origin=window.location.origin):Promise<string>{
 signal.throwIfAborted();if(!value.trim())throw Error("This media source is missing. Reimport the original file.");const url=new URL(value,origin);
 if(!['https:','http:'].includes(url.protocol)||url.username||url.password)throw Error('This media source is unavailable. Reimport the original file.');
 const privateFile=url.origin===origin&&/^\/api\/assets\/[0-9a-f-]{36}\/file$/.test(url.pathname);
 if(!privateFile)return url.href;
 url.searchParams.delete('download');url.searchParams.set('preview','1');
 const headers=await assetHeaders();signal.throwIfAborted();
 const result=await assetResponse(await fetch(url.pathname+url.search,{headers,signal,cache:'no-store'}));signal.throwIfAborted();
 if(typeof result.url!=='string')throw Error('The preview could not be opened. Please retry.');
 const signed=new URL(result.url);if(signed.protocol!=='https:'||signed.username||signed.password)throw Error('The preview source is invalid. Please retry.');
 return signed.href;
}
