import {readFile} from 'node:fs/promises';
import path from 'node:path';
export async function readBundledAsset(name:string):Promise<Buffer>{
 if(!/^(branding|sfx)\/[a-zA-Z0-9_.-]+$/.test(name))throw Error('Invalid bundled asset.');
 return readFile(path.join(process.cwd(),'public',name));
}
