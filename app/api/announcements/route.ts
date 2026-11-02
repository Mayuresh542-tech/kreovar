
import {NextRequest,NextResponse} from 'next/server';
import {getAuthenticatedUserId,getAdminClient} from '@/app/lib/server/adminAuth';
import {withSafeResponse} from '@/app/lib/server/safeResponse';
export const dynamic='force-dynamic';
export const GET=withSafeResponse(async(req:NextRequest)=>{
 if(!await getAuthenticatedUserId(req))return NextResponse.json({error:'Sign in to view announcements.'},{status:401});
 const {data,error}=await getAdminClient().from('admin_announcements').select('id,title,body,updated_at').eq('published',true).or('expires_at.is.null,expires_at.gt.'+new Date().toISOString()).order('created_at',{ascending:false}).limit(5);
 if(error)throw error;
 return NextResponse.json({announcements:data},{headers:{'Cache-Control':'private, no-store'}});
});
