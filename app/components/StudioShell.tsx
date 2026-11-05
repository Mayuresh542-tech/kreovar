"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import DashboardAnnouncements from "./DashboardAnnouncements";
import LegalLinks from "./LegalLinks";
import Sidebar, { ActiveNav } from "./Sidebar";
import TopHeader from "./dashboard/TopHeader";
import { useAlertCount } from "../lib/alerts";
import { supabase } from "../lib/supabase";

interface StudioShellProps {
  active: ActiveNav | string;
  children: React.ReactNode;
  headerAction?: React.ReactNode;
  onCreateClick?: () => void;
  onBrandKitClick?: () => void;
}

export default function StudioShell({
  active,
  children,
  onCreateClick,
}: StudioShellProps) {
  const router = useRouter();
  const alertCount = useAlertCount();
  const [mobileOpen, setMobileOpen] = useState(false);
  const closeMobile = useCallback(() => setMobileOpen(false), []);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userPlan, setUserPlan] = useState<string>("Free Plan");

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!cancelled && data.session?.user) {
        setUserEmail(data.session.user.email ?? null);
        try {
          const res = await fetch("/api/billing", {
            headers: { Authorization: `Bearer ${data.session.access_token}` },
          });
          if (res.ok) {
            const bData = await res.json();
            if (!cancelled && bData?.subscription?.planName) {
              setUserPlan(`${bData.subscription.planName} Plan`);
            }
          }
        } catch {
          // ignore
        }
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const pathname = usePathname();
  const userName = userEmail
    ? userEmail.split("@")[0].charAt(0).toUpperCase() + userEmail.split("@")[0].slice(1)
    : "Your account";

  return (
    <div className="vx-shell vx-glass-shell flex h-dvh bg-[#FAFAFA] text-[#0F172A] font-sans overflow-hidden">
      {/* 1. Unified Master Sidebar (240px) */}
      <Sidebar
        active={active}
        mobileOpen={mobileOpen}
        onMobileClose={closeMobile}
        onCreateClick={onCreateClick || (() => router.push("/projects?new=1"))}
      />

      {/* 2. Main Content Stage + Top Header */}
      <div inert={mobileOpen || undefined} className="vx-studio-stage flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        <TopHeader
          onMobileMenuToggle={() => setMobileOpen((prev) => !prev)}
          mobileMenuOpen={mobileOpen}
          alertCount={alertCount}
          userName={userName}
          userRole={userPlan}
        />

        {/* Global Scrollable Workspace */}
        <main className="vx-workspace flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-6 md:p-8 lg:p-10 relative">
          <div key={pathname} className="vx-route-entry max-w-6xl mx-auto w-full">
            {["/projects","/dashboard"].includes(pathname) && <DashboardAnnouncements/>}
            {children}
            <footer className="mt-10 border-t border-slate-200 pt-5"><LegalLinks/></footer>
          </div>
        </main>
      </div>
    </div>
  );
}
