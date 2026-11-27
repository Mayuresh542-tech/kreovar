"use client";
import StudioShell from "../components/StudioShell";
import AuthLoadingScreen from "../components/AuthLoadingScreen";
import MotionLibrary from "../components/assets/MotionLibrary";
import CreatorObject3D from "../components/3d/CreatorObject3D";
import { useStudioAuth as useAuthGate } from "../lib/useStudioAuth";

export default function MotionPage() {
  const { status } = useAuthGate();
  if (status !== "authed") return <AuthLoadingScreen label="Loading motion graphics…" />;
  return (
    <StudioShell active="motion-graphics">
      <div className="space-y-6 pb-10">
        <div className="vx-frosted-surface rounded-3xl p-5 sm:p-7 grid gap-6 lg:grid-cols-12 lg:items-center">
          <div className="lg:col-span-7 space-y-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 border border-blue-200/80 px-3 py-1 text-[11px] font-mono font-semibold uppercase tracking-wider text-[#1D4FB1]">
              Motion Studio
            </span>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#142440]">
              Motion Graphics Library
            </h1>
            <p className="text-sm text-[#52647e] max-w-xl">
              Preview Kreovar&apos;s animated Canvas2D overlays in real time or search animated stock clips for your timeline.
            </p>
          </div>
          <div className="lg:col-span-5">
            <div className="vx-3d-viewport h-44 sm:h-48">
              <CreatorObject3D variant="director-slate" height={192} />
            </div>
          </div>
        </div>
        <MotionLibrary />
      </div>
    </StudioShell>
  );
}
