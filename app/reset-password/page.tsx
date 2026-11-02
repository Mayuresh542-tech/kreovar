"use client";
import {useEffect,useState} from "react";
import Link from "next/link";
import {LoaderCircle} from "lucide-react";
import AuthShell,{authInputClass,authLabelClass,authSubmitClass} from "../components/AuthShell";
import {verifiedRecoveryUser,finishPasswordReset} from "../lib/auth/emailAuth";
export default function ResetPassword(){
 const [ready,setReady]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(""),[done,setDone]=useState(false),[password,setPassword]=useState(""),[confirmation,setConfirmation]=useState("");
 useEffect(()=>{let cancelled=false;void verifiedRecoveryUser().then(()=>{if(!cancelled)setReady(true);}).catch(e=>{if(!cancelled)setError(e.message);});return()=>{cancelled=true;};},[]);
 async function submit(){if(!ready||busy)return;setBusy(true);setError("");try{await finishPasswordReset(password,confirmation);setPassword("");setConfirmation("");setReady(false);setDone(true);}catch(e){setError(e instanceof Error?e.message:"Password reset failed.");}finally{setBusy(false);}}
 return <AuthShell mode="login" title={done?"Password updated":"Choose a new password"} description={done?"Sign in again with your new password.":"Use a unique password with at least 12 characters."}>
 {error&&<p role="alert" className="mb-5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
 {done?<div role="status"><p className="mb-5 text-sm text-blue-700">Your password was changed successfully.</p><Link href="/login" className={authSubmitClass}>Back to sign in</Link></div>:ready?<form onSubmit={e=>{e.preventDefault();void submit();}} aria-busy={busy} className="space-y-5"><div><label htmlFor="new-password" className={authLabelClass}>New password</label><input id="new-password" type="password" autoComplete="new-password" required minLength={12} maxLength={256} value={password} onChange={e=>setPassword(e.target.value)} disabled={busy} className={authInputClass}/></div><div><label htmlFor="confirm-password" className={authLabelClass}>Confirm password</label><input id="confirm-password" type="password" autoComplete="new-password" required minLength={12} maxLength={256} value={confirmation} onChange={e=>setConfirmation(e.target.value)} disabled={busy} className={authInputClass}/></div><button className={authSubmitClass} disabled={busy}>{busy&&<LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true"/>}{busy?"Updating…":"Update password"}</button></form>:!error?<p role="status" className="text-sm text-slate-500">Checking your reset link…</p>:null}
 {!done&&<Link href="/forgot-password" className="mt-5 block text-center text-sm font-semibold text-blue-600 hover:underline">Request a new reset link</Link>}</AuthShell>;
}
