"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface AdminHeaderProps {
  title: string;
  subtitle: string;
  badge?: string;
}

export default function AdminHeader({ title, subtitle, badge = "ADMIN CONSOLE" }: AdminHeaderProps) {
  const pathname = usePathname();

  const navLinks = [
    { href: "/admin/control-center", label: "Control Centre", icon: "⚙" },
    { href: "/admin", label: "Dual-Source Dashboard", icon: "📊" },
    { href: "/admin/users", label: "Users Table", icon: "👥" },
    { href: "/admin/usage", label: "User Usage", icon: "📊" },
    { href: "/admin/analytics", label: "Analytics Engine", icon: "📈" },
    { href: "/admin/whop", label: "Whop Store & Webhooks", icon: "⚡" },
  ];

  return (
    <div className="space-y-6 mb-8 border-b border-[#202534] pb-6">
      {/* Title & Badge */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-[10px] font-mono uppercase tracking-wider bg-rose-500/10 border border-rose-500/30 text-rose-400 font-bold">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse" />
              {badge}
            </span>
            <span className="text-[11px] font-mono text-slate-500">
              STRICT SERVER-AUTHORIZED
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight font-heading">
            {title}
          </h1>
          <p className="text-xs text-slate-400">{subtitle}</p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/dashboard"
            className="px-3.5 py-1.5 rounded-xl bg-[#12151E] hover:bg-[#181D2A] text-slate-400 hover:text-white text-xs font-mono border border-[#202534] transition"
          >
            ← Return to App
          </Link>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto scrollbar-none pt-2">
        {navLinks.map((link) => {
          const isActive = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                isActive
                  ? "bg-white text-zinc-950 font-bold shadow-[0_0_20px_rgba(255,255,255,0.25)]"
                  : "bg-[#0D0F15] hover:bg-[#161A26] text-slate-400 hover:text-slate-200 border border-[#202534]"
              }`}
            >
              <span>{link.icon}</span>
              <span>{link.label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
