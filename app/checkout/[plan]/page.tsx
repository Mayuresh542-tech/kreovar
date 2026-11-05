"use client";
import { Suspense } from "react";
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
  return <StudioShell active="billing"><div className="max-w-3xl mx-auto w-full py-8 space-y-6">
    <Link href="/pricing" className="text-sm text-slate-500">← Pricing</Link>
    <h1 className="text-3xl font-bold">Review your subscription</h1>
    {!plan || plan.id==="free"?<p>Select a paid plan from Pricing.</p>:<div className="p-6 sm:p-8 rounded-3xl bg-white border border-slate-200 space-y-6">
      <div className="flex gap-2" role="group" aria-label="Billing cycle">{(["monthly","yearly"] as const).map(c=><button key={c} type="button" aria-pressed={cycle===c} onClick={()=>router.replace("/checkout/"+plan.id+"?cycle="+c)} className={"px-4 py-2 rounded-xl border capitalize "+(cycle===c?"bg-slate-900 text-white":"bg-white")}>{c}</button>)}</div>
      <div><h2 className="text-xl font-bold">Kreovar Pro</h2><p className="text-3xl font-bold mt-2">{cycle==="yearly"?plan.yearlyDisplayPrice:plan.displayPrice}<span className="text-sm font-normal"> /{cycle==="yearly"?"year":"month"}</span></p></div>
      <ul className="space-y-2 text-sm text-slate-600">{plan.features.map(feature=><li key={feature}>{feature}</li>)}</ul><p className="text-sm text-slate-500">Monthly and yearly Pro include the same monthly allowances. No rollover. Image and video generation are not included.</p>
      <p className="text-sm">Account: {session?.user.email||"Sign in to continue"}</p>
      <aside className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-950" aria-label="Checkout email requirement">
        <p className="font-semibold">Pro goes to your checkout email</p>
        <p className="mt-1">Enter the email of your existing, verified Kreovar account on Whop checkout. Pro will be assigned only to that email after payment is verified. If you do not have an account with that email, create one and verify it before paying.</p>
      </aside>
      <p className="text-xs leading-6 text-slate-500">This subscription renews automatically every {cycle==='yearly'?'year':'month'} until cancelled. Cancel through your Whop account before renewal. Your first payment has a 3-day (72-hour) refund request window; renewals are normally non-refundable, subject to billing/service issues and mandatory rights. By continuing to payment you agree to our <Link href="/terms" className="underline">Terms</Link> and acknowledge our <Link href="/privacy" className="underline">Privacy Policy</Link> and <Link href="/refund" className="underline">Refund &amp; Return Policy</Link>.</p>
      {status==="unauthed"?<Link href="/login" className="block rounded-xl bg-slate-900 text-white text-center py-3">Sign in to continue</Link>:status==="authed"?<a href={getWhopCheckoutUrl(cycle)} className="block w-full rounded-xl bg-slate-900 text-white text-center py-3">Continue to Payment</a>:<button type="button" disabled className="w-full rounded-xl bg-slate-900 text-white py-3 disabled:opacity-50">Checking account…</button>}
      <a href={getWhopCheckoutUrl(cycle)} target="_blank" rel="noopener noreferrer" className="text-xs text-slate-500 underline">View this plan on Whop</a>
    </div>}
  </div></StudioShell>;
}
export default function CheckoutPlanPage(){return <Suspense fallback={<p>Loading checkout…</p>}><CheckoutContent/></Suspense>;}
