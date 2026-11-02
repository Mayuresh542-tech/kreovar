"use client";
import {isExistingSignup} from "../lib/auth/signupResult";

import { useState, useEffect, useRef } from "react";
import { ArrowRight, Eye, EyeOff, LoaderCircle } from "lucide-react";
import AuthShell, { authInputClass, authLabelClass, authSubmitClass } from "../components/AuthShell";
import { supabase } from "../lib/supabase";
import { useAuthGate } from "../lib/useAuthGate";
import Link from "next/link";
import {emailCallbackUrl} from "../lib/auth/emailAuth";
import { useRouter } from "next/navigation";

export default function Signup() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [existingAccount,setExistingAccount]=useState(false);
  const router = useRouter();
  const { status } = useAuthGate();
  const redirectedRef = useRef(false);

  useEffect(() => {
    if (status === "authed" && !redirectedRef.current) {
      redirectedRef.current = true;
      router.replace("/projects");
    }
  }, [status, router]);

  async function handleSignup() {
    if (loading) return;
    if (!email.trim() || !password) {
      setError("Please provide an email and password.");
      return;
    }
    if (password.length < 12 || password.length > 256) {
      setError("Use a password between 12 and 256 characters.");
      return;
    }

    setLoading(true);
    setError("");
    setInfo("");
    setExistingAccount(false);

    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: { name: name.trim().slice(0, 100) },
          emailRedirectTo: emailCallbackUrl(window.location.origin,"confirm"),
        },
      });

      if(isExistingSignup(data,error)){
        setExistingAccount(true);
        setInfo("An account already exists with this email. Please log in.");
        setLoading(false);
        return;
      }
      if (error) {
        setError(error.status === 429 ? "Too many attempts. Please wait before trying again." : "Could not create an account. Check your details or try signing in if you already registered.");
        setLoading(false);
      } else {
        if (data?.session) {
          if (!redirectedRef.current) {
            redirectedRef.current = true;
            router.replace("/projects");
          }
        } else {
          setLoading(false);
          setInfo("If registration can be completed, you will receive a confirmation email. Check your inbox, or sign in if you already have an account.");
        }
      }
    } catch {
      setError("An unexpected registration error occurred. Please try again.");
      setLoading(false);
    }
  }

  return (
    <AuthShell mode="signup">
      {error && <div id="auth-error" role="alert" className="mb-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs leading-relaxed text-rose-700">{error}</div>}
      {info && <div role="status" className="mb-5 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs leading-relaxed text-blue-700">{info}{existingAccount?<><Link href="/login" className="mt-2 block font-semibold underline">Log in</Link><Link href="/forgot-password" className="mt-2 block underline">Forgot password?</Link></>:<Link href="/confirm-email" className="mt-2 block font-semibold underline">Resend confirmation email</Link>}</div>}
      <p className="mb-5 text-xs leading-6 text-slate-500">By selecting Create free account, you agree to our <Link href="/terms" className="text-blue-600 underline">Terms of Service</Link> and acknowledge our <Link href="/privacy" className="text-blue-600 underline">Privacy Policy</Link>.</p>
      <form onSubmit={e => { e.preventDefault(); void handleSignup(); }} aria-busy={loading} className="space-y-5">
          <div><label htmlFor="signup-name" className={authLabelClass}>Creator name <span className="font-normal text-slate-400">(optional)</span></label><input id="signup-name" name="name" type="text" autoComplete="name" maxLength={100} placeholder="Your name" value={name} onChange={e => setName(e.target.value)} disabled={loading} className={authInputClass} /></div>
        <div><label htmlFor="signup-email" className={authLabelClass}>Email address</label><input id="signup-email" name="email" type="email" autoComplete="email" maxLength={254} required placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} disabled={loading} aria-describedby={error ? "auth-error" : undefined} className={authInputClass} /></div>
        <div><label htmlFor="signup-password" className={authLabelClass}>Password</label><div className="relative"><input id="signup-password" name="password" type={show ? "text" : "password"} autoComplete="new-password" required minLength={12} maxLength={256} placeholder="Create a password" value={password} onChange={e => setPassword(e.target.value)} disabled={loading} aria-describedby={error ? "auth-error password-help" : "password-help"} className={authInputClass + " pr-12"} /><button type="button" onClick={() => setShow(!show)} aria-label={show ? "Hide password" : "Show password"} aria-pressed={show} aria-controls="signup-password" className="absolute inset-y-0 right-1 flex w-10 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-2 focus-visible:outline-blue-600">{show ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}</button></div><p id="password-help" className="mt-2 text-[11px] text-slate-500">Use at least 12 characters; a long unique passphrase works well.</p></div>
        <button type="submit" disabled={loading} className={authSubmitClass}>{loading ? <><LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /><span>Creating your account…</span></> : <><span>Create free account</span><ArrowRight className="h-4 w-4" aria-hidden="true" /></>}</button>
      </form>
    </AuthShell>
  );
}
