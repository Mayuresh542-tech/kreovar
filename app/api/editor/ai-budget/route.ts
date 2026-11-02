import {NextRequest,NextResponse} from 'next/server';
import {getAdminClient} from '@/app/lib/server/adminAuth';
import {requireOwnedProject} from '@/app/lib/server/projectAccess';
import {readEditingBudget,editorTokenStatus} from '@/app/lib/server/editorTokenBudget';
export const dynamic='force-dynamic';
export async function GET(req:NextRequest){
 const token=req.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
 if(!token)return NextResponse.json({error:'Sign in to view edit usage.'},{status:401});
 const {data,error}=await getAdminClient().auth.getUser(token);if(error||!data.user)return NextResponse.json({error:'Sign in again.'},{status:401});
 try{
  const projectId=req.nextUrl.searchParams.get('projectId')||'',budget=readEditingBudget(req.nextUrl.searchParams.get('jobId'),projectId);
  if(!budget)throw Error('Invalid job.');await requireOwnedProject(getAdminClient(),data.user.id,projectId);
  return NextResponse.json(await editorTokenStatus(data.user.id,budget),{headers:{'Cache-Control':'no-store'}});
 }catch{return NextResponse.json({error:'Edit usage is unavailable.'},{status:404});}
}
