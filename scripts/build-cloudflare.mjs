import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
const require=createRequire(import.meta.url);
/** Restore Next's generated types even when the alternate build fails. */
export function buildCloudflare(run=spawnSync){
 const settings={stdio:'inherit',env:{...process.env,NEXT_PUBLIC_SITE_URL:'https://kreovar.online'}};
 let buildStatus=1,restoreStatus=1;
 try{
  const result=run(process.execPath,[fileURLToPath(new URL('../node_modules/vite/bin/vite.js',import.meta.url)),'build'],settings);
  buildStatus=result.status??1;
 }finally{
  const result=run(process.execPath,[require.resolve('next/dist/bin/next'),'typegen'],settings);
  restoreStatus=result.status??1;
 }
 return buildStatus||restoreStatus;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)process.exitCode=buildCloudflare();
