"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import AuthShell from "../../components/AuthShell";
import { supabase } from "../../lib/supabase";
import {hasRecoverySession} from "../../lib/auth/recoverySession";
import { googleReturnError } from "../../lib/auth/googleAuth";

export default function GoogleCallback() {
  const router = useRouter();
  const [error, setError] = useState("");
  const returnedError = useRef<string | undefined | null>(null);
  useEffect(() => {
    let finished = false;
    if (returnedError.current === null) returnedError.current = googleReturnError(window.location.href);
    const flow = new URL(window.location.href).searchParams.get("flow");
    const providerError = returnedError.current ? flow ? "This email link is invalid or expired. Request a new one." : returnedError.current : undefined;
    if (providerError) {
      window.history.replaceState(null, "", "/auth/callback");
      const displayError = setTimeout(() => setError(providerError), 0);
      return () => clearTimeout(displayError);
    }
    const timer = setTimeout(() => {
      if (!finished) {
        finished = true;
        setError("Sign-in took too long. Please return to sign in and try again.");
      }
    }, 20000);
    void (async () => {
      try {
        // getSession waits for this client's automatic OAuth URL handling.
        const { data, error: sessionError } = await supabase.auth.getSession();
        if (sessionError || !data.session) throw new Error("No session");
        const { data: verified, error: verificationError } = await supabase.auth.getUser();
        if (verificationError || !verified.user) throw new Error("Invalid session");
        if(flow==="recovery"&&!hasRecoverySession(verified.user.id))throw new Error("Recovery link unavailable");
        if(flow==="confirm"&&!verified.user.email_confirmed_at)throw new Error("Email not confirmed");
        window.history.replaceState(null,"","/auth/callback");
        if (!finished) router.replace(flow==="recovery"?"/reset-password":"/projects");
      } catch {
        if (!finished) setError(flow ? "Your email link could not be verified. Request a fresh link and open it in the browser where you requested it." : "Sign-in could not be completed. Please try again or use email.");
      } finally {
        finished = true;
        clearTimeout(timer);
      }
    })();
    return () => { finished = true; clearTimeout(timer); };
  }, [router]);
  return (
    <AuthShell mode="login">
      {error ? <div className="space-y-4"><p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-relaxed text-rose-700">{error}</p><Link href="/login" className="flex items-center justify-center rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800">Back to sign in</Link></div> : <p role="status" className="flex items-center gap-3 py-6 text-sm text-slate-500"><LoaderCircle aria-hidden="true" className="h-5 w-5 animate-spin" />Verifying your sign-in link…</p>}
    </AuthShell>
  );
}
