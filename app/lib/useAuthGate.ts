"use client";
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";

export type AuthStatus = "loading" | "authed" | "unauthed";

/**
 * Client-side auth gate. Resolves the persisted Supabase session WITHOUT
 * redirecting prematurely.
 *
 * Auth state transitions:
 *   "loading" (checking) -> "authed" (valid session verified)
 *   "loading" (checking) -> "unauthed" (verified no session or signed out)
 *
 * Callers must treat "loading" as checking: never redirect while "loading".
 */
export function useAuthGate(): { status: AuthStatus; session: Session | null } {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    let mounted = true;
    let hasResolvedSession = false;

    let revision = 0;
    const resolve = async (candidate: Session | null) => {
      const current = ++revision;
      if (!candidate) { if (mounted) { setSession(null); setStatus("unauthed"); } return; }
      const { data, error } = await supabase.auth.getUser(candidate.access_token);
      if (!mounted || current !== revision) return;
      if (error || !data.user || data.user.id !== candidate.user.id) { setSession(null); setStatus("unauthed"); return; }
      hasResolvedSession = true;
      setSession({ ...candidate, user: data.user }); setStatus("authed");
    };
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, candidate) => {
      // SDK auth callbacks hold its lock; perform network verification outside it.
      queueMicrotask(() => { if (mounted) void resolve(candidate).catch(() => { if (mounted) { setSession(null); setStatus("unauthed"); } }); });
    });
    void supabase.auth.getSession().then(({ data }) => {
      if (mounted && !hasResolvedSession) return resolve(data.session);
    }).catch(() => { if (mounted && !hasResolvedSession) { setSession(null); setStatus("unauthed"); } });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  return { status, session };
}

