"use client";

import { useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import {PLANS} from "../config/plans";
import StudioShell from "../components/StudioShell";


export default function PricingPage() {
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">("monthly");

  return (
    <StudioShell active="billing">
      <div className="max-w-4xl mx-auto w-full space-y-10 pb-16 pt-4">
        {/* Header Section (Screen 7) */}
        <div className="text-center max-w-2xl mx-auto space-y-2">
          <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 tracking-tight">
            Simple, transparent pricing
          </h1>
          <p className="text-sm sm:text-base text-slate-500">
            Choose the plan that fits your needs. Upgrade anytime.
          </p>

          {/* Monthly / Yearly Toggle */}
          <div className="pt-4 flex items-center justify-center">
            <div className="inline-flex items-center p-1 rounded-full bg-slate-100 border border-slate-200">
              <button
                type="button"
                onClick={() => setBillingCycle("monthly")}
                className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all cursor-pointer ${
                  billingCycle === "monthly"
                    ? "bg-white text-slate-900 shadow-2xs"
                    : "text-slate-500 hover:text-slate-900"
                }`}
              >
                Monthly
              </button>
              <button
                type="button"
                onClick={() => setBillingCycle("yearly")}
                className={`px-4 py-1.5 rounded-full text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer ${
                  billingCycle === "yearly"
                    ? "bg-white text-slate-900 shadow-2xs"
                    : "text-slate-500 hover:text-slate-900"
                }`}
              >
                <span>Yearly</span>
                <span className="px-1.5 py-0.2 bg-emerald-100 text-emerald-700 text-[10px] font-semibold rounded-full">
                  Save 17%
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* Exactly TWO Pricing Cards (Screen 7) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-3xl mx-auto">
          {/* 1. FREE PLAN CARD */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 flex flex-col justify-between hover:border-slate-300 transition-all shadow-xs">
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Free</h3>
                <div className="mt-3 flex items-baseline gap-1">
                  <span className="text-4xl font-extrabold text-slate-900 tracking-tight">
                    {PLANS.free.displayPrice}
                  </span>
                  <span className="text-xs text-slate-500">/month</span>
                </div>
                <p className="text-xs text-slate-400 mt-1">Monthly allowances · no rollover</p>
              </div>

              {/* Feature Checklist */}
              <div className="space-y-3 pt-4 border-t border-slate-100">
                <ul className="space-y-3">{PLANS.free.features.map(feature=><li key={feature} className="flex items-start gap-2.5 text-xs text-slate-600"><Check className="w-4 h-4 text-emerald-600 shrink-0"/><span>{feature}</span></li>)}</ul>
              </div>
            </div>

            <div className="pt-8">
              <Link
                href="/projects"
                className="w-full py-2.5 px-4 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-900 font-medium text-xs sm:text-sm flex items-center justify-center transition-colors shadow-2xs"
              >
                Get Started
              </Link>
            </div>
          </div>

          {/* 2. PRO PLAN CARD */}
          <div className="relative bg-white rounded-2xl border-2 border-slate-900 p-6 sm:p-8 flex flex-col justify-between shadow-xs">
            {/* Subtle Recommended Badge */}
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-slate-900 text-white text-[10px] font-semibold tracking-wide uppercase">
              Recommended
            </div>

            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Pro</h3>
                <div className="mt-3 flex items-baseline gap-1">
                  <span className="text-4xl font-extrabold text-slate-900 tracking-tight">
                    {billingCycle === "yearly" ? PLANS.pro.yearlyDisplayPrice : PLANS.pro.displayPrice}
                  </span>
                  <span className="text-xs text-slate-500">
                    /{billingCycle === "yearly" ? "year" : "month"}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1">Monthly allowances included · no rollover</p>
              </div>

              {/* Feature Checklist */}
              <div className="space-y-3 pt-4 border-t border-slate-100">
                <ul className="space-y-3">{PLANS.pro.features.map(feature=><li key={feature} className="flex items-start gap-2.5 text-xs text-slate-600"><Check className="w-4 h-4 text-emerald-600 shrink-0"/><span>{feature}</span></li>)}</ul>
              </div>
            </div>

            <div className="pt-8">
              <Link
                href={`/checkout/pro?cycle=${billingCycle}`}
                className="w-full py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-medium text-xs sm:text-sm flex items-center justify-center transition-colors shadow-2xs"
              >
                Get Started
              </Link>
            </div>
          </div>
        </div>
      </div>
    </StudioShell>
  );
}
