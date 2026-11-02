import {NextRequest,NextResponse} from 'next/server';
import {withSafeResponse} from '@/app/lib/server/safeResponse';
import {withBoundedRequest} from '@/app/lib/server/boundedRequest';
import {verifyDodoWebhook} from '@/app/lib/server/dodoWebhook';
import {dodoSandboxService} from '@/app/lib/server/dodoSandbox';
export const dynamic='force-dynamic';export const runtime='nodejs';export const maxDuration=30;
async function post(req:NextRequest){
 const raw=await req.text(),headers=Object.fromEntries(req.headers.entries());
 if(!verifyDodoWebhook(raw,headers))return NextResponse.json({error:'Invalid webhook signature.'},{status:401});
 let event:Record<string,unknown>;try{event=JSON.parse(raw);if(!event||typeof event!=='object'||Array.isArray(event)||typeof event.type!=='string')throw Error();}catch{return NextResponse.json({error:'Invalid webhook payload.'},{status:400});}
 try{return NextResponse.json(await dodoSandboxService().webhook(event,headers['webhook-id'],req.signal));}
 catch{return NextResponse.json({error:'Test webhook processing failed. Retry delivery.'},{status:503});}
}
export const POST=withSafeResponse(withBoundedRequest(post));
