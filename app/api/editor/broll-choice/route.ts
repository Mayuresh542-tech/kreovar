import {readEditingBudget,EditTokenBudgetError} from '@/app/lib/server/editorTokenBudget';
import {NextRequest,NextResponse} from 'next/server';
import {getAdminClient} from '@/app/lib/server/adminAuth';
import {requireOwnedProject} from '@/app/lib/server/projectAccess';
import {withSafeResponse} from '@/app/lib/server/safeResponse';
import {withBoundedRequest} from '@/app/lib/server/boundedRequest';
import {withUsage} from '@/app/lib/server/planUsage';
import {chooseEditorialBroll} from '@/app/lib/server/editorBroll';
import {StockSearchError} from '@/app/lib/server/stockSearch';
import {RadoxEditorError} from '@/app/lib/server/radoxService';
import {GroqEditorError} from '@/app/lib/server/editorProvider';
export const dynamic='force-dynamic';export const maxDuration=90;
async function postHandler(req:NextRequest){
 const token=req.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];if(!token)return NextResponse.json({error:'Sign in to select supporting footage.'},{status:401});
 const db=getAdminClient(),{data,error}=await db.auth.getUser(token);if(error||!data.user)return NextResponse.json({error:'Your session expired. Sign in again.'},{status:401});
 let body:Record<string,unknown>;try{body=await req.json();if(typeof body.projectId!=='string'||typeof body.query!=='string'||!body.query.trim()||body.query.length>100||typeof body.speech!=='string'||body.speech.length>3000||typeof body.duration!=='number'||!Number.isFinite(body.duration)||body.duration<.5||body.duration>6||!['portrait','landscape'].includes(String(body.orientation))||!Array.isArray(body.exclude)||body.exclude.length>300||body.exclude.some(v=>typeof v!=='string'||v.length>100))throw Error();}catch{return NextResponse.json({error:'Invalid supporting-footage request.'},{status:400});}
 try{readEditingBudget(body.editingJobId,String(body.projectId));await requireOwnedProject(db,data.user.id,body.projectId);}catch{return NextResponse.json({error:'This project is unavailable.'},{status:404});}
 try{const result=await chooseEditorialBroll({query:String(body.query),speech:String(body.speech),duration:Number(body.duration),orientation:body.orientation as 'portrait'|'landscape',exclude:body.exclude as string[],editingBudget:readEditingBudget(body.editingJobId,String(body.projectId))},data.user.id,AbortSignal.any([req.signal,AbortSignal.timeout(80000)]));return NextResponse.json(result,{headers:{'Cache-Control':'no-store'}});}catch(error){if(error instanceof EditTokenBudgetError)return NextResponse.json({error:error.message,code:error.code},{status:error.status});if(error instanceof RadoxEditorError||error instanceof GroqEditorError)return NextResponse.json({error:error.message,code:error.code},{status:error.status});if(error instanceof StockSearchError)return NextResponse.json({error:error.message},{status:503});if(error instanceof Error&&['AbortError','TimeoutError'].includes(error.name))return NextResponse.json({error:'B-roll selection timed out. Prepared work is retained.'},{status:504});return NextResponse.json({error:'Could not choose relevant footage. Please retry.'},{status:502});}
}
export const POST=withSafeResponse(withBoundedRequest(withUsage(postHandler,'ai')));
