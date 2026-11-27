"use client";
import BrandMark from "./BrandMark";
import LegalLinks from "./LegalLinks";

import type { ReactNode } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, ArrowRight, Film, Layers, Sparkles } from "lucide-react";
import CreatorObject3D from "./3d/CreatorObject3D";

export const authInputClass = "w-full rounded-xl border border-slate-200/90 bg-white/80 px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10 disabled:opacity-60 backdrop-blur-sm";
export const authLabelClass = "mb-2 block text-xs font-semibold text-slate-700";
export const authSubmitClass = "mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-[#13223E] px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1D4FB1] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600 disabled:cursor-wait disabled:opacity-60 cursor-pointer";

export default function AuthShell({ mode, children, title, description }: { mode: "login" | "signup"; children: ReactNode; title?: string; description?: string }) {
  const signup = mode === "signup", reduced = useReducedMotion();
  const entrance = (x: number, delay = 0) => ({
    initial: { opacity: 0, x },
    animate: { opacity: 1, x: 0 },
    transition: { duration: reduced ? 0 : 0.45, delay: reduced ? 0 : delay },
  });
  return (
    <main className="vx-auth-shell vx-pearl-backdrop min-h-screen text-[#142440] selection:bg-blue-100">
      <header className="vx-public-glass-header sticky top-0 z-30">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <Link href="/" aria-label="Kreovar home" className="group inline-flex items-center gap-2.5 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600">
            <BrandMark size={32} />
            <span className="font-heading text-lg font-bold tracking-tight transition group-hover:text-blue-700">Kreovar</span>
          </Link>
          <Link href="/" className="inline-flex items-center gap-1.5 rounded-lg text-xs font-medium text-slate-600 transition hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600"><ArrowLeft aria-hidden="true" className="h-3.5 w-3.5" />Back to home</Link>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-6xl items-center gap-12 px-5 pb-12 pt-8 sm:px-8 lg:min-h-[calc(100svh-80px)] lg:grid-cols-2 lg:gap-16 lg:py-12">
        <motion.section {...entrance(-24)} className="hidden lg:block" aria-labelledby="studio-intro">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-blue-200/80 bg-white/80 px-3.5 py-1.5 text-[11px] font-semibold text-[#1D4FB1] backdrop-blur-md shadow-2xs"><Sparkles aria-hidden="true" className="h-3.5 w-3.5" />YOUR CREATOR WORKSPACE</div>
          <h2 id="studio-intro" className="max-w-md text-4xl font-bold leading-[1.18] tracking-tight text-[#142440]">Your next great video<br /><span className="text-[#1D4FB1]">starts here.</span></h2>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-[#52647e]">Bring your ideas, footage and edits together. One frosted workspace for everything you create.</p>

          <div className="vx-frosted-surface mt-8 rounded-3xl p-5">
            <div className="mb-4 flex items-center justify-between border-b border-slate-200/60 pb-3.5">
              <span className="flex items-center gap-2 text-xs font-semibold text-[#142440]"><Film className="h-4 w-4 text-[#1D4FB1]" />Interactive Studio Optics</span>
              <span className="rounded-md border border-slate-200/80 bg-white/80 px-2 py-0.5 text-[10px] font-mono font-medium text-slate-500">Idea → Video</span>
            </div>
            <div className="vx-3d-viewport h-52">
              <CreatorObject3D variant="auth-prism" height={208} ariaLabel="Interactive Kreovar studio lens optics" />
            </div>
            <div className="mt-4 space-y-2 rounded-xl bg-white/75 border border-slate-200/60 p-3">
              <div className="flex gap-1.5"><span className="h-4 w-2/5 rounded bg-blue-500/25" /><span className="h-4 flex-1 rounded bg-blue-400/20" /><span className="h-4 w-1/5 rounded bg-teal-500/25" /></div>
              <div className="ml-7 h-2.5 w-3/4 rounded bg-indigo-400/20" />
              <div className="h-2.5 w-4/5 rounded bg-emerald-400/20" />
            </div>
          </div>
          <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-xs text-[#52647e]"><span className="inline-flex items-center gap-1.5"><Sparkles className="h-3.5 w-3.5 text-[#1D4FB1]" aria-hidden="true" />Find ideas</span><span className="inline-flex items-center gap-1.5"><Layers className="h-3.5 w-3.5 text-[#287778]" aria-hidden="true" />Build your story</span><span className="inline-flex items-center gap-1.5"><Film className="h-3.5 w-3.5 text-[#1D4FB1]" aria-hidden="true" />Edit with AI</span></div>
        </motion.section>

        <motion.section {...entrance(24, 0.08)} className="vx-frosted-surface mx-auto w-full max-w-md rounded-3xl p-6 sm:p-9" aria-labelledby="auth-title">
          <div className="mb-7"><span className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-blue-200/80 bg-blue-50/90 px-2.5 py-1 text-[10px] font-mono font-semibold uppercase tracking-wider text-[#1D4FB1]"><Sparkles className="h-3 w-3" aria-hidden="true" />Creator studio</span><h1 id="auth-title" className="text-2xl font-bold tracking-tight text-[#142440]">{title || (signup ? "Create your workspace" : "Welcome back")}</h1><p className="mt-2 text-sm leading-relaxed text-[#52647e]">{description || (signup ? "Start creating with your free Kreovar account." : "Sign in to pick up where you left off.")}</p></div>
          {children}
          <div className="mt-6 border-t border-slate-200/70 pt-4"><LegalLinks /></div>
          <div className="mt-7 border-t border-slate-200/70 pt-5 text-center text-xs leading-relaxed text-[#52647e]">{signup ? "Already have an account?" : "New to Kreovar?"}{" "}<Link href={signup ? "/login" : "/signup"} className="inline-flex items-center gap-1 rounded font-semibold text-[#1D4FB1] transition hover:text-blue-800 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">{signup ? "Sign in" : "Create free account"}<ArrowRight className="h-3 w-3" aria-hidden="true" /></Link></div>
        </motion.section>
      </div>
    </main>
  );
}
