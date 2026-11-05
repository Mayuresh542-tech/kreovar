import {env} from 'cloudflare:workers';
export async function readBundledAsset(name:string):Promise<Buffer>{
 if(!/^(branding|sfx)\/[a-zA-Z0-9_.-]+$/.test(name))throw Error('Invalid bundled asset.');
 const response=await env.ASSETS.fetch(new Request('https://bundled.invalid/'+name));
 if(!response.ok)throw Error('Bundled asset unavailable.');
 return Buffer.from(await response.arrayBuffer());
}
