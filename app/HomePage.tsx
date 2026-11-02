"use client";
import PublicAnswers from './components/marketing/PublicAnswers';
import BrandMark from "./components/BrandMark";
import {FEATURE_PAGES} from "./lib/featurePages";
import Link from "next/link";
import LegalLinks from "./components/LegalLinks";
import {
  ArrowRight,
  Sparkles,
  Film,
  CheckCircle2,
} from "lucide-react";
import { useAuthGate } from "./lib/useAuthGate";

// Content creation ticker items
const TICKER_ITEMS_1 = [
  "⚡ Short videos up to 60 seconds",
  "📱 Portrait videos for Reels",
  "🎵 Short-form video editing",
  "🎙️ AI voiceovers",
  "✂️ Trim and split clips",
  "🔤 Kinetic Caption Templates",
  "🎬 Multi-track video editor",
  "📈 Trend discovery",
];

const TICKER_ITEMS_2 = [
  "🔥 AI content ideas and scripts",
  "🎧 Background audio and SFX",
  "📐 Adjustable video aspect ratios",
  "✨ Word-by-Word Caption Highlight",
  "🎥 B-roll search and import",
  "⚡ MP4 video export",
  "💎 Basic colour adjustments",
  "🚀 Browser-based video rendering",
];

export default function Home() {
  const { status, session } = useAuthGate();

  const isAuthed = status === "authed" && !!session;

  return (
    <div className="vx-glass-landing relative min-h-screen bg-[#FAFAFA] text-[#0F172A] font-sans antialiased selection:bg-blue-600 selection:text-white overflow-x-hidden">
      {/* Subtle Background Mesh & Radial Lighting */}
      <div aria-hidden="true" className="vx-landing-lighting fixed inset-0 pointer-events-none z-0 overflow-hidden">
        {/* Subtle grid pattern */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#e2e8f00a_1px,transparent_1px),linear-gradient(to_bottom,#e2e8f00a_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] opacity-70" />
      </div>

      {/* ── TOP NOTIFICATION BANNER (When User Is Logged In) ── */}
      {isAuthed && (
        <div className="vx-landing-banner relative z-50 bg-white border-b border-slate-200/80 px-4 py-2 text-center text-xs text-slate-600 flex items-center justify-center gap-2.5 shadow-2xs">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="font-medium text-slate-800">
            Welcome back, {session?.user?.email?.split("@")[0]}
          </span>
          <span className="text-slate-300">•</span>
          <Link
            href="/dashboard"
            className="font-semibold text-blue-600 hover:text-blue-700 transition-colors inline-flex items-center gap-1 group"
          >
            Open Creator Dashboard{" "}
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
          </Link>
        </div>
      )}

      {/* ── CLEAN SAAS HEADER ── */}
      <header className="vx-glass-landing-header sticky top-0 inset-x-0 h-16 z-40 bg-white/80 backdrop-blur-md border-b border-slate-200/80 transition-all">
        <div className="vx-landing-nav max-w-7xl mx-auto h-full px-4 sm:px-6 lg:px-8 flex items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 group">
            <BrandMark size={32}/>
            <div className="flex flex-col">
              <span className="font-bold text-base tracking-tight text-slate-900 group-hover:text-blue-600 transition-colors">
                Kreovar
              </span>
              <span className="text-[10px] text-slate-400 font-mono tracking-tight -mt-0.5">
                AI Video Studio
              </span>
            </div>
          </Link>

          {/* Navigation Links */}
          <nav className="hidden md:flex items-center gap-1 text-xs font-medium text-slate-600">
            <Link
              href="/dashboard"
              className="px-3 py-1.5 rounded-lg hover:text-slate-900 hover:bg-slate-100/70 transition-colors"
            >
              Studio
            </Link>
            <Link
              href="/editor"
              className="px-3 py-1.5 rounded-lg hover:text-slate-900 hover:bg-slate-100/70 transition-colors flex items-center gap-1.5"
            >
              <span>Editor 3.0</span>
              <span className="px-1.5 py-0.2 bg-blue-100 text-blue-700 text-[9px] font-bold rounded-full">
                NEW
              </span>
            </Link>
            <Link
              href="/templates"
              className="px-3 py-1.5 rounded-lg hover:text-slate-900 hover:bg-slate-100/70 transition-colors"
            >
              Templates
            </Link>
            <Link
              href="/pricing"
              className="px-3 py-1.5 rounded-lg hover:text-slate-900 hover:bg-slate-100/70 transition-colors"
            >
              Pricing
            </Link>
          </nav>

          {/* Action CTAs */}
          <div className="flex items-center gap-2.5">
            {isAuthed ? (
              <Link
                href="/dashboard"
                className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium shadow-xs transition-all flex items-center gap-1.5 group"
              >
                <span>Dashboard</span>
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  className="px-3.5 py-1.5 rounded-xl text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100/80 transition-colors"
                >
                  Sign In
                </Link>
                <Link
                  href="/signup"
                  className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium shadow-xs transition-all flex items-center gap-1.5 group"
                >
                  <span>Start Free</span>
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* ── HERO SECTION WITH FLOATING CREATOR ASSETS ── */}
      <main id="main-content">
      <section data-vx-motion="off" className="vx-landing-hero relative z-10 pt-12 pb-16 sm:pt-20 sm:pb-24 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <div className="text-center max-w-3xl mx-auto space-y-6">
          {/* Top Pill */}
          <div
            className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-blue-50 border border-blue-200/60 text-blue-700 text-xs font-medium shadow-2xs"
          >
            <Sparkles className="w-3.5 h-3.5 text-blue-600" />
            <span>AI-Assisted Content Studio</span>
            <span className="w-1 h-1 rounded-full bg-blue-400" />
            <span className="font-mono text-[11px] text-blue-600">Ideas to edits</span>
          </div>

          {/* Main Headline */}
          <h1
            className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-slate-900 leading-[1.12]"
          >
            Create and Edit Short Videos{" "}
            <span className="bg-gradient-to-r from-blue-600 via-indigo-600 to-sky-600 bg-clip-text text-transparent">
              in One Studio
            </span>
          </h1>

          {/* Concise Subhead */}
          <p
            className="text-base sm:text-lg text-slate-600 max-w-2xl mx-auto leading-relaxed"
          >
            Bring your own footage, scripts and ideas together with AI voiceovers,
            word-level captions, and professional multi-track timeline editing.
          </p>

          {/* Hero Action Buttons */}
          <div
            className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2"
          >
            <Link
              href={isAuthed ? "/projects" : "/signup"}
              className="w-full sm:w-auto px-6 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-medium text-sm shadow-xs hover:shadow-md transition-all flex items-center justify-center gap-2 group cursor-pointer"
            >
              <span>Start Creating Free</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </Link>

            <Link
              href="/editor"
              className="w-full sm:w-auto px-6 py-3 rounded-xl bg-white hover:bg-slate-50 text-slate-700 font-medium text-sm border border-slate-200 shadow-2xs transition-all flex items-center justify-center gap-2 group cursor-pointer"
            >
              <Film className="w-4 h-4 text-slate-500 group-hover:text-slate-900 transition-colors" />
              <span>Explore Video Editor</span>
            </Link>
          </div>

          {/* Social Proof Strip */}
          <div
            className="pt-4 flex items-center justify-center gap-6 text-xs text-slate-500"
          >
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-700" />
              <span>No credit card required</span>
            </div>
            <div className="hidden sm:flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-700" />
              <span>Up to 1080p Export · Pro</span>
            </div>
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-700" />
              <span>Multi-Platform Formats</span>
            </div>
          </div>
        </div>

      </section>

      {/* ── SMOOTH INFINITE SLIDING MARQUEE TICKERS ── */}
      <section className="vx-landing-ticker relative z-10 py-6 border-y border-slate-200/80 bg-white overflow-hidden select-none">
        {/* Track 1: Sliding Left */}
        <div className="flex gap-4 whitespace-nowrap overflow-hidden">
          <div
            className="vx-marquee-left flex gap-6 shrink-0 items-center text-xs font-semibold text-slate-700 font-mono tracking-tight"
          >
            {[...TICKER_ITEMS_1, ...TICKER_ITEMS_1].map((item, idx) => (
              <span
                key={idx}
                className="px-3.5 py-1.5 rounded-full bg-slate-50 border border-slate-200/80 flex items-center gap-2 hover:border-slate-300 transition-colors"
              >
                {item}
              </span>
            ))}
          </div>
        </div>

        {/* Track 2: Sliding Right */}
        <div className="flex gap-4 whitespace-nowrap overflow-hidden mt-3">
          <div
            className="vx-marquee-right flex gap-6 shrink-0 items-center text-xs font-semibold text-slate-700 font-mono tracking-tight"
          >
            {[...TICKER_ITEMS_2, ...TICKER_ITEMS_2].map((item, idx) => (
              <span
                key={idx}
                className="px-3.5 py-1.5 rounded-full bg-slate-50 border border-slate-200/80 flex items-center gap-2 hover:border-slate-300 transition-colors"
              >
                {item}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── 3-STEP STREAMLINED PRODUCTION PIPELINE (Clean, No Bloat) ── */}
      <section className="relative z-10 py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <div className="text-center max-w-2xl mx-auto mb-14 space-y-3">
          <div className="inline-flex items-center gap-1.5 text-xs font-mono font-semibold uppercase tracking-wider text-blue-600 bg-blue-50 px-3 py-1 rounded-full border border-blue-200/60">
            Automated Workflow
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900">
            From Idea to Finished Video
          </h2>
          <p className="text-sm sm:text-base text-slate-500">
            From raw idea to high-retention video in three focused steps.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Step 1 */}
          <div
            className="vx-landing-card bg-white rounded-2xl border border-slate-200 p-6 flex flex-col justify-between space-y-6 shadow-xs hover:shadow-md hover:border-slate-300 transition-all"
          >
            <div className="space-y-4">
              <div className="w-12 h-12 rounded-xl bg-blue-50 border border-blue-200/60 flex items-center justify-center text-blue-600 font-bold font-mono text-sm shadow-2xs">
                01
              </div>
              <h3 className="text-lg font-bold text-slate-900 tracking-tight">
                Discover Trend & Hook
              </h3>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                Discover topics, explore content ideas and generate a script when you are ready. Review and adapt the results to your audience.
              </p>
            </div>
            <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-blue-600 font-semibold font-mono">
              <span>Ideas → Scripts</span>
              <ArrowRight className="w-4 h-4" />
            </div>
          </div>

          {/* Step 2 */}
          <div
            className="vx-landing-card bg-white rounded-2xl border border-slate-200 p-6 flex flex-col justify-between space-y-6 shadow-xs hover:shadow-md hover:border-slate-300 transition-all"
          >
            <div className="space-y-4">
              <div className="w-12 h-12 rounded-xl bg-purple-50 border border-purple-200/60 flex items-center justify-center text-purple-600 font-bold font-mono text-sm shadow-2xs">
                02
              </div>
              <h3 className="text-lg font-bold text-slate-900 tracking-tight">
                AI Voice & Auto Captions
              </h3>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                Generate a voiceover, or upload your video to create timed captions. Choose a caption style and review the transcript before exporting.
              </p>
            </div>
            <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-purple-600 font-semibold font-mono">
              <span>Editable timed captions</span>
              <ArrowRight className="w-4 h-4" />
            </div>
          </div>

          {/* Step 3 */}
          <div
            className="vx-landing-card bg-white rounded-2xl border border-slate-200 p-6 flex flex-col justify-between space-y-6 shadow-xs hover:shadow-md hover:border-slate-300 transition-all"
          >
            <div className="space-y-4">
              <div className="w-12 h-12 rounded-xl bg-emerald-50 border border-emerald-200/60 flex items-center justify-center text-emerald-700 font-bold font-mono text-sm shadow-2xs">
                03
              </div>
              <h3 className="text-lg font-bold text-slate-900 tracking-tight">
                NLE Multi-Track Polish
              </h3>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                Trim, split and arrange clips across tracks. Adjust framing, add audio and captions, then export videos up to 60 seconds. Pro supports up to 1080p.
              </p>
            </div>
            <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-emerald-700 font-semibold font-mono">
              <span>Timeline → MP4 Export</span>
              <ArrowRight className="w-4 h-4" />
            </div>
          </div>
        </div>
      </section>

      <PublicAnswers/>

      {/* ── HIGH-CONVERTING CTA BANNER ── */}
      <section aria-labelledby="explore-studio-tools" className="relative z-10 mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <h2 id="explore-studio-tools" className="text-3xl font-bold tracking-tight text-slate-900">Your next video starts here.</h2>
        <p className="mt-3 text-slate-600">Explore the tools, see how they work and choose your next step.</p>
        <div className="mt-8 grid gap-5 md:grid-cols-3">{FEATURE_PAGES.map(page=><Link key={page.path} href={page.path} className="vx-landing-card group rounded-3xl border border-slate-200 bg-white p-7 transition-colors hover:border-blue-400 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600"><h3 className="text-xl font-semibold text-slate-900">{page.label}</h3><p className="mt-3 text-sm leading-relaxed text-slate-600">{page.description}</p><span className="mt-6 inline-block text-sm font-semibold text-blue-600">Explore {page.label} →</span></Link>)}</div>
      </section>

      <section className="relative z-10 py-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <div className="relative bg-slate-900 text-white rounded-3xl p-8 sm:p-14 text-center overflow-hidden shadow-2xl border border-slate-800">
          {/* Subtle Ambient Radial within Banner */}
          <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[700px] h-[350px] bg-blue-600/20 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 max-w-2xl mx-auto space-y-6">
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight">
              Ready to Scale Your Content Engine?
            </h2>
            <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
              Bring your ideas, footage, voiceovers and captions together in Kreovar.
              Start a project and build your next short video.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              <Link
                href={isAuthed ? "/projects" : "/signup"}
                className="w-full sm:w-auto px-7 py-3.5 rounded-xl bg-white text-slate-950 font-bold text-sm hover:bg-slate-100 transition-all shadow-md hover:scale-105 duration-200"
              >
                {isAuthed ? "Create New Video →" : "Start Creating Free →"}
              </Link>
              <Link
                href="/editor"
                className="w-full sm:w-auto px-6 py-3.5 rounded-xl bg-slate-800 text-slate-200 font-medium text-sm hover:bg-slate-700 border border-slate-700 transition-all"
              >
                Open Studio Editor
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── CLEAN SAAS FOOTER ── */}
      </main>
      <footer className="vx-landing-footer relative z-10 border-t border-slate-200 bg-white py-12 text-xs text-slate-500 font-sans">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2.5">
            <BrandMark size={24}/>
            <span className="font-bold text-slate-900 text-sm">Kreovar</span>
            <span className="text-slate-300">|</span>
            <span className="text-slate-500">Content Creation & Video Editing</span>
          </div>

          <div className="flex items-center gap-6 font-medium text-slate-600">
            <Link href="/dashboard" className="hover:text-slate-900 transition-colors">
              Dashboard
            </Link>
            <Link href="/editor" className="hover:text-slate-900 transition-colors">
              Editor
            </Link>
            <Link href="/templates" className="hover:text-slate-900 transition-colors">
              Templates
            </Link>
            <Link href="/pricing" className="hover:text-slate-900 transition-colors">
              Pricing
            </Link>
          </div>

          <div className="text-slate-600 font-mono text-[11px]">
            © {new Date().getFullYear()} Kreovar. All rights reserved.
          </div>
        </div>
        <nav aria-label="Content creation tools" className="mx-auto mt-6 flex max-w-7xl flex-wrap gap-5 px-4 text-sm">{FEATURE_PAGES.map(page=><Link key={page.path} href={page.path} className="hover:text-slate-900 hover:underline">{page.label}</Link>)}</nav>
        <div className="mx-auto mt-6 max-w-7xl px-4"><LegalLinks/></div>
      </footer>
    </div>
  );
}
