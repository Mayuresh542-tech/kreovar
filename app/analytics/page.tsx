"use client";

import StudioShell from "../components/StudioShell";
import AuthLoadingScreen from "../components/AuthLoadingScreen";
import { useAuthGate } from "../lib/useAuthGate";
import ComingSoonState from "../components/ComingSoonState";

export default function AnalyticsPage() {
  const { status } = useAuthGate();

  if (status !== "authed") {
    return <AuthLoadingScreen label="Loading creator performance analytics…" />;
  }

  const analyticsFeatures = [
    {
      title: "1. Cross-Platform Video Performance",
      description: "Aggregate view velocity, retention curves, and engagement benchmarks across YouTube and TikTok.",
      badge: "PLANNED",
      icon: "📊",
    },
    {
      title: "2. Predictive Trend Attribution",
      description: "See exactly which early trend radar signals generated the highest creator ROI.",
      badge: "IN DEVELOPMENT",
      icon: "📈",
    },
    {
      title: "3. Retention & Hook Diagnostics",
      description: "AI analysis identifying where audience drop-off occurs and how to optimize subsequent hooks.",
      badge: "FUTURE RELEASE",
      icon: "🎯",
    },
  ];

  return (
    <StudioShell active="analytics">
      <div className="max-w-5xl mx-auto w-full py-6 flex items-center justify-center">
        <ComingSoonState
          title="Creator Performance &amp; Video Analytics"
          badge="COMING SOON • IN ACTIVE PIPELINE"
          headline="Creator performance &amp; video analytics is coming soon."
          description="Track cross-platform view velocity, audience retention curves, and trend attribution in one unified telemetry dashboard. In this MVP release, use our live Trend Finder and Competitor Intelligence to discover viral opportunities."
          features={analyticsFeatures}
          primaryActionLabel="🔥 Explore Trending Topics"
          primaryActionHref="/trends"
          secondaryActionLabel="📡 Open Trend Radar"
          secondaryActionHref="/alerts"
        />
      </div>
    </StudioShell>
  );
}
