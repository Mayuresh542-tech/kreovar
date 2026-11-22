"use client";

import { useState } from "react";
import Link from "next/link";
import BrandMark from "./components/BrandMark";
import PublicAnswers from "./components/marketing/PublicAnswers";
import LegalLinks from "./components/LegalLinks";
import { FEATURE_PAGES } from "./lib/featurePages";
import { PLANS } from "./config/plans";
import { useAuthGate } from "./lib/useAuthGate";
import {
  ArrowRight,
  Sparkles,
  Film,
  CheckCircle2,
  Check,
  Wand2,
  Mic,
  Type,
  Layers,
  Sliders,
  Play,
  Volume2,
  Download,
  Zap,
} from "lucide-react";

// Infinite sliding marquee badges
const TICKER_ITEMS_1 = [
  "⚡ Short videos up to 60 seconds",
  "📱 9:16 Portrait for Reels, Shorts & TikTok",
  "🔤 Kinetic Alex Hormozi Captions",
  "🎙️ Studio AI Voiceovers",
  "✂️ Precision Trim, Split & Multi-Track",
  "🎬 CapCut-Style Web Timeline",
  "🪄 Natural Language AI Editing Assistant",
  "📈 Trend Discovery & Viral Hooks",
];

const TICKER_ITEMS_2 = [
  "🔥 AI Content Scripts & Outlines",
  "🎧 Built-in Royalty-Free SFX & Audio",
  "📐 One-Click Aspect Ratio Switching",
  "✨ Word-by-Word Karaoke Caption Highlights",
  "🎥 Instant B-Roll Library Search",
  "⚡ Full 1080p MP4 Browser Export",
  "💎 Auto-Silence Detection & Punch Zooms",
  "🚀 Fast In-Browser Rendering",
];

export default function Home() {
  const { status, session } = useAuthGate();
  const isAuthed = status === "authed" && !!session;
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">("monthly");

  return (
    <div className="vx-glass-landing relative min-h-screen bg-[#FAFAFA] text-[#0F172A] font-sans antialiased selection:bg-blue-600 selection:text-white overflow-x-hidden">
      {/* Subtle Background Lighting & Mesh */}
      <div aria-hidden="true" className="vx-landing-lighting fixed inset-0 pointer-events-none z-0 overflow-hidden">
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

      {/* ── HEADER ── */}
      <header className="vx-glass-landing-header sticky top-0 inset-x-0 h-16 z-40 bg-white/80 backdrop-blur-md border-b border-slate-200/80 transition-all">
        <div className="vx-landing-nav max-w-7xl mx-auto h-full px-4 sm:px-6 lg:px-8 flex items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 group">
            <BrandMark size={32} />
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
            {isAuthed ? (
              <>
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
              </>
            ) : (
              <>
                <Link
                  href="/ai-video-editor"
                  className="px-3 py-1.5 rounded-lg hover:text-slate-900 hover:bg-slate-100/70 transition-colors"
                >
                  Video Editor
                </Link>
                <Link
                  href="/caption-generator"
                  className="px-3 py-1.5 rounded-lg hover:text-slate-900 hover:bg-slate-100/70 transition-colors"
                >
                  Captions
                </Link>
                <Link
                  href="/ai-voiceover"
                  className="px-3 py-1.5 rounded-lg hover:text-slate-900 hover:bg-slate-100/70 transition-colors"
                >
                  AI Voiceover
                </Link>
              </>
            )}
            <Link
              href="/pricing"
              className="px-3 py-1.5 rounded-lg hover:text-slate-900 hover:bg-slate-100/70 transition-colors"
            >
              Pricing
            </Link>
            <Link
              href="/faq"
              className="px-3 py-1.5 rounded-lg hover:text-slate-900 hover:bg-slate-100/70 transition-colors"
            >
              FAQ
            </Link>
          </nav>

          {/* Action CTAs: One clean, distinct button without clutter */}
          <div className="flex items-center gap-3">
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

      {/* ── HERO SECTION: NO DUPLICATE BUTTONS, CLEAR VALUE PROP ── */}
      <main id="main-content">
        <section className="vx-landing-hero relative z-10 pt-12 pb-12 sm:pt-20 sm:pb-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
          <div className="text-center max-w-3xl mx-auto space-y-6">
            {/* Pill Badge */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-blue-50 border border-blue-200/60 text-blue-700 text-xs font-medium shadow-2xs">
              <Sparkles className="w-3.5 h-3.5 text-blue-600" />
              <span>All-In-One AI Video Creation Studio</span>
              <span className="w-1 h-1 rounded-full bg-blue-400" />
              <span className="font-mono text-[11px] text-blue-600 font-semibold">v3.0 Live</span>
            </div>

            {/* Main Headline */}
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-slate-900 leading-[1.12]">
              Create Viral Short Videos{" "}
              <span className="bg-gradient-to-r from-blue-600 via-indigo-600 to-sky-600 bg-clip-text text-transparent">
                in One Studio
              </span>
            </h1>

            {/* Subheading explaining what Kreovar does */}
            <p className="text-base sm:text-lg text-slate-600 max-w-2xl mx-auto leading-relaxed">
              Kreovar gives you CapCut-grade multi-track video editing, kinetic word-by-word captions,
              lifelike AI voiceovers, and natural-language AI edits. Everything you need to turn raw clips
              into high-retention Shorts, Reels, and TikToks.
            </p>

            {/* Single Prominent Hero Action (NO DUPLICATE BUTTONS) */}
            <div className="flex flex-col items-center justify-center gap-3 pt-2">
              <Link
                href={isAuthed ? "/projects" : "/signup"}
                className="w-full sm:w-auto px-8 py-3.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-sm shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 group cursor-pointer"
              >
                <span>{isAuthed ? "Open Creator Studio" : "Start Creating Free"}</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </Link>
            </div>

            {/* Trust Proof Strip */}
            <div className="pt-2 flex flex-wrap items-center justify-center gap-6 text-xs text-slate-500">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>No credit card required</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Full 1080p MP4 Export</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>9:16 Shorts, Reels & TikTok</span>
              </div>
            </div>
          </div>

          {/* ── HIGH-FIDELITY PRODUCT SHOWCASE: WHAT KREOVAR ACTUALLY IS & DOES ── */}
          <div className="mt-12 sm:mt-16 max-w-5xl mx-auto">
            <div className="relative rounded-2xl sm:rounded-3xl bg-slate-950 p-2 sm:p-4 border border-slate-800 shadow-2xl overflow-hidden">
              {/* Window Header */}
              <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800/80 text-xs text-slate-400">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-rose-500/80 inline-block" />
                  <span className="w-3 h-3 rounded-full bg-amber-500/80 inline-block" />
                  <span className="w-3 h-3 rounded-full bg-emerald-500/80 inline-block" />
                  <span className="ml-2 font-mono text-[11px] text-slate-300 hidden sm:inline-block">
                    Kreovar Studio 3.0 — Viral_Hook_01.mp4
                  </span>
                </div>
                <div className="flex items-center gap-2 font-mono text-[11px]">
                  <span className="px-2 py-0.5 rounded bg-blue-950 text-blue-400 border border-blue-800/60 font-semibold">
                    9:16 (1080×1920)
                  </span>
                  <span className="text-slate-400 hidden sm:inline-block">60s Max • 1080p Ready</span>
                </div>
              </div>

              {/* Studio Workspace Simulation */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 p-3 sm:p-4 bg-slate-900/90 rounded-b-xl sm:rounded-b-2xl">
                {/* Left Tool Palette */}
                <div className="hidden md:flex md:col-span-3 flex-col gap-2 p-3 bg-slate-950/70 border border-slate-800/60 rounded-xl text-xs text-slate-300">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500">
                    Studio Toolkit
                  </span>
                  <div className="space-y-1.5 pt-1">
                    <div className="flex items-center gap-2 p-2 rounded-lg bg-blue-600/15 border border-blue-500/30 text-blue-300 font-medium">
                      <Type className="w-4 h-4 text-blue-400" />
                      <span>Kinetic Captions</span>
                      <span className="ml-auto text-[10px] px-1.5 py-0.2 bg-blue-500/20 text-blue-300 rounded">
                        Active
                      </span>
                    </div>
                    <div className="flex items-center gap-2 p-2 rounded-lg hover:bg-slate-800/60 transition-colors text-slate-300">
                      <Mic className="w-4 h-4 text-purple-400" />
                      <span>AI Voiceover</span>
                    </div>
                    <div className="flex items-center gap-2 p-2 rounded-lg hover:bg-slate-800/60 transition-colors text-slate-300">
                      <Film className="w-4 h-4 text-emerald-400" />
                      <span>Smart B-Roll</span>
                    </div>
                    <div className="flex items-center gap-2 p-2 rounded-lg hover:bg-slate-800/60 transition-colors text-slate-300">
                      <Wand2 className="w-4 h-4 text-amber-400" />
                      <span>Edit with AI</span>
                    </div>
                    <div className="flex items-center gap-2 p-2 rounded-lg hover:bg-slate-800/60 transition-colors text-slate-300">
                      <Volume2 className="w-4 h-4 text-sky-400" />
                      <span>SFX & Audio</span>
                    </div>
                  </div>

                  <div className="mt-auto pt-3 border-t border-slate-800/60 space-y-2">
                    <div className="text-[10px] font-mono text-slate-400">Word-by-word preset:</div>
                    <div className="px-2.5 py-1.5 rounded-md bg-slate-900 border border-slate-800 text-[11px] font-bold text-amber-400 flex items-center justify-between">
                      <span>Alex Hormozi Pop</span>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    </div>
                  </div>
                </div>

                {/* Center Canvas Preview: 9:16 Video Mockup */}
                <div className="md:col-span-5 flex flex-col items-center justify-center p-3 bg-slate-950/70 border border-slate-800/60 rounded-xl relative overflow-hidden min-h-[300px]">
                  {/* Phone frame */}
                  <div className="relative w-44 sm:w-52 aspect-[9/16] rounded-2xl bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 border-2 border-slate-700/80 shadow-2xl flex flex-col justify-between p-3 overflow-hidden">
                    {/* Top status */}
                    <div className="flex items-center justify-between text-[9px] text-white/80 font-mono">
                      <span>00:14 / 00:45</span>
                      <span className="px-1.5 py-0.5 rounded bg-rose-500 text-white font-bold animate-pulse">
                        LIVE REC
                      </span>
                    </div>

                    {/* Animated Word-by-Word Caption Mockup */}
                    <div className="my-auto text-center space-y-2">
                      <div className="text-[10px] text-slate-300 uppercase tracking-widest font-mono">
                        Hook Delivery
                      </div>
                      <div className="bg-slate-950/80 backdrop-blur-md px-3 py-2 rounded-xl border border-white/10 shadow-lg">
                        <span className="text-white text-xs font-black uppercase tracking-tight">
                          Turn your ideas into{" "}
                        </span>
                        <span className="text-yellow-400 text-sm font-black uppercase tracking-tight drop-shadow-[0_2px_8px_rgba(250,204,21,0.6)]">
                          VIRAL SHORTS
                        </span>
                        <span className="text-emerald-400 text-xs font-black uppercase tracking-tight ml-1">
                          ⚡
                        </span>
                      </div>
                      <div className="text-[9px] text-slate-400">Auto-synced word highlight</div>
                    </div>

                    {/* Bottom controls */}
                    <div className="pt-2 border-t border-white/10 flex items-center justify-between text-white/70">
                      <Play className="w-3.5 h-3.5 text-white fill-white" />
                      <div className="h-1 flex-1 mx-2 bg-slate-800 rounded-full overflow-hidden">
                        <div className="w-1/3 h-full bg-blue-500 rounded-full" />
                      </div>
                      <span className="text-[8px] font-mono text-slate-400">1080p</span>
                    </div>
                  </div>
                </div>

                {/* Right AI Assistant & Inspector */}
                <div className="md:col-span-4 flex flex-col justify-between p-3 bg-slate-950/70 border border-slate-800/60 rounded-xl text-xs space-y-3">
                  <div>
                    <div className="flex items-center gap-1.5 text-blue-400 font-semibold font-mono text-[11px] mb-2">
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Natural Language AI Editor</span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 text-xs font-mono leading-relaxed">
                      &quot;Auto-trim silences, add punch-in zoom on every key hook, and sync Hormozi captions.&quot;
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">
                      Staged AI Automation
                    </span>
                    <div className="space-y-1">
                      <div className="flex items-center justify-between p-1.5 rounded bg-slate-900/80 border border-slate-800 text-[11px] text-slate-300">
                        <span className="flex items-center gap-1.5">
                          <Check className="w-3 h-3 text-emerald-400" />
                          <span>Silence Detection</span>
                        </span>
                        <span className="text-slate-500 text-[10px]">-4.2s cut</span>
                      </div>
                      <div className="flex items-center justify-between p-1.5 rounded bg-slate-900/80 border border-slate-800 text-[11px] text-slate-300">
                        <span className="flex items-center gap-1.5">
                          <Check className="w-3 h-3 text-emerald-400" />
                          <span>Punch-in Zooms</span>
                        </span>
                        <span className="text-slate-500 text-[10px]">3 applied</span>
                      </div>
                      <div className="flex items-center justify-between p-1.5 rounded bg-slate-900/80 border border-slate-800 text-[11px] text-slate-300">
                        <span className="flex items-center gap-1.5">
                          <Check className="w-3 h-3 text-emerald-400" />
                          <span>Kinetic Subtitles</span>
                        </span>
                        <span className="text-slate-500 text-[10px]">99% match</span>
                      </div>
                    </div>
                  </div>

                  <div className="p-2 rounded-lg bg-emerald-950/40 border border-emerald-800/40 text-[11px] text-emerald-300 flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span>Instant undo safety on every stage</span>
                  </div>
                </div>

                {/* Bottom Timeline Panel (Full Width across all 12 columns) */}
                <div className="col-span-1 md:col-span-12 p-3 bg-slate-950/90 border border-slate-800/80 rounded-xl space-y-2">
                  <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 border-b border-slate-800/60 pb-1.5">
                    <div className="flex items-center gap-3">
                      <span className="text-slate-200 font-bold">TIMELINE</span>
                      <span>Tracks: 3</span>
                      <span className="hidden sm:inline">FPS: 30</span>
                    </div>
                    <div className="flex items-center gap-2 sm:gap-4 text-slate-500 overflow-hidden text-[9px] sm:text-[10px]">
                      <span>00:00</span>
                      <span>00:10</span>
                      <span>00:20</span>
                      <span className="hidden sm:inline">00:30</span>
                      <span className="hidden sm:inline">00:40</span>
                      <span className="hidden sm:inline">00:50</span>
                      <span>00:60</span>
                    </div>
                  </div>

                  {/* Track 1: Captions */}
                  <div className="flex items-center gap-2 text-[10px] font-mono">
                    <span className="w-16 shrink-0 text-amber-400 flex items-center gap-1">
                      <Type className="w-3 h-3" />
                      <span>Text</span>
                    </span>
                    <div className="flex-1 h-5 rounded bg-slate-900 border border-slate-800 flex items-center gap-1 px-1 overflow-hidden">
                      <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[9px] font-bold">
                        [Turn]
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[9px] font-bold">
                        [Your Ideas]
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-yellow-500/30 text-yellow-300 text-[9px] font-extrabold">
                        [VIRAL SHORTS]
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[9px] font-bold">
                        [In Minutes]
                      </span>
                    </div>
                  </div>

                  {/* Track 2: Video */}
                  <div className="flex items-center gap-2 text-[10px] font-mono">
                    <span className="w-16 shrink-0 text-blue-400 flex items-center gap-1">
                      <Film className="w-3 h-3" />
                      <span>Video</span>
                    </span>
                    <div className="flex-1 h-6 rounded bg-slate-900 border border-slate-800 flex items-center gap-1 px-1 overflow-hidden">
                      <div className="h-4.5 w-1/3 rounded bg-blue-600/30 border border-blue-500/40 text-[9px] text-blue-200 flex items-center px-2 font-bold truncate">
                        Clip_01_Hook.mp4
                      </div>
                      <div className="h-4.5 w-1/4 rounded bg-indigo-600/30 border border-indigo-500/40 text-[9px] text-indigo-200 flex items-center px-2 font-bold truncate">
                        B-Roll_Reaction.mp4
                      </div>
                      <div className="h-4.5 flex-1 rounded bg-blue-600/30 border border-blue-500/40 text-[9px] text-blue-200 flex items-center px-2 font-bold truncate">
                        Clip_02_CallToAction.mp4
                      </div>
                    </div>
                  </div>

                  {/* Track 3: Audio */}
                  <div className="flex items-center gap-2 text-[10px] font-mono">
                    <span className="w-16 shrink-0 text-purple-400 flex items-center gap-1">
                      <Volume2 className="w-3 h-3" />
                      <span>Audio</span>
                    </span>
                    <div className="flex-1 h-5 rounded bg-slate-900 border border-slate-800 flex items-center gap-2 px-1 overflow-hidden">
                      <div className="h-3.5 flex-1 rounded bg-purple-600/25 border border-purple-500/40 text-[8px] text-purple-200 flex items-center px-1 font-semibold truncate">
                        🎙️ Studio AI Voiceover (Antoni)
                      </div>
                      <div className="h-3.5 w-16 rounded bg-sky-600/25 border border-sky-500/40 text-[8px] text-sky-200 flex items-center justify-center font-bold">
                        ⚡ Whoosh.wav
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── SMOOTH MARQUEE TICKER ── */}
        <section className="vx-landing-ticker relative z-10 py-5 border-y border-slate-200/80 bg-white overflow-hidden select-none">
          <div className="flex gap-4 whitespace-nowrap overflow-hidden">
            <div className="vx-marquee-left flex gap-6 shrink-0 items-center text-xs font-semibold text-slate-700 font-mono tracking-tight">
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

          <div className="flex gap-4 whitespace-nowrap overflow-hidden mt-3">
            <div className="vx-marquee-right flex gap-6 shrink-0 items-center text-xs font-semibold text-slate-700 font-mono tracking-tight">
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

        {/* ── WHAT KREOVAR DOES: THE 4 CORE PILLARS ── */}
        <section className="relative z-10 py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
          <div className="text-center max-w-2xl mx-auto mb-16 space-y-3">
            <div className="inline-flex items-center gap-1.5 text-xs font-mono font-semibold uppercase tracking-wider text-blue-600 bg-blue-50 px-3 py-1 rounded-full border border-blue-200/60">
              Complete Creator Suite
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900">
              Everything You Need to Edit Viral Short Videos
            </h2>
            <p className="text-sm sm:text-base text-slate-500">
              Stop juggling 4 different tools. Kreovar unites professional timeline editing with AI automation.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Feature 1: Multi-Track Timeline */}
            <div className="vx-landing-card bg-white rounded-3xl border border-slate-200 p-8 flex flex-col justify-between shadow-xs hover:shadow-md hover:border-slate-300 transition-all">
              <div className="space-y-4">
                <div className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-200/60 flex items-center justify-center text-blue-600 shadow-2xs">
                  <Film className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 tracking-tight">
                  CapCut-Grade Multi-Track Timeline
                </h3>
                <p className="text-sm text-slate-600 leading-relaxed">
                  Full non-linear video editing right in your web browser. Trim, split, ripple edit, and arrange multiple
                  video, audio, and caption tracks. Switch between 9:16 portrait (Reels/Shorts/TikTok) and 16:9 widescreen with one click.
                </p>
                <ul className="space-y-2 pt-2 text-xs text-slate-600 font-medium">
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Multi-track layering with smooth drag-and-drop</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Aspect ratio switcher (9:16 portrait &amp; 16:9 landscape)</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Export crisp 1080p MP4 videos up to 60 seconds</span>
                  </li>
                </ul>
              </div>
            </div>

            {/* Feature 2: Kinetic Captions */}
            <div className="vx-landing-card bg-white rounded-3xl border border-slate-200 p-8 flex flex-col justify-between shadow-xs hover:shadow-md hover:border-slate-300 transition-all">
              <div className="space-y-4">
                <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200/60 flex items-center justify-center text-amber-600 shadow-2xs">
                  <Type className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 tracking-tight">
                  Viral Word-by-Word Animated Captions
                </h3>
                <p className="text-sm text-slate-600 leading-relaxed">
                  85% of social media feeds are watched on mute. Kreovar generates timed word-by-word captions
                  with Alex Hormozi style pop animations, dynamic highlight colors, custom typography, and instant SRT export.
                </p>
                <ul className="space-y-2 pt-2 text-xs text-slate-600 font-medium">
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Alex Hormozi, Beast, Minimal &amp; Gradient animation presets</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Full text editing, word timing fine-tuning &amp; positioning</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Download standalone SRT / TXT or bake directly into video</span>
                  </li>
                </ul>
              </div>
            </div>

            {/* Feature 3: Studio AI Voiceovers */}
            <div className="vx-landing-card bg-white rounded-3xl border border-slate-200 p-8 flex flex-col justify-between shadow-xs hover:shadow-md hover:border-slate-300 transition-all">
              <div className="space-y-4">
                <div className="w-12 h-12 rounded-2xl bg-purple-50 border border-purple-200/60 flex items-center justify-center text-purple-600 shadow-2xs">
                  <Mic className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 tracking-tight">
                  Studio-Quality AI Voiceovers
                </h3>
                <p className="text-sm text-slate-600 leading-relaxed">
                  No microphone or recording studio? Paste your script into Voice Studio and generate natural,
                  human-sounding voiceovers with nuanced pacing, emotion, and adjustable playback speeds.
                </p>
                <ul className="space-y-2 pt-2 text-xs text-slate-600 font-medium">
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Multiple realistic studio narrator voices</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Adjustable narration pacing (0.8x to 1.3x speed)</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>One-click addition to video timeline or audio MP3 download</span>
                  </li>
                </ul>
              </div>
            </div>

            {/* Feature 4: Edit With AI */}
            <div className="vx-landing-card bg-white rounded-3xl border border-slate-200 p-8 flex flex-col justify-between shadow-xs hover:shadow-md hover:border-slate-300 transition-all">
              <div className="space-y-4">
                <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-200/60 flex items-center justify-center text-emerald-600 shadow-2xs">
                  <Wand2 className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 tracking-tight">
                  Natural-Language AI Editing Assistant
                </h3>
                <p className="text-sm text-slate-600 leading-relaxed">
                  Tell Kreovar what to edit in plain English: &quot;Cut all dead silences, add punch-in zooms on the jokes,
                  and add whoosh sound effects.&quot; Kreovar plans, previews, and applies changes in stages with full Undo control.
                </p>
                <ul className="space-y-2 pt-2 text-xs text-slate-600 font-medium">
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Automated silence trimmer &amp; punch-in zoom keyframing</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Curated royalty-free B-roll and sound effect engine</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Staged execution with reviewable previews and instant undo</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* ── VALUE COMPARISON: WHY CREATORS CHOOSE KREOVAR ── */}
        <section className="relative z-10 py-16 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto">
          <div className="rounded-3xl bg-slate-900 text-white p-8 sm:p-12 border border-slate-800 shadow-xl space-y-8">
            <div className="text-center max-w-2xl mx-auto space-y-3">
              <span className="text-xs font-mono font-semibold uppercase tracking-wider text-blue-400 bg-blue-950/80 px-3 py-1 rounded-full border border-blue-800/60">
                Unbeatable Creator Value
              </span>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
                One Studio Replaces 4 Separate Subscriptions
              </h2>
              <p className="text-sm text-slate-300">
                Stop paying for multiple tools and switching between tabs just to produce one short video.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Old Way */}
              <div className="p-6 rounded-2xl bg-slate-950/60 border border-rose-500/30 space-y-4">
                <div className="text-rose-400 font-bold text-sm uppercase tracking-wider flex items-center gap-2">
                  <span>✕ The Old Fragmented Stack</span>
                </div>
                <div className="space-y-2 text-xs text-slate-300">
                  <div className="flex justify-between py-1.5 border-b border-slate-800">
                    <span>Desktop Video Editing Software</span>
                    <span className="font-mono text-slate-400">$20 / mo</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-slate-800">
                    <span>AI Voiceover Generation Subscription</span>
                    <span className="font-mono text-slate-400">$22 / mo</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-slate-800">
                    <span>Auto-Caption &amp; Subtitle Tool</span>
                    <span className="font-mono text-slate-400">$16 / mo</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-slate-800">
                    <span>Stock Footage &amp; Sound Library</span>
                    <span className="font-mono text-slate-400">$30 / mo</span>
                  </div>
                </div>
                <div className="pt-2 flex justify-between font-bold text-sm text-rose-300 border-t border-rose-500/20">
                  <span>Total Monthly Cost:</span>
                  <span className="font-mono text-base">$88+ / month</span>
                </div>
              </div>

              {/* Kreovar Way */}
              <div className="p-6 rounded-2xl bg-blue-950/40 border border-blue-500/40 space-y-4 relative overflow-hidden">
                <div className="absolute top-2 right-2 px-2.5 py-0.5 rounded-full bg-blue-500 text-white text-[10px] font-bold">
                  ALL-IN-ONE
                </div>
                <div className="text-emerald-400 font-bold text-sm uppercase tracking-wider flex items-center gap-2">
                  <span>✓ The Kreovar Way</span>
                </div>
                <div className="space-y-2 text-xs text-slate-200">
                  <div className="flex items-center gap-2 py-1.5 border-b border-blue-900/40">
                    <Check className="w-4 h-4 text-emerald-400" />
                    <span>CapCut-grade Multi-Track Web Timeline</span>
                  </div>
                  <div className="flex items-center gap-2 py-1.5 border-b border-blue-900/40">
                    <Check className="w-4 h-4 text-emerald-400" />
                    <span>Kinetic Word-by-Word Alex Hormozi Captions</span>
                  </div>
                  <div className="flex items-center gap-2 py-1.5 border-b border-blue-900/40">
                    <Check className="w-4 h-4 text-emerald-400" />
                    <span>Realistic Studio AI Voiceovers &amp; Scripts</span>
                  </div>
                  <div className="flex items-center gap-2 py-1.5 border-b border-blue-900/40">
                    <Check className="w-4 h-4 text-emerald-400" />
                    <span>Curated B-Roll, SFX &amp; Prompt-to-Edit AI</span>
                  </div>
                </div>
                <div className="pt-2 flex justify-between font-bold text-sm text-emerald-400 border-t border-blue-800/40">
                  <span>Kreovar Pro:</span>
                  <span className="font-mono text-lg text-white">Just $9 / month</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── PRICING SECTION: 1-MONTH IS $9, YEARLY IS $90 ── */}
        <section id="pricing" className="relative z-10 py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
          <div className="text-center max-w-2xl mx-auto space-y-3 mb-12">
            <div className="inline-flex items-center gap-1.5 text-xs font-mono font-semibold uppercase tracking-wider text-blue-600 bg-blue-50 px-3 py-1 rounded-full border border-blue-200/60">
              Simple, Transparent Pricing
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900">
              Start Free. Upgrade for Just $9.
            </h2>
            <p className="text-sm sm:text-base text-slate-500">
              No hidden fees, no watermark lockouts. Scale your content engine on your terms.
            </p>

            {/* Monthly / Yearly Toggle */}
            <div className="pt-4 flex items-center justify-center">
              <div className="inline-flex items-center p-1 rounded-full bg-slate-100 border border-slate-200 shadow-2xs">
                <button
                  type="button"
                  onClick={() => setBillingCycle("monthly")}
                  className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all cursor-pointer ${
                    billingCycle === "monthly"
                      ? "bg-white text-slate-900 shadow-2xs font-bold"
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
                      ? "bg-white text-slate-900 shadow-2xs font-bold"
                      : "text-slate-500 hover:text-slate-900"
                  }`}
                >
                  <span>Yearly</span>
                  <span className="px-1.5 py-0.2 bg-emerald-100 text-emerald-700 text-[10px] font-semibold rounded-full">
                    Save 17% (2 Mo Free)
                  </span>
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-3xl mx-auto">
            {/* Free Plan */}
            <div className="bg-white rounded-3xl border border-slate-200 p-8 flex flex-col justify-between hover:border-slate-300 transition-all shadow-xs">
              <div className="space-y-6">
                <div>
                  <h3 className="text-xl font-bold text-slate-900">Free</h3>
                  <div className="mt-3 flex items-baseline gap-1">
                    <span className="text-4xl font-extrabold text-slate-900 tracking-tight">
                      {PLANS.free.displayPrice}
                    </span>
                    <span className="text-xs text-slate-500">/month</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">Monthly allowances to test the editor</p>
                </div>

                <div className="space-y-3 pt-4 border-t border-slate-100">
                  <ul className="space-y-3">
                    {PLANS.free.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2.5 text-xs text-slate-600">
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
                  className="w-full py-3 px-4 rounded-xl border border-slate-300 hover:bg-slate-50 text-slate-900 font-semibold text-xs sm:text-sm flex items-center justify-center transition-colors shadow-2xs"
                >
                  {isAuthed ? "Go to Projects" : "Start Free"}
                </Link>
              </div>
            </div>

            {/* Pro Plan ($9 / mo or $90 / yr) */}
            <div className="relative bg-white rounded-3xl border-2 border-slate-900 p-8 flex flex-col justify-between shadow-xl">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3.5 py-0.5 rounded-full bg-blue-600 text-white text-[10px] font-bold tracking-wide uppercase shadow-sm">
                LAUNCH SPECIAL
              </div>

              <div className="space-y-6">
                <div>
                  <div className="flex items-center justify-between">
                    <h3 className="text-xl font-bold text-slate-900">Pro</h3>
                    <span className="text-[11px] font-mono text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full font-bold">
                      Full Access
                    </span>
                  </div>
                  <div className="mt-3 flex items-baseline gap-1">
                    <span className="text-4xl font-extrabold text-slate-900 tracking-tight">
                      {billingCycle === "yearly" ? PLANS.pro.yearlyDisplayPrice : PLANS.pro.displayPrice}
                    </span>
                    <span className="text-xs text-slate-500 font-medium">
                      /{billingCycle === "yearly" ? "year" : "month"}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    {billingCycle === "yearly"
                      ? "$90 billed annually ($7.50/mo equivalent)"
                      : "$9 billed monthly · cancel anytime"}
                  </p>
                </div>

                <div className="space-y-3 pt-4 border-t border-slate-100">
                  <ul className="space-y-3">
                    {PLANS.pro.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2.5 text-xs text-slate-600">
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
                  className="w-full py-3 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs sm:text-sm flex items-center justify-center gap-1.5 transition-all shadow-md group"
                >
                  <span>Upgrade to Pro</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* ── PRODUCT QUESTIONS & ANSWERS (FAQ) ── */}
        <PublicAnswers />

        {/* ── TOOL GUIDES & EXPLORE SECTION ── */}
        <section aria-labelledby="explore-studio-tools" className="relative z-10 mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="max-w-2xl mb-8 space-y-2">
            <h2 id="explore-studio-tools" className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
              Explore Kreovar Features
            </h2>
            <p className="text-sm text-slate-600">
              Deep dive into individual studio workflows, caption styles, and voice tools.
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {FEATURE_PAGES.map((page) => (
              <Link
                key={page.path}
                href={page.path}
                className="vx-landing-card group rounded-3xl border border-slate-200 bg-white p-7 transition-all hover:border-blue-400 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600"
              >
                <h3 className="text-lg font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                  {page.label}
                </h3>
                <p className="mt-2 text-xs sm:text-sm leading-relaxed text-slate-600">
                  {page.description}
                </p>
                <span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-blue-600 group-hover:translate-x-0.5 transition-transform">
                  Explore {page.label} →
                </span>
              </Link>
            ))}
          </div>
        </section>

        {/* ── FINAL FOCUSED CONVERSION BANNER (NO DUPLICATE BUTTONS) ── */}
        <section className="relative z-10 py-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
          <div className="relative bg-slate-900 text-white rounded-3xl p-8 sm:p-14 text-center overflow-hidden shadow-2xl border border-slate-800">
            <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[700px] h-[350px] bg-blue-600/20 rounded-full blur-3xl pointer-events-none" />

            <div className="relative z-10 max-w-2xl mx-auto space-y-6">
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight">
                Ready to Scale Your Video Content?
              </h2>
              <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
                Join creators producing high-retention short videos in minutes.
                Bring your ideas, clips, voiceovers, and captions together in Kreovar today.
              </p>

              {/* Single High-Converting CTA Button */}
              <div className="flex items-center justify-center pt-2">
                <Link
                  href={isAuthed ? "/projects" : "/signup"}
                  className="w-full sm:w-auto px-8 py-3.5 rounded-xl bg-white text-slate-950 font-bold text-sm hover:bg-slate-100 transition-all shadow-lg hover:scale-105 duration-200 flex items-center justify-center gap-2 group"
                >
                  <span>{isAuthed ? "Create New Video" : "Start Creating Free"}</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </Link>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-6 text-xs text-slate-400 pt-2 font-mono">
                <span>✓ Instant Setup</span>
                <span>•</span>
                <span>✓ Full 1080p Export</span>
                <span>•</span>
                <span>✓ Cancel Anytime</span>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* ── FOOTER ── */}
      <footer className="vx-landing-footer relative z-10 border-t border-slate-200 bg-white py-12 text-xs text-slate-500 font-sans">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2.5">
            <BrandMark size={24} />
            <span className="font-bold text-slate-900 text-sm">Kreovar</span>
            <span className="text-slate-300">|</span>
            <span className="text-slate-500">AI Video Studio &amp; Content Creation</span>
          </div>

          <div className="flex flex-wrap items-center gap-6 font-medium text-slate-600">
            <Link href="/how-to-use" className="hover:text-slate-900 transition-colors">
              How to Use
            </Link>
            <Link href="/pricing" className="hover:text-slate-900 transition-colors">
              Pricing
            </Link>
            <Link href="/faq" className="hover:text-slate-900 transition-colors">
              FAQ
            </Link>
            <Link href="/about" className="hover:text-slate-900 transition-colors">
              About
            </Link>
            <Link href="/contact" className="hover:text-slate-900 transition-colors">
              Contact
            </Link>
          </div>

          <div className="text-slate-600 font-mono text-[11px]">
            © {new Date().getFullYear()} Kreovar. All rights reserved.
          </div>
        </div>

        <nav aria-label="Content creation tools" className="mx-auto mt-6 flex max-w-7xl flex-wrap gap-5 px-4 text-sm">
          {FEATURE_PAGES.map((page) => (
            <Link key={page.path} href={page.path} className="hover:text-slate-900 hover:underline">
              {page.label}
            </Link>
          ))}
        </nav>

        <div className="mx-auto mt-6 max-w-7xl px-4">
          <LegalLinks />
        </div>
      </footer>
    </div>
  );
}
