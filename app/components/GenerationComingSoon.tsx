"use client";
import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, ImageIcon, Video } from "lucide-react";
import StudioShell from "./StudioShell";
import AuthLoadingScreen from "./AuthLoadingScreen";
import { useAuthGate } from "../lib/useAuthGate";

export default function GenerationComingSoon({ kind }: { kind: "thumbnail" | "video" }) {
  const { status } = useAuthGate();
  const router = useRouter();
  useEffect(() => { if (status === "unauthed") router.replace("/login"); }, [status, router]);
  if (status !== "authed") return <AuthLoadingScreen label="Loading studio…" />;
  const isThumbnail = kind === "thumbnail";
  const Icon = isThumbnail ? ImageIcon : Video;
  const title = isThumbnail ? "Thumbnail Generation" : "Video Generation";
  return (
    <StudioShell active={isThumbnail ? "thumbnails" : "create"}>
      <div className="max-w-5xl mx-auto py-6">
        <div className="bg-white border border-slate-200 rounded-2xl p-8 sm:p-12 text-center space-y-5">
          <div className="w-14 h-14 rounded-2xl bg-slate-100 text-slate-900 flex items-center justify-center mx-auto"><Icon className="w-7 h-7" aria-hidden="true" /></div>
          <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600"><Sparkles className="w-3.5 h-3.5" aria-hidden="true" />Coming soon</span>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900">{title}</h1>
          <p className="text-sm sm:text-base text-slate-500 max-w-lg mx-auto">{title} is coming soon. You can explore the rest of your creator workspace while we prepare this feature.</p>
          <div className="flex flex-wrap justify-center gap-3 pt-2">
            <Link href="/editor" className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800 transition-colors">Open editor</Link>
            <Link href="/dashboard" className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors">Back to dashboard</Link>
          </div>
        </div>
      </div>
    </StudioShell>
  );
}
