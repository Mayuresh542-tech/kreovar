"use client";

import StudioShell from "../components/StudioShell";
import AuthLoadingScreen from "../components/AuthLoadingScreen";
import { useAuthGate } from "../lib/useAuthGate";
import ComingSoonState from "../components/ComingSoonState";

export default function PlannerPage() {
  const { status } = useAuthGate();

  if (status !== "authed") {
    return <AuthLoadingScreen label="Loading content planner…" />;
  }

  const plannerFeatures = [
    {
      title: "1. Cross-Platform Content Calendar",
      description: "Visual weekly and monthly calendar to organize upcoming YouTube, TikTok, and Instagram drops.",
      badge: "PLANNED",
      icon: "📅",
    },
    {
      title: "2. Automated Publishing Queue",
      description: "Direct scheduled publishing to supported platforms with custom captions and tags.",
      badge: "FUTURE RELEASE",
      icon: "🚀",
    },
    {
      title: "3. Trend Timing & Peak Alert Sync",
      description: "Automated recommendations on when to publish based on real-time trend velocity peaks.",
      badge: "IN DEVELOPMENT",
      icon: "⏱️",
    },
  ];

  return (
    <StudioShell active="planner">
      <div className="max-w-5xl mx-auto w-full py-6 flex items-center justify-center">
        <ComingSoonState
          title="Content Calendar &amp; Publishing Schedule"
          badge="COMING SOON • IN ACTIVE PIPELINE"
          headline="Content calendar &amp; auto-scheduling is coming soon."
          description="Organize your multi-platform distribution and schedule drops when trend momentum is highest. In this MVP release, use the Trend Finder and Gemini Content Kit to generate high-performing hooks and scripts."
          features={plannerFeatures}
          primaryActionLabel="🔥 Explore Trending Topics"
          primaryActionHref="/trends"
          secondaryActionLabel="📡 Open Trend Radar"
          secondaryActionHref="/alerts"
        />
      </div>
    </StudioShell>
  );
}
