"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, Sparkles } from "lucide-react";
import { PLANS } from "../config/plans";
import StudioShell from "../components/StudioShell";
import BrandMark from "../components/BrandMark";
import LegalLinks from "../components/LegalLinks";
import SpatialTiltCard from "../components/3d/SpatialTiltCard";
import CreatorObject3D from "../components/3d/CreatorObject3D";
import { useAuthGate } from "../lib/useAuthGate";

export default function PricingClient() {
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">("monthly");
  const { status, session } = useAuthGate();
  const isAuthed = status === "authed" && Boolean(session);

  const content = (
    <div className="max-w-4xl mx-auto w-full space-y-10 pb-16 pt-4">
      {/* Header Section */}
      <div className="grid gap-8 lg:grid-cols-12 lg:items-center">
        <div className="lg:col-span-7 text-center lg:text-left space-y-3">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-200/80 bg-white/85 px-3 py-1 text-[11px] font-mono font-semibold uppercase tracking-wider text-[#1D4FB1] shadow-2xs">
            <Sparkles className="w-3 h-3" /> Studio Plans
          </span>
          <h1 className="text-3xl sm:text-4xl font-bold text-[#142440] tracking-tight">
            Simple, transparent pricing
          </h1>
          <p className="text-sm sm:text-base text-[#52647e] max-w-xl mx-auto lg:mx-0">
            Choose the plan that fits your needs. Upgrade anytime with no hidden fees.
          </p>

          {/* Monthly / Yearly Toggle */}
          <div className="pt-3 flex items-center justify-center lg:justify-start">
            <div className="inline-flex items-center p-1 rounded-full bg-white/85 border border-slate-200/90 shadow-2xs backdrop-blur-md">
              <button
                type="button"
                onClick={() => setBillingCycle("monthly")}
                className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all cursor-pointer ${
                  billingCycle === "monthly"
                    ? "bg-[#13223E] text-white shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Monthly
              </button>
              <button
                type="button"
                onClick={() => setBillingCycle("yearly")}
                className={`px-4 py-1.5 rounded-full text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer ${
                  billingCycle === "yearly"
                    ? "bg-[#13223E] text-white shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <span>Yearly</span>
                <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] font-semibold rounded-full">
                  Save 17% (2 Mo Free)
                </span>
              </button>
            </div>
          </div>
        </div>

        <div className="lg:col-span-5 hidden sm:block">
          <div className="vx-3d-viewport h-52">
            <CreatorObject3D variant="director-slate" height={208} />
          </div>
        </div>
      </div>

      {/* Pricing Cards */}
      <div className="vx-stagger-row grid grid-cols-1 md:grid-cols-2 gap-8 max-w-3xl mx-auto">
        {/* 1. FREE PLAN CARD */}
        <SpatialTiltCard className="vx-frosted-surface rounded-3xl p-6 sm:p-8 flex flex-col justify-between">
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-bold text-[#142440]">Free</h3>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="text-4xl font-extrabold text-[#142440] tracking-tight">
                  {PLANS.free.displayPrice}
                </span>
                <span className="text-xs text-[#52647e]">/month</span>
              </div>
              <p className="text-xs text-[#52647e] mt-1">Monthly allowances · no rollover</p>
            </div>

            <div className="space-y-3 pt-4 border-t border-slate-200/70">
              <ul className="space-y-3">
                {PLANS.free.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2.5 text-xs text-[#52647e]">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="pt-8">
            <Link
              href={isAuthed ? "/projects" : "/signup"}
              className="w-full py-2.5 px-4 rounded-xl border border-slate-200/90 bg-white/80 hover:bg-white text-[#142440] font-semibold text-xs sm:text-sm flex items-center justify-center transition-colors shadow-2xs"
            >
              Get Started
            </Link>
          </div>
        </SpatialTiltCard>

        {/* 2. PRO PLAN CARD */}
        <SpatialTiltCard className="vx-frosted-surface relative rounded-3xl !border-2 !border-[#1D4FB1] p-6 sm:p-8 flex flex-col justify-between shadow-lg">
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3.5 py-0.5 rounded-full bg-[#1D4FB1] text-white text-[10px] font-semibold tracking-wide uppercase shadow-sm">
            Recommended
          </div>

          <div className="space-y-6">
            <div>
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-[#142440]">Pro</h3>
                <span className="text-[11px] font-mono font-semibold text-[#1D4FB1] bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">
                  Full Studio
                </span>
              </div>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="text-4xl font-extrabold text-[#142440] tracking-tight">
                  {billingCycle === "yearly" ? PLANS.pro.yearlyDisplayPrice : PLANS.pro.displayPrice}
                </span>
                <span className="text-xs text-[#52647e]">
                  /{billingCycle === "yearly" ? "year" : "month"}
                </span>
              </div>
              <p className="text-xs text-[#52647e] mt-1">Monthly allowances included · no rollover</p>
            </div>

            <div className="space-y-3 pt-4 border-t border-slate-200/70">
              <ul className="space-y-3">
                {PLANS.pro.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2.5 text-xs text-[#52647e]">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="pt-8">
            <Link
              href={`/checkout/pro?cycle=${billingCycle}`}
              className="w-full py-2.5 px-4 rounded-xl bg-[#13223E] hover:bg-[#1D4FB1] text-white font-semibold text-xs sm:text-sm flex items-center justify-center gap-1.5 transition-all shadow-sm group"
            >
              <span>Get Started</span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
            </Link>
          </div>
        </SpatialTiltCard>
      </div>

      {/* Helpful links & Cross-references */}
      <div className="max-w-3xl mx-auto pt-8 border-t border-slate-200/70">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 text-center sm:text-left">
          <div className="vx-frosted-surface-soft rounded-2xl p-4">
            <h4 className="font-semibold text-[#142440] text-sm">Need help choosing?</h4>
            <p className="text-xs text-[#52647e] mt-1">Review full feature breakdowns and answers to common questions.</p>
            <Link href="/faq" className="inline-block mt-2 text-xs font-semibold text-[#1D4FB1] hover:underline">
              Read FAQ →
            </Link>
          </div>
          <div className="vx-frosted-surface-soft rounded-2xl p-4">
            <h4 className="font-semibold text-[#142440] text-sm">See how it works</h4>
            <p className="text-xs text-[#52647e] mt-1">Follow our step-by-step workflow guide before upgrading.</p>
            <Link href="/how-to-use" className="inline-block mt-2 text-xs font-semibold text-[#1D4FB1] hover:underline">
              Creator walkthrough →
            </Link>
          </div>
          <div className="vx-frosted-surface-soft rounded-2xl p-4">
            <h4 className="font-semibold text-[#142440] text-sm">Satisfaction guaranteed</h4>
            <p className="text-xs text-[#52647e] mt-1">3-day first-payment refund policy. Cancel anytime in one click.</p>
            <Link href="/refund" className="inline-block mt-2 text-xs font-semibold text-[#1D4FB1] hover:underline">
              Refund policy details →
            </Link>
          </div>
        </div>
        {!isAuthed && (
          <div className="mt-10 pt-6 border-t border-slate-200/70 text-center">
            <LegalLinks />
          </div>
        )}
      </div>
    </div>
  );

  if (isAuthed) {
    return <StudioShell active="billing">{content}</StudioShell>;
  }

  return (
    <div className="vx-pearl-backdrop min-h-screen text-[#142440]">
      <header className="vx-public-glass-header sticky top-0 z-30">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8 h-16">
          <Link href="/" className="flex items-center gap-2.5 font-bold text-[#142440]">
            <BrandMark size={30} />
            <span>Kreovar</span>
          </Link>
          <div className="flex items-center gap-4 text-xs font-medium text-slate-700">
            <Link href="/how-to-use" className="hover:text-[#1D4FB1]">How to Use</Link>
            <Link href="/faq" className="hover:text-[#1D4FB1]">FAQ</Link>
            <Link href="/login" className="px-3 py-1.5 rounded-lg hover:bg-white/80">Sign In</Link>
            <Link href="/signup" className="px-4 py-2 rounded-xl bg-[#13223E] text-white hover:bg-[#1D4FB1] transition-colors">
              Start Free
            </Link>
          </div>
        </div>
      </header>
      <main className="px-4 sm:px-6 lg:px-8 py-10">{content}</main>
    </div>
  );
}
