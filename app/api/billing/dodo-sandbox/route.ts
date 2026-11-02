import {NextRequest,NextResponse} from 'next/server';
import {getAuthenticatedUser} from '@/app/lib/server/adminAuth';
import {withSafeResponse} from '@/app/lib/server/safeResponse';
import {withBoundedRequest} from '@/app/lib/server/boundedRequest';
import {dodoSandboxService} from '@/app/lib/server/dodoSandbox';
import {dodoProduct,getDodoConfig} from '@/app/lib/server/dodoConfig';
export const dynamic='force-dynamic';export const runtime='nodejs';export const maxDuration=30;
async function authorized(req:NextRequest){const user=await getAuthenticatedUser(req);return user?.email&&user.email_confirmed_at?user:null;}
async function get(req:NextRequest){
 const user=await authorized(req);if(!user)return NextResponse.json({error:'Sign in with a confirmed account.'},{status:401});
 try{getDodoConfig();const id=req.nextUrl.searchParams.get('checkout');if(id)return NextResponse.json({checkout:await dodoSandboxService().reconcile(id,user.id,req.signal)});
  let productsReady=false;try{productsReady=!!dodoProduct('monthly')&&!!dodoProduct('yearly');}catch{}
  return NextResponse.json({environment:'test_mode',productsReady,webhookConfigured:!!process.env.DODO_PAYMENTS_WEBHOOK_KEY,realAccessGranted:false});
 }catch{return NextResponse.json({error:'Dodo test checkout could not be verified. Check setup or retry.'},{status:503});}
}
async function post(req:NextRequest){
 const user=await authorized(req);if(!user)return NextResponse.json({error:'Sign in with a confirmed account.'},{status:401});
 const body=await req.json().catch(()=>null);if(!body||!['monthly','yearly'].includes(body.cycle))return NextResponse.json({error:'Choose monthly or yearly.'},{status:400});
 try{return NextResponse.json(await dodoSandboxService().create(user.id,user.email!,body.cycle,req.signal));}
 catch{return NextResponse.json({error:'Dodo test checkout is unavailable. Check the test products and server configuration.'},{status:503});}
}
export const GET=withSafeResponse(get);export const POST=withSafeResponse(withBoundedRequest(post));
