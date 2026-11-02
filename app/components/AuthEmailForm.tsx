"use client";
import {useEffect,useState} from "react";
import Link from "next/link";
import {LoaderCircle,Mail} from "lucide-react";
import AuthShell,{authInputClass,authLabelClass,authSubmitClass} from "./AuthShell";
import {sendAccountEmail,type EmailFlow} from "../lib/auth/emailAuth";
export default function AuthEmailForm({flow}:{flow:EmailFlow}){
 const recovery=flow==="recovery",[email,setEmail]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState(""),[sent,setSent]=useState(false),[cooldown,setCooldown]=useState(0);
 useEffect(()=>{if(!cooldown)return;const timer=setTimeout(()=>setCooldown(n=>n-1),1000);return()=>clearTimeout(timer);},[cooldown]);
 async function submit(){if(busy||cooldown)return;setBusy(true);setError("");setSent(false);try{await sendAccountEmail(flow,email,window.location.origin);setSent(true);setCooldown(60);}catch(e){setError(e instanceof Error?e.message:"Could not send email. Try again.");}finally{setBusy(false);}}
 return <AuthShell mode="login" title={recovery?"Reset your password":"Confirm your email"} description={recovery?"Enter your account email to request a secure reset link.":"Check your inbox and spam folder. Need another confirmation link? Request it below."}>
 {error&&<p role="alert" className="mb-5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
 {sent&&<p role="status" className="mb-5 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700">{recovery?"If this email has an eligible account, a reset link will arrive shortly.":"If this account needs confirmation, a new link will arrive shortly."} Open the link in this browser. Never share it.</p>}
 <form onSubmit={e=>{e.preventDefault();void submit();}} aria-busy={busy} className="space-y-5"><div><label className={authLabelClass} htmlFor="account-email">Email address</label><input id="account-email" type="email" autoComplete="email" required maxLength={254} value={email} onChange={e=>setEmail(e.target.value)} disabled={busy} className={authInputClass} placeholder="you@example.com"/></div><button className={authSubmitClass} disabled={busy||cooldown>0}>{busy?<LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin"/>:<Mail aria-hidden="true" className="h-4 w-4"/>}{busy?"Sending…":cooldown?"Resend in "+cooldown+"s":recovery?"Send reset link":"Resend confirmation email"}</button></form>
 <Link className="mt-5 block text-center text-sm font-semibold text-blue-600 hover:underline" href="/login">Back to sign in</Link></AuthShell>;
}
