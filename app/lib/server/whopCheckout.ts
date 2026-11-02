import { WhopClient } from "@whop/sdk";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { BillingCycle } from "../../config/plans";

export function whopClient() {
  if (!process.env.WHOP_API_KEY) throw new Error("Whop payment configuration is unavailable.");
  return new WhopClient({token:process.env.WHOP_API_KEY, timeoutInSeconds:15, maxRetries:0});
}
export function whopPlanId(cycle: BillingCycle) {
  const id=cycle === "yearly" ? process.env.WHOP_YEARLY_PLAN_ID : process.env.WHOP_MONTHLY_PLAN_ID;
  if (!id?.startsWith("plan_")) throw new Error("Whop plan configuration is unavailable.");
  return id;
}
export function whopCycle(id: string): BillingCycle | null {
  if(id && id === process.env.WHOP_MONTHLY_PLAN_ID) return "monthly";
  if(id && id === process.env.WHOP_YEARLY_PLAN_ID) return "yearly";
  return null;
}
export function checkoutIdentity(userId: string, planId: string) {
  if(!process.env.WHOP_WEBHOOK_SECRET) throw new Error("Whop verification configuration is unavailable.");
  return createHmac("sha256",process.env.WHOP_WEBHOOK_SECRET).update(userId+":"+planId).digest("hex");
}
export function verifiedCheckoutUser(metadata: Record<string, unknown>, planId: string): string | null {
  const id=metadata.kreovar_user_id, signature=metadata.kreovar_identity;
  if(typeof id!=="string" || !/^[0-9a-f-]{36}$/i.test(id) || typeof signature!=="string" || !/^[0-9a-f]{64}$/.test(signature)) return null;
  const expected=checkoutIdentity(id,planId);
  return timingSafeEqual(Buffer.from(expected),Buffer.from(signature)) ? id : null;
}
export function whopReturnUrl() {
  if(!process.env.WHOP_RETURN_URL) throw new Error("Checkout return URL is not configured.");
  const url=new URL(process.env.WHOP_RETURN_URL);
  if(url.protocol!=="https:" || url.username || url.password) throw new Error("Invalid checkout return URL configuration.");
  return url.toString();
}
