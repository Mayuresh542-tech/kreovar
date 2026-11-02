"use client";
import { useEffect,useState } from "react";
import Link from "next/link";
import { useAuthGate } from "@/app/lib/useAuthGate";
import StudioShell from "@/app/components/StudioShell";
export default function CheckoutReturnPage(){
  const {status,session}=useAuthGate();
  const [state,setState]=useState<"checking"|"verified"|"pending"|"error">("checking");
  const [attempt,setAttempt]=useState(0);
  useEffect(()=>{
    if(status!=="authed"||!session)return;
    let stopped=false,timer:ReturnType<typeof setTimeout>|undefined,count=0;
    const controller=new AbortController();
    const check=async()=>{try{
      const r=await fetch("/api/billing",{headers:{Authorization:"Bearer "+session.access_token},cache:"no-store",signal:controller.signal});
      if(!r.ok)throw new Error("Verification unavailable");
      const data=await r.json();if(stopped)return;
      const s=data.subscription;
      if(s?.source==="whop" && s.status==="active" && ["pro","creator","studio"].includes(s.plan) && s.renewalDate && Date.parse(s.renewalDate)>Date.now()){setState("verified");return;}
      if(++count>=12){setState("pending");return;}timer=setTimeout(()=>void check(),2500);
    }catch{if(!stopped)setState("error");}};
    void check();return()=>{stopped=true;controller.abort();if(timer)clearTimeout(timer);};
  },[status,session,attempt]);
  return <StudioShell active="billing"><div className="max-w-xl mx-auto py-12 space-y-5 text-center">
    <h1 className="text-2xl font-bold">{status==="unauthed"?"Sign in to check your purchase":state==="verified"?"Your Pro subscription is active":state==="checking"?"Checking your subscription…":state==="pending"?"Payment verification is pending":"Could not check your subscription"}</h1>
    <p className="text-sm text-slate-500">{state==="verified"?"Your payment has been verified. Open your projects to continue.":"Pro belongs to the email used at payment checkout. Sign in or create and confirm a Kreovar account with that email to access your purchase."}</p>
    {status==="unauthed"?<Link href="/login" className="inline-block px-5 py-3 rounded-xl bg-slate-900 text-white">Sign in</Link>:state==="verified"?<Link href="/projects" className="inline-block px-5 py-3 rounded-xl bg-slate-900 text-white">Open projects</Link>:state!=="checking"?<button onClick={()=>{setState("checking");setAttempt(n=>n+1);}} className="px-5 py-3 rounded-xl bg-slate-900 text-white">Check again</button>:null}
    <Link href="/settings/billing" className="block text-sm underline">View billing</Link>
  </div></StudioShell>;
}
