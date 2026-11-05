"use client";
import BrandMark from "./BrandMark";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  LayoutDashboard,
  FolderKanban,
  Film,
  TrendingUp,
  Mic,
  Video,
  Image as ImageIcon,
  Type,
  Settings,
  CreditCard,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import { isAdminEmail } from "../lib/admin";
import {
  overlayVariants,
  sidebarDrawerVariants,
} from "../lib/motion";

export type ActiveNav =
  | "dashboard"
  | "create"
  | "projects"
  | "editor"
  | "trends"
  | "raw-footage"
  | "ideas"
  | "script"
  | "voice"
  | "broll"
  | "thumbnails"
  | "captions"
  | "templates"
  | "settings"
  | "billing"
  | "admin"
  | string;

export interface SidebarProps {
  active?: ActiveNav;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
  onCreateClick?: () => void;
  onBrandKitClick?: () => void;
  onTabChange?: (tab: string) => void;
}

interface NavItemDef {
  id: string;
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
  onClick?: () => void;
}

export default function Sidebar({
  active,
  mobileOpen = false,
  onMobileClose,
  onCreateClick,
  onTabChange,
}: SidebarProps) {
  const drawerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!mobileOpen) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const drawer = drawerRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const items = () => Array.from(drawer?.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),[tabindex="0"]') || []).filter(item => item.getClientRects().length);
    items()[0]?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onMobileClose?.(); }
      if (event.key !== "Tab") return;
      const list = items(), first = list[0], last = list[list.length - 1];
      if (!first) return;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    const breakpoint = window.matchMedia("(min-width:1024px)");
    const resize = () => { if (breakpoint.matches) onMobileClose?.(); };
    window.addEventListener("keydown", key);
    breakpoint.addEventListener("change", resize);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", key);
      breakpoint.removeEventListener("change", resize);
      previous?.focus();
    };
  }, [mobileOpen, onMobileClose]);
  const router = useRouter();
  const pathname = usePathname();
  const [isAdmin, setIsAdmin] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userPlan, setUserPlan] = useState<string>("Free Plan");

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!cancelled && data.session?.user) {
        const email = data.session.user.email ?? null;
        setUserEmail(email);
        setIsAdmin(isAdminEmail(email));

        // Fetch plan
        try {
          const res = await fetch("/api/billing", {
            headers: { Authorization: `Bearer ${data.session.access_token}` },
          });
          if (res.ok) {
            const bData = await res.json();
            if (!cancelled && bData?.plan?.name) {
              setUserPlan(`${bData.plan.name} Plan`);
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

  // Determine current active item based on prop or pathname
  const currentNavRaw = (active || (() => {
    if (pathname.startsWith("/editor")) return "editor";
    if (pathname.startsWith("/create")) return "create";
    if (pathname.startsWith("/projects")) return "projects";
    if (pathname.startsWith("/trends")) return "trends";
    if (pathname.startsWith("/raw-footage")) return "raw-footage";
    if (pathname.startsWith("/ideas")) return "ideas";
    if (pathname.startsWith("/script")) return "script";
    if (pathname.startsWith("/voice")) return "voice";
    if (pathname.startsWith("/broll")) return "broll";
    if (pathname.startsWith("/thumbnails")) return "thumbnails";
    if (pathname.startsWith("/caption-templates")) return "caption-templates";
    if (pathname.startsWith("/captions")) return "captions";
    if (pathname.startsWith("/templates")) return "templates";
    if (pathname.startsWith("/settings/billing") || pathname.startsWith("/upgrade")) return "billing";
    if (pathname.startsWith("/settings")) return "settings";
    if (pathname.startsWith("/admin")) return "admin";
    return "dashboard";
  })()).toLowerCase();

  const currentNav=["trends","ideas","script"].includes(currentNavRaw)?"workflow":currentNavRaw;

  const mainNavItems: NavItemDef[] = [
    {
      id: "dashboard",
      label: "Dashboard",
      href: "/dashboard",
      icon: LayoutDashboard,
    },
    {
      id: "create",
      label: "New Project",
      href: "/projects?new=1",
      icon: Sparkles,
    },
    {
      id: "projects",
      label: "Projects",
      href: "/projects",
      icon: FolderKanban,
    },
    {
      id: "editor",
      label: "Video Editor",
      href: "/editor",
      icon: Film,
    },
  ];

  mainNavItems.push({id:"assets",label:"Asset Library",href:"/assets",icon:FolderKanban});

  if (process.env.NEXT_PUBLIC_REFERENCE_PRESETS_ENABLED === "true") mainNavItems.push({id:"preset-editor",label:"Reference Presets",href:"/preset-editor",icon:Sparkles});
  const creationTools: NavItemDef[] = [
    {id:"workflow",label:"Content Workflow",href:"/trends",icon:TrendingUp},
    {id:"images",label:"AI Images",href:"/images",icon:ImageIcon},
    {id:"motion-graphics",label:"Motion Graphics",href:"/motion-graphics",icon:Video},
    {id:"sfx",label:"Sound Effects",href:"/sfx",icon:Mic},
    {
      id: "voice",
      label: "AI Voice Studio",
      href: "/voice",
      icon: Mic,
    },
    {
      id: "broll",
      label: "B-Roll Cutaways",
      href: "/broll",
      icon: Film,
    },
    {
      id: "captions",
      label: "Captions Studio",
      href: "/captions",
      icon: Type,
    },
  ];

  const secondaryNavItems: NavItemDef[] = [
    {
      id: "settings",
      label: "Settings",
      href: "/settings",
      icon: Settings,
    },
    {
      id: "billing",
      label: "Billing",
      href: "/settings/billing",
      icon: CreditCard,
    },
  ];

  if (isAdmin) {
    secondaryNavItems.push({
      id: "admin",
      label: "Admin",
      href: "/admin",
      icon: ShieldAlert,
    });
  }

  const displayName = userEmail
    ? userEmail.split("@")[0].charAt(0).toUpperCase() + userEmail.split("@")[0].slice(1)
    : "Your account";

  const sidebarContent = (
    <aside data-vx-motion="left" className="vx-studio-sidebar w-60 shrink-0 h-full bg-white border-r border-slate-200 flex flex-col justify-between p-3.5 select-none z-30">
      {/* Top: Brand Header & Scrollable Navigations */}
      <div className="space-y-5 overflow-y-auto pr-1">
        {/* Veelox Brand Header */}
        <Link href="/dashboard" className="flex items-center gap-2.5 px-2 py-1 group">
          <BrandMark size={28}/>
          <span className="font-heading text-base font-bold tracking-tight text-slate-900 group-hover:text-blue-600 transition-colors">
            Kreovar
          </span>
        </Link>

        {/* Primary Navigation */}
        <nav aria-label="Workspace" className="space-y-0.5">
          {mainNavItems.map((item) => {
            const isActive = currentNav === item.id;
            const Icon = item.icon;

            return (
              <Link
                key={item.id}
                href={item.href}
                onClick={(e) => {
                  if (item.onClick) {
                    e.preventDefault();
                    item.onClick();
                  }
                  onTabChange?.(item.id);
                  onMobileClose?.();
                }}
                aria-current={isActive ? "page" : undefined}
                className={`vx-studio-nav-item flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs transition-colors duration-150 ${
                  isActive
                    ? "bg-slate-900 text-white font-medium"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-50 font-normal"
                }`}
              >
                <Icon
                  className={`w-3.5 h-3.5 shrink-0 transition-colors ${
                    isActive ? "text-white" : "text-slate-400 group-hover:text-slate-600"
                  }`}
                />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Modular Creation Tools Section */}
        <div className="space-y-1">
          <div className="px-2.5 vx-nav-section-label text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
            Create Tools
          </div>
          <nav aria-label="Creation tools" className="space-y-0.5">
            {creationTools.map((item) => {
              const isActive = currentNav === item.id;
              const Icon = item.icon;

              return (
                <Link
                  key={item.id}
                  href={item.href}
                  onClick={() => {
                    onTabChange?.(item.id);
                    onMobileClose?.();
                  }}
                  aria-current={isActive ? "page" : undefined}
                className={`vx-studio-nav-item flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs transition-colors duration-150 ${
                    isActive
                      ? "bg-blue-50 text-blue-700 font-semibold border border-blue-200/60"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-50 font-normal"
                  }`}
                >
                  <Icon
                    className={`w-3.5 h-3.5 shrink-0 transition-colors ${
                      isActive ? "text-blue-600" : "text-slate-400 group-hover:text-slate-600"
                    }`}
                  />
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Divider */}
        <div className="border-t border-slate-100 my-1" />

        {/* Secondary Navigation */}
        <nav aria-label="Account" className="space-y-0.5">
          {secondaryNavItems.map((item) => {
            const isActive = currentNav === item.id;
            const Icon = item.icon;

            return (
              <Link
                key={item.id}
                href={item.href}
                onClick={() => {
                  onTabChange?.(item.id);
                  onMobileClose?.();
                }}
                aria-current={isActive ? "page" : undefined}
                className={`vx-studio-nav-item flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs transition-colors duration-150 ${
                  isActive
                    ? "bg-slate-100 text-slate-900 font-medium"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-50 font-normal"
                }`}
              >
                <Icon
                  className={`w-3.5 h-3.5 shrink-0 transition-colors ${
                    isActive ? "text-slate-900" : "text-slate-400 group-hover:text-slate-600"
                  }`}
                />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Bottom: User Profile */}
      <div className="pt-2 border-t border-slate-100">
        <Link
          href="/settings/billing"
          className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-slate-50 transition-colors group"
        >
          <div className="w-7 h-7 rounded-full bg-slate-200 border border-slate-300 flex items-center justify-center text-slate-700 font-semibold text-xs overflow-hidden shrink-0">
            {displayName.charAt(0)}
          </div>
          <div className="truncate flex-1 min-w-0">
            <span className="font-medium text-slate-800 text-xs truncate block leading-tight group-hover:text-slate-900">
              {displayName}
            </span>
            <span className="text-[10px] text-slate-400 block leading-tight mt-0.5">
              {userPlan}
            </span>
          </div>
        </Link>
      </div>
    </aside>
  );

  return (
    <>
      {/* Desktop Fixed Sidebar (w-60) */}
      <div className="hidden lg:block h-dvh sticky top-0 shrink-0">
        {sidebarContent}
      </div>

      {/* Mobile Drawer with Backdrop */}
      <AnimatePresence>
        {mobileOpen && (
          <div ref={drawerRef} id="kreovar-mobile-navigation" role="dialog" aria-modal="true" aria-label="Navigation" className="vx-mobile-drawer fixed inset-0 z-50 lg:hidden flex">
            <motion.div
              variants={overlayVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              onClick={onMobileClose}
              className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs"
            />
            <motion.div
              variants={sidebarDrawerVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="relative z-10 h-full shadow-xl"
            >
              <button type="button" aria-label="Close navigation" className="vx-drawer-close" onClick={onMobileClose}><X size={20}/></button>
              {sidebarContent}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
