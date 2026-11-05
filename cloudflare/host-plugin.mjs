/** Build-time host boundary: native-only routes are never bundled into Workers.
 * The existing Next.js build and local native routes are not changed. */
export function workerRouteCode(id){
 const filename=id.replaceAll('\\','/').split('?')[0];
 if(['/app/api/render/route.ts','/app/api/editor/export-mp4/route.ts'].some(p=>filename.endsWith(p)))return `
import {NextResponse} from 'next/server';
import {getAuthenticatedUserId} from '@/app/lib/server/adminAuth';
export const dynamic='force-dynamic';
export async function POST(req){
 const user=await getAuthenticatedUserId(req);
 if(!user)return NextResponse.json({error:'Sign in to export videos.'},{status:401});
 return NextResponse.json({error:'Server rendering is unavailable on this host. Export MP4 or WebM from the browser editor.',code:'SERVER_RENDER_UNAVAILABLE'},{status:503,headers:{'Cache-Control':'private, no-store'}});
}`;
 if(filename.endsWith('/app/api/reference-presets/[[...path]]/route.ts'))return `
import {NextResponse} from 'next/server';
function unavailable(){return NextResponse.json({error:'Reference presets are not enabled.'},{status:404,headers:{'Cache-Control':'private, no-store'}});}
export const GET=unavailable,POST=unavailable,PATCH=unavailable,DELETE=unavailable;
`;
 if(filename.endsWith('/app/opengraph-image.tsx'))return `
import {env} from 'cloudflare:workers';
export const alt='Kreovar — AI content creation and video editing studio';
export const size={width:1200,height:630};export const contentType='image/png';
export default async function Image(){return env.ASSETS.fetch(new Request('https://bundled.invalid/branding/kreovar-opengraph.png'));}
`;
 return null;
}
export default function workerHostPlugin(){return {name:'kreovar-worker-host',enforce:'pre',transform(_code,id){const code=workerRouteCode(id);return code===null?null:{code,map:null};}};}

