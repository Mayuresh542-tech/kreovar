"use client";

import { useState, useEffect, useRef, useSyncExternalStore } from "react";
import { ArrowRight, Eye, EyeOff, LoaderCircle } from "lucide-react";
import AuthShell, { authInputClass, authLabelClass, authSubmitClass } from "../components/AuthShell";
import { supabase } from "../lib/supabase";
import { useAuthGate } from "../lib/useAuthGate";
import Link from "next/link";
import { useRouter } from "next/navigation";

const subscribeLocation = () => () => {};
const readAccountDeletionNotice = () => new URLSearchParams(window.location.search).get("account") === "deleted";
const serverDeletionNotice = () => false;

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const accountDeleted = useSyncExternalStore(subscribeLocation, readAccountDeletionNotice, serverDeletionNotice);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const { status } = useAuthGate();
  const redirectedRef = useRef(false);

  useEffect(() => {
    if (status === "authed" && !redirectedRef.current) {
      redirectedRef.current = true;
      router.replace("/projects");
    }
  }, [status, router]);

  async function handleLogin() {
    if (loading) return;
    if (!email.trim() || !password) {
      setError("Please enter your email and password.");
      return;
    }
    setLoading(true);
    setError("");

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        setError(error.status === 429 ? "Too many attempts. Please wait before trying again." : "Could not sign in. Check your email and password and confirm your email if required.");
        setLoading(false);
      } else if (data?.session) {
        if (!redirectedRef.current) {
          redirectedRef.current = true;
          router.replace("/projects");
        }
      }
    } catch {
      setError("An unexpected authentication error occurred. Please try again.");
      setLoading(false);
    }
  }

  return (
    <AuthShell mode="login">
      {accountDeleted && <p role="status" className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-800">Your account has been deleted. You have been signed out.</p>}
      {error && <div id="auth-error" role="alert" className="mb-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs leading-relaxed text-rose-700">{error}</div>}
      
      <form onSubmit={e => { e.preventDefault(); void handleLogin(); }} aria-busy={loading} className="space-y-5">
        <div><label htmlFor="login-email" className={authLabelClass}>Email address</label><input id="login-email" name="email" type="email" autoComplete="email" maxLength={254} required placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} disabled={loading} aria-describedby={error ? "auth-error" : undefined} className={authInputClass} /></div>
        <div><label htmlFor="login-password" className={authLabelClass}>Password</label><div className="relative"><input id="login-password" name="password" type={show ? "text" : "password"} autoComplete="current-password" maxLength={256} required  placeholder="Enter your password" value={password} onChange={e => setPassword(e.target.value)} disabled={loading} aria-describedby={error ? "auth-error" : undefined} className={authInputClass + " pr-12"} /><button type="button" onClick={() => setShow(!show)} aria-label={show ? "Hide password" : "Show password"} aria-pressed={show} aria-controls="login-password" className="absolute inset-y-0 right-1 flex w-10 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-2 focus-visible:outline-blue-600">{show ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}</button></div></div>
        <button type="submit" disabled={loading} className={authSubmitClass}>{loading ? <><LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /><span>Signing in…</span></> : <><span>Sign in to studio</span><ArrowRight className="h-4 w-4" aria-hidden="true" /></>}</button>
      </form>
      <div className="mt-5 flex flex-wrap justify-between gap-3 text-xs font-semibold text-blue-600"><Link href="/forgot-password" className="hover:underline">Forgot password?</Link><Link href="/confirm-email" className="hover:underline">Resend confirmation email</Link></div>
    </AuthShell>
  );
}
