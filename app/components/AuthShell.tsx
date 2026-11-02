"use client";
import BrandMark from "./BrandMark";
import LegalLinks from "./LegalLinks";

import type { ReactNode } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, ArrowRight, Film, Layers, Sparkles, WandSparkles } from "lucide-react";

export const authInputClass = "w-full rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10 disabled:opacity-60";
export const authLabelClass = "mb-2 block text-xs font-semibold text-slate-700";
export const authSubmitClass = "mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-xs transition hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600 disabled:cursor-wait disabled:opacity-60";

export default function AuthShell({ mode, children, title, description }: { mode: "login" | "signup"; children: ReactNode; title?:string; description?:string }) {
  const signup = mode === "signup", reduced = useReducedMotion();
  const entrance = (x: number, delay = 0) => ({
    initial: { opacity: 0, x },
    animate: { opacity: 1, x: 0 },
    transition: { duration: reduced ? 0 : .45, delay: reduced ? 0 : delay },
  });
  return (
    <main className="vx-auth-shell min-h-screen bg-[#FAFAFA] text-slate-900 selection:bg-blue-100">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-5 py-6 sm:px-8">
        <Link href="/" aria-label="Kreovar home" className="group inline-flex items-center gap-2.5 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600">
          <BrandMark size={32}/>
          <span className="font-heading text-lg font-bold tracking-tight transition group-hover:text-blue-600">Kreovar</span>
        </Link>
        <Link href="/" className="inline-flex items-center gap-1.5 rounded-lg text-xs font-medium text-slate-500 transition hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600"><ArrowLeft aria-hidden="true" className="h-3.5 w-3.5" />Back to home</Link>
      </header>

      <div className="mx-auto grid w-full max-w-6xl items-center gap-12 px-5 pb-12 pt-5 sm:px-8 lg:min-h-[calc(100svh-88px)] lg:grid-cols-2 lg:gap-20 lg:py-12">
        <motion.section {...entrance(-24)} className="hidden lg:block" aria-labelledby="studio-intro">
          <div className="mb-5 inline-flex items-center gap-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-1.5 text-[11px] font-semibold text-blue-700"><Sparkles aria-hidden="true" className="h-3.5 w-3.5" />YOUR CREATOR WORKSPACE</div>
          <h2 id="studio-intro" className="max-w-md text-4xl font-bold leading-[1.2] tracking-tight">Your next great video<br /><span className="text-blue-600">starts here.</span></h2>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-slate-500">Bring your ideas, footage and edits together. One workspace for everything you create.</p>

          <div aria-hidden="true" className="mt-9 rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_32px_rgba(15,23,42,0.04)]">
            <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-4"><span className="flex items-center gap-2 text-xs font-semibold"><Film className="h-4 w-4 text-blue-600" />Your creative studio</span><span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-medium text-slate-500">Idea → Video</span></div>
            <div className="relative flex aspect-[2.1] items-center justify-center overflow-hidden rounded-xl border border-blue-100 bg-gradient-to-br from-slate-50 via-blue-50 to-white">
              <div className="absolute -right-5 -top-8 h-36 w-36 rounded-full border-[20px] border-blue-100/70" />
              <div className="absolute -bottom-12 -left-8 h-36 w-36 rounded-full border-[20px] border-slate-100" />
              <div className="relative text-center"><span className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white bg-white text-blue-600 shadow-xs"><WandSparkles className="h-5 w-5" /></span><p className="text-lg font-bold tracking-tight">Make something worth watching.</p><p className="mt-1 text-[11px] text-slate-500">Your ideas. Your voice. Your story.</p></div>
            </div>
            <div className="mt-4 space-y-2 rounded-lg bg-slate-50 p-3"><div className="flex gap-1.5"><span className="h-5 w-2/5 rounded bg-blue-200" /><span className="h-5 flex-1 rounded bg-blue-100" /><span className="h-5 w-1/5 rounded bg-slate-200" /></div><div className="ml-7 h-3 w-3/4 rounded bg-violet-100" /><div className="h-3 w-4/5 rounded bg-emerald-100" /></div>
          </div>
          <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-500"><span className="inline-flex items-center gap-1.5"><Sparkles className="h-3.5 w-3.5" aria-hidden="true" />Find ideas</span><span className="inline-flex items-center gap-1.5"><Layers className="h-3.5 w-3.5" aria-hidden="true" />Build your story</span><span className="inline-flex items-center gap-1.5"><Film className="h-3.5 w-3.5" aria-hidden="true" />Edit with AI</span></div>
        </motion.section>

        <motion.section {...entrance(24, .08)} className="mx-auto w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_8px_32px_rgba(15,23,42,0.04)] sm:p-9" aria-labelledby="auth-title">
          <div className="mb-7"><span className="mb-3 inline-flex items-center gap-1.5 rounded-md border border-blue-100 bg-blue-50 px-2 py-1 text-[10px] font-mono font-semibold uppercase tracking-wider text-blue-700"><Sparkles className="h-3 w-3" aria-hidden="true" />Creator studio</span><h1 id="auth-title" className="text-2xl font-bold tracking-tight">{title || (signup ? "Create your workspace" : "Welcome back")}</h1><p className="mt-2 text-sm leading-relaxed text-slate-500">{description || (signup ? "Start creating with your free Kreovar account." : "Sign in to pick up where you left off.")}</p></div>
          {children}
          <div className="mt-6 border-t border-slate-100 pt-4"><LegalLinks/></div>
          <div className="mt-7 border-t border-slate-100 pt-5 text-center text-xs leading-relaxed text-slate-500">{signup ? "Already have an account?" : "New to Kreovar?"}{" "}<Link href={signup ? "/login" : "/signup"} className="inline-flex items-center gap-1 rounded font-semibold text-blue-600 transition hover:text-blue-700 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">{signup ? "Sign in" : "Create free account"}<ArrowRight className="h-3 w-3" aria-hidden="true" /></Link></div>
        </motion.section>
      </div>
    </main>
  );
}
