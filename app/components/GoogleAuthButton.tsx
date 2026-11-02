"use client";

import { useEffect, useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { startGoogleSignIn } from "../lib/auth/googleAuth";

export default function GoogleAuthButton({ disabled, onBusyChange, onError }: {
  disabled: boolean;
  onBusyChange: (busy: boolean) => void;
  onError: (message: string) => void;
}) {
  const [pending, setPending] = useState(false);
  const busy = useRef(false);

  useEffect(() => {
    const returned = (event: PageTransitionEvent) => {
      if (event.persisted && busy.current) {
        busy.current = false;
        setPending(false);
        onBusyChange(false);
      }
    };
    window.addEventListener("pageshow", returned);
    return () => window.removeEventListener("pageshow", returned);
  }, [onBusyChange]);

  async function continueWithGoogle() {
    if (disabled || busy.current) return;
    busy.current = true;
    setPending(true);
    onBusyChange(true);
    onError("");
    try {
      await startGoogleSignIn(window.location.origin);
    } catch (error) {
      busy.current = false;
      setPending(false);
      onBusyChange(false);
      onError(error instanceof Error && error.name !== "TimeoutError" ? error.message : "Google sign-in could not connect. Please try again.");
    }
  }

  return (
    <div className="mb-5">
      <button type="button" onClick={() => void continueWithGoogle()} disabled={disabled || pending} aria-busy={pending}
        className="flex w-full items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-xs transition hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600 disabled:cursor-wait disabled:opacity-60">
        {pending ? <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" /> : (
          <svg aria-hidden="true" viewBox="0 0 48 48" className="h-5 w-5"><path fill="#4285F4" d="M43.6 24.5c0-1.5-.1-2.8-.4-4.2H24v8h11c-.5 2.6-2 4.8-4.3 6.3v5.2h7c4.1-3.8 6.5-9.4 6.5-15.3Z" /><path fill="#34A853" d="M24 44c5.5 0 10.2-1.8 13.6-5l-7-5.4c-1.9 1.3-4.3 2-6.6 2-5.3 0-9.8-3.6-11.4-8.4H5.4v5.4A20.5 20.5 0 0 0 24 44Z" /><path fill="#FBBC05" d="M12.6 27.2a12.3 12.3 0 0 1 0-6.4v-5.4H5.4a20 20 0 0 0 0 17.2l7.2-5.4Z" /><path fill="#EA4335" d="M24 12.4c3 0 5.7 1 7.8 3l5.9-5.9A19.7 19.7 0 0 0 24 4 20.5 20.5 0 0 0 5.4 15.4l7.2 5.4C14.2 16 18.7 12.4 24 12.4Z" /></svg>
        )}
        <span>{pending ? "Connecting to Google…" : "Continue with Google"}</span>
      </button>
      <div className="mt-5 flex items-center gap-3 text-[11px] text-slate-400"><span className="h-px flex-1 bg-slate-100" /><span>or continue with email</span><span className="h-px flex-1 bg-slate-100" /></div>
    </div>
  );
}
