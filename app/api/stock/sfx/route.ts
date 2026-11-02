import {NextRequest,NextResponse} from "next/server";
import {getAuthenticatedUserId} from "@/app/lib/server/adminAuth";
export async function GET(req:NextRequest){if(!await getAuthenticatedUserId(req))return NextResponse.json({error:"Sign in to access sound effects."},{status:401});return NextResponse.json({error:"Pixabay's public API currently documents image and video search only. Sound-effect search requires supported audio API access.",code:"PROVIDER_CAPABILITY_UNAVAILABLE"},{status:501});}

