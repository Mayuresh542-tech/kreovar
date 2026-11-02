"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthGate } from "@/app/lib/useAuthGate";
import { isAdminEmail } from "@/app/lib/admin";
import StudioShell from "@/app/components/StudioShell";
import AuthLoadingScreen from "@/app/components/AuthLoadingScreen";
import AdminHeader from "@/app/components/admin/AdminHeader";

export default function AdminSettingsPage() {
  const router = useRouter();
  const { status, session } = useAuthGate();
  const isAdmin = status === "authed" && isAdminEmail(session?.user?.email);

  useEffect(() => {
    if (status === "unauthed" || (status === "authed" && !isAdmin)) {
      router.replace("/dashboard");
    }
  }, [status, isAdmin, router]);

  if (!isAdmin) {
    return <AuthLoadingScreen label="Validating administrative credentials…" />;
  }

  return (
    <StudioShell active="settings">
      <div className="max-w-7xl mx-auto w-full py-6 space-y-8">
        <AdminHeader
          title="System Architecture &amp; Environment Settings"
          subtitle="Administrative configuration, service role security status, and environment variables inspection."
          badge="ROOT SETTINGS"
        />

        <div className="p-6 sm:p-7 rounded-3xl bg-[#0D0F15] border border-[#202534] space-y-6 shadow-xl">
          <div className="border-b border-[#202534] pb-4">
            <h2 className="text-base font-bold text-white font-heading">
              Server Environment Security Status
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Strict isolation is enforced for all third-party secrets and keys.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-mono">
            <div className="p-4 rounded-xl bg-[#12151E] border border-[#202534] space-y-1">
              <span className="text-slate-400 text-[10px] uppercase">Whop Store Integration</span>
              <div className="text-white font-bold flex items-center gap-1.5">
                <span className="text-emerald-400">✓</span>
                <span>Active Server-Only (apik_••••••••)</span>
              </div>
              <p className="text-[11px] text-slate-500 font-sans">
                Never leaked to client bundles, browser cookies, or client API responses.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-[#12151E] border border-[#202534] space-y-1">
              <span className="text-slate-400 text-[10px] uppercase">Admin Allowlist</span>
              <div className="text-white font-bold flex items-center gap-1.5">
                <span className="text-emerald-400">✓</span>
                <span>ADMIN_EMAILS Verified Server-Side</span>
              </div>
              <p className="text-[11px] text-slate-500 font-sans">
                Non-allowlisted accounts are rejected with 403 Forbidden.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-[#12151E] border border-[#202534] space-y-1">
              <span className="text-slate-400 text-[10px] uppercase">Gemini AI Model</span>
              <div className="text-white font-bold flex items-center gap-1.5">
                <span className="text-emerald-400">✓</span>
                <span>Centralized Server AI Layer</span>
              </div>
              <p className="text-[11px] text-slate-500 font-sans">
                Protected server-side execution across Trend Discovery and Content Kit ideation.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-[#12151E] border border-[#202534] space-y-1">
              <span className="text-slate-400 text-[10px] uppercase">Supabase RLS</span>
              <div className="text-white font-bold flex items-center gap-1.5">
                <span className="text-emerald-400">✓</span>
                <span>Row Level Security Enforced</span>
              </div>
              <p className="text-[11px] text-slate-500 font-sans">
                Cryptographic tenant isolation across subscriptions and credit transactions.
              </p>
            </div>
          </div>
        </div>
      </div>
    </StudioShell>
  );
}
