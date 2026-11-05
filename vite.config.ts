import {defineConfig} from 'vite';
import vinext from 'vinext';
import {cloudflare} from '@cloudflare/vite-plugin';
import {fileURLToPath} from 'node:url';
import workerHostPlugin from './cloudflare/host-plugin.mjs';
const file=(name:string)=>fileURLToPath(new URL(name,import.meta.url));
export default defineConfig({
 resolve:{alias:[
  {find:/^(?:.*\/)?editorFallbackImages(?:\.ts)?$/,replacement:file('./app/lib/server/editorIndividualImages.ts')},
  {find:/^(?:.*\/)?bundledAssets(?:\.ts)?$/,replacement:file('./cloudflare/bundledAssets.ts')},
  {find:/^(?:.*\/)?localTranscription(?:\.ts)?$/,replacement:file('./cloudflare/localTranscription.ts')},
 ]},
 define:{'process.env.NEXT_PUBLIC_SERVER_MP4_ENABLED':'"false"','process.env.NEXT_PUBLIC_REFERENCE_PRESETS_ENABLED':'"false"'},
 plugins:[workerHostPlugin(),vinext(),cloudflare({viteEnvironment:{name:'rsc',childEnvironments:['ssr']}})],
});
