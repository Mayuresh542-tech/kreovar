import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/app/lib/server/adminAuth";
import { withSafeResponse } from "@/app/lib/server/safeResponse";
import { withBoundedRequest } from "@/app/lib/server/boundedRequest";
import { createDirectCheckout } from "@/app/lib/server/checkoutService";
export const dynamic="force-dynamic";
async function postHandler(req:NextRequest) {
  const user=await getAuthenticatedUser(req);
  if(!user) return NextResponse.json({error:"Please sign in before checkout."},{status:401});
  if(!user.email_confirmed_at || !user.email) return NextResponse.json({error:"Confirm your email before checkout."},{status:403});
  const body=await req.json().catch(()=>null);
  if(!body || typeof body.planId!=="string" || !["monthly","yearly"].includes(body.billingCycle)) return NextResponse.json({error:"Select a valid plan and billing cycle."},{status:400});
  try {return NextResponse.json(await createDirectCheckout({userId:user.id,email:user.email,planId:body.planId,billingCycle:body.billingCycle}));}
  catch {return NextResponse.json({error:"Checkout is temporarily unavailable. Please retry or contact support."},{status:503});}
}
export const POST=withSafeResponse(withBoundedRequest(postHandler));
