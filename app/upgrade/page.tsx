"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function UpgradeRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/pricing");
  }, [router]);

  return (
    <div className="min-h-screen bg-[#08090C] flex items-center justify-center">
      <div className="flex items-center gap-3 text-slate-400 font-mono text-xs">
        <span className="w-4 h-4 border-2 border-sky-400 border-t-transparent rounded-full animate-spin" />
        <span>Redirecting to Pricing Plans…</span>
      </div>
    </div>
  );
}
