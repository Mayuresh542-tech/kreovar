import {NextRequest,NextResponse} from 'next/server';
import {getAuthenticatedUserId,getAdminClient} from '@/app/lib/server/adminAuth';
import {requireOwnedProject} from '@/app/lib/server/projectAccess';
import {usageStatus,reserveUsage,finishUsage,PlanLimitError,usageError} from '@/app/lib/server/planUsage';
import {withBoundedRequest} from '@/app/lib/server/boundedRequest';
export const dynamic='force-dynamic';
export const POST=withBoundedRequest(async(req:NextRequest)=>{try{
 const user=await getAuthenticatedUserId(req);if(!user)return NextResponse.json({error:'Sign in to export.'},{status:401});
 const body=await req.json().catch(()=>null);if(!body)return NextResponse.json({error:'Invalid export request.'},{status:400});
 if(body.action==='complete'||body.action==='refund'){if(typeof body.id!=='string'||!/^[0-9a-f-]{36}$/i.test(body.id))return NextResponse.json({error:'Invalid export reservation.'},{status:400});await finishUsage(user,body.id,body.action==='complete',true);return NextResponse.json({success:true});}
 if(body.action!=='reserve'||![720,1080].includes(body.resolution)||![24,30,60].includes(body.fps)||!Number.isFinite(body.duration)||body.duration<=0||body.duration>60)return NextResponse.json({error:'Use a valid export up to 60 seconds.'},{status:400});
 if(body.projectId){try{await requireOwnedProject(getAdminClient(),user,body.projectId);}catch{return NextResponse.json({error:'Project unavailable.'},{status:404});}}
 const status=await usageStatus(user);if(body.resolution>status.maxResolution)throw new PlanLimitError('Free includes 720p export. Upgrade to Pro for 1080p.');
 const lease=await reserveUsage(user,{exports:1});return NextResponse.json({id:lease.reservationId,maxResolution:status.maxResolution},{headers:{'Cache-Control':'private, no-store'}});
}catch(error){return usageError(error);}});
