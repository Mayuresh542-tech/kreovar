import { getPlan, getWhopCheckoutUrl, type BillingCycle } from "../../config/plans";
import { whopClient, whopPlanId, whopReturnUrl } from "./whopCheckout";
export interface DirectCheckoutParams {userId:string;email:string;planId:string;billingCycle:BillingCycle;referralCode?:string;}
export async function createDirectCheckout(params:DirectCheckoutParams) {
  const plan=getPlan(params.planId);
  if(!plan || plan.id==="free") throw new Error("Select a paid plan.");
  const cycle=params.billingCycle;
  const providerPlan=whopPlanId(cycle);
  const result=await whopClient().checkoutConfigurations.create({
    account_id:process.env.WHOP_ACCOUNT_ID,plan_id:providerPlan,
    redirect_url:whopReturnUrl(),
    metadata:{kreovar_billing_cycle:cycle},
  });
  if(!result.purchase_url) throw new Error("Whop did not return a checkout link. Please retry.");
  const url=new URL(result.purchase_url);
  if(url.protocol!=="https:" || url.hostname!=="whop.com") throw new Error("Whop returned an invalid checkout link.");
  return {status:"ready_for_payment",checkoutUrl:url.toString(),productUrl:getWhopCheckoutUrl(cycle),paymentGatewayReady:true,
    orderSummary:{planName:plan.name,subtotal:cycle==="yearly"?plan.yearlyPrice:plan.price,currency:plan.currency,billingPeriod:cycle,customerEmail:params.email},
    message:"Complete your payment on Whop. Premium activates after server verification."};
}
