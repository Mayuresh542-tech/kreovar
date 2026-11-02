"use client";
import { Suspense, useState } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuthGate } from "@/app/lib/useAuthGate";
import { getPlan, getWhopCheckoutUrl, type BillingCycle } from "@/app/config/plans";
import StudioShell from "@/app/components/StudioShell";
function CheckoutContent() {
  const params=useParams(),search=useSearchParams(),router=useRouter();
  const {status,session}=useAuthGate();
  const plan=getPlan(typeof params.plan==="string"?params.plan:"pro");
  const cycle:BillingCycle=search.get("cycle")==="yearly"?"yearly":"monthly";
  const [loading,setLoading]=useState(false),[error,setError]=useState<string|null>(null);
  async function checkout() {
    if(!session || !plan || loading) return;
    setLoading(true);setError(null);
    try {
      const r=await fetch("/api/checkout/direct",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+session.access_token},body:JSON.stringify({planId:plan.id,billingCycle:cycle})});
      const data=await r.json();if(!r.ok)throw new Error(data.error||"Checkout unavailable.");
      const url=new URL(data.checkoutUrl);if(url.protocol!=="https:" || url.hostname!=="whop.com")throw new Error("Invalid payment link.");
      window.location.assign(url.toString());
    }catch(e){setError(e instanceof Error?e.message:"Checkout unavailable.");setLoading(false);}
  }
  return <StudioShell active="billing"><div className="max-w-3xl mx-auto w-full py-8 space-y-6">
    <Link href="/pricing" className="text-sm text-slate-500">← Pricing</Link>
    <h1 className="text-3xl font-bold">Review your subscription</h1>
    {!plan || plan.id==="free"?<p>Select a paid plan from Pricing.</p>:<div className="p-6 sm:p-8 rounded-3xl bg-white border border-slate-200 space-y-6">
      <div className="flex gap-2" role="group" aria-label="Billing cycle">{(["monthly","yearly"] as const).map(c=><button key={c} type="button" aria-pressed={cycle===c} disabled={loading} onClick={()=>router.replace("/checkout/"+plan.id+"?cycle="+c)} className={"px-4 py-2 rounded-xl border capitalize "+(cycle===c?"bg-slate-900 text-white":"bg-white")}>{c}</button>)}</div>
      <div><h2 className="text-xl font-bold">Kreovar Pro</h2><p className="text-3xl font-bold mt-2">{cycle==="yearly"?plan.yearlyDisplayPrice:plan.displayPrice}<span className="text-sm font-normal"> /{cycle==="yearly"?"year":"month"}</span></p></div>
      <ul className="space-y-2 text-sm text-slate-600">{plan.features.map(feature=><li key={feature}>{feature}</li>)}</ul><p className="text-sm text-slate-500">Monthly and yearly Pro include the same monthly allowances. No rollover. Image and video generation are not included.</p>
      <p className="text-sm">Account: {session?.user.email||"Sign in to continue"}</p>
      <p className="text-xs text-slate-500">Pro is linked to the email you enter on the payment page. Use that email to sign in to Kreovar.</p>
      <p className="text-xs leading-6 text-slate-500">This subscription renews automatically every {cycle==='yearly'?'year':'month'} until cancelled. Cancel through your Whop account before renewal. Your first payment has a 3-day (72-hour) refund request window; renewals are normally non-refundable, subject to billing/service issues and mandatory rights. By continuing to payment you agree to our <Link href="/terms" className="underline">Terms</Link> and acknowledge our <Link href="/privacy" className="underline">Privacy Policy</Link> and <Link href="/refund" className="underline">Refund &amp; Return Policy</Link>.</p>
      {error&&<p role="alert" className="text-sm text-red-600">{error}</p>}
      {status==="unauthed"?<Link href="/login" className="block rounded-xl bg-slate-900 text-white text-center py-3">Sign in to continue</Link>:<button type="button" onClick={()=>void checkout()} disabled={loading||status!=="authed"} className="w-full rounded-xl bg-slate-900 text-white py-3 disabled:opacity-50">{loading?"Opening secure checkout…":status==="loading"?"Checking account…":"Continue to Payment"}</button>}
      <a href={getWhopCheckoutUrl(cycle)} target="_blank" rel="noopener noreferrer" className="text-xs text-slate-500 underline">View this plan on Whop</a>
    </div>}
  </div></StudioShell>;
}
export default function CheckoutPlanPage(){return <Suspense fallback={<p>Loading checkout…</p>}><CheckoutContent/></Suspense>;}
