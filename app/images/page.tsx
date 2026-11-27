"use client";
import StudioShell from "../components/StudioShell";
import AuthLoadingScreen from "../components/AuthLoadingScreen";
import ImageGenerator from "../components/assets/ImageGenerator";
import { useStudioAuth as useAuthGate } from "../lib/useStudioAuth";

export default function ImagesPage() {
  const { status } = useAuthGate();
  if (status !== "authed") return <AuthLoadingScreen label="Loading Images…" />;
  return (
    <StudioShell active="images">
      <div className="max-w-4xl space-y-6 pb-10">
        <div className="vx-frosted-surface rounded-2xl p-5 sm:p-6 space-y-1.5">
          <span className="inline-flex items-center rounded-full bg-blue-50 border border-blue-200/80 px-3 py-0.5 text-[10px] font-mono font-semibold uppercase tracking-wider text-[#1D4FB1]">
            Visual Studio
          </span>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#142440]">AI Image Studio</h1>
          <p className="text-xs sm:text-sm text-[#52647e]">Generate custom frames and visuals inside Kreovar&apos;s frosted studio workspace.</p>
        </div>
        <ImageGenerator />
      </div>
    </StudioShell>
  );
}
