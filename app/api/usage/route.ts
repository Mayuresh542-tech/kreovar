import {NextRequest,NextResponse} from 'next/server';
import {getAuthenticatedUserId} from '@/app/lib/server/adminAuth';
import {usageStatus,usageError} from '@/app/lib/server/planUsage';
export const dynamic='force-dynamic';
export async function GET(req:NextRequest){try{const user=await getAuthenticatedUserId(req);if(!user)return NextResponse.json({error:'Sign in to view your allowances.'},{status:401});return NextResponse.json(await usageStatus(user),{headers:{'Cache-Control':'private, no-store'}});}catch(error){return usageError(error);}}
