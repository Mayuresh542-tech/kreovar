"use client";
import StudioShell from "../components/StudioShell";
import AuthLoadingScreen from "../components/AuthLoadingScreen";
import AssetLibraryPanel from "../components/assets/AssetLibraryPanel";
import { useStudioAuth as useAuthGate } from "../lib/useStudioAuth";

export default function AssetsPage() {
  const { status } = useAuthGate();
  if (status !== "authed") return <AuthLoadingScreen label="Loading Asset Library…" />;
  return (
    <StudioShell active="assets">
      <div className="space-y-6 pb-10">
        <div className="vx-frosted-surface rounded-2xl p-5 sm:p-6 space-y-1.5">
          <span className="inline-flex items-center rounded-full bg-blue-50 border border-blue-200/80 px-3 py-0.5 text-[10px] font-mono font-semibold uppercase tracking-wider text-[#1D4FB1]">
            Media Vault
          </span>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#142440]">Asset Library</h1>
          <p className="text-xs sm:text-sm text-[#52647e]">All your uploaded footage, voiceovers, captions, thumbnails, and saved graphics in one studio vault.</p>
        </div>
        <AssetLibraryPanel />
      </div>
    </StudioShell>
  );
}
