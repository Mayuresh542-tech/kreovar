"use client";
import ThemeToggle from "../ThemeToggle";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Bell, Menu, Settings, CreditCard, LogOut, ShieldAlert, Sparkles, ChevronDown } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { isAdminEmail } from "../../lib/admin";
import { dropdownVariants } from "../../lib/motion";

interface TopHeaderProps {
  onSearchClick?: () => void;
  onMobileMenuToggle: () => void;
  mobileMenuOpen?: boolean;
  alertCount?: number;
  userName?: string;
  userRole?: string;
  avatarUrl?: string;
  credits?: number;
  workspaceName?: string;
}

export default function TopHeader({
  onMobileMenuToggle,
  mobileMenuOpen = false,
  alertCount = 0,
  userName = "Your account",
  userRole = "Free Plan",
  avatarUrl,
}: TopHeaderProps) {
  const router = useRouter();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user?.email) {
        setIsAdmin(isAdminEmail(data.session.user.email));
      }
    });
  }, []);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  return (
    <header data-vx-motion="down" className="vx-topheader sticky top-0 z-20 h-14 w-full bg-white border-b border-slate-200 px-4 md:px-6 flex items-center justify-between">
      {/* Left: Mobile hamburger */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onMobileMenuToggle}
          className="lg:hidden inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
          aria-label="Toggle Navigation"
          aria-expanded={mobileMenuOpen}
          aria-controls="kreovar-mobile-navigation"
        >
          <Menu className="w-5 h-5" />
        </button>
        <Link href="/dashboard" className="vx-workspace-label">
          <span className="vx-workspace-symbol"><Sparkles size={16} aria-hidden="true" /></span>
          <span>Creator Studio</span>
        </Link>
      </div>

      {/* Right: Notifications & Profile Avatar */}
      <div className="flex items-center gap-2 sm:gap-3">
        <ThemeToggle />
        {/* Notification Bell */}
        <Link
          href="/trends"
          className="relative inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-50 transition-colors"
          title="Notifications"
          aria-label="Notifications"
        >
          <Bell className="w-4 h-4" />
          {alertCount > 0 && (
            <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-blue-600" />
          )}
        </Link>

        {/* User Profile Avatar with Dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => setDropdownOpen((prev) => !prev)}
            aria-expanded={dropdownOpen}
            aria-haspopup="true"
            aria-label="User account menu"
            className="vx-account-trigger flex items-center gap-2 p-1 rounded-full transition-all"
          >
            <div className="w-8 h-8 rounded-full bg-slate-200 border border-slate-300 flex items-center justify-center text-slate-700 font-medium text-xs overflow-hidden shrink-0">
              {avatarUrl ? (
                <img src={avatarUrl} alt={userName} className="w-full h-full object-cover" />
              ) : (
                userName.charAt(0)
              )}
            </div>
            <span className="vx-account-details"><span>{userName}</span><small>{userRole}</small></span>
            <ChevronDown size={14} className="hidden sm:block text-slate-500" aria-hidden="true" />
          </button>

          {/* Dropdown Menu */}
          <AnimatePresence>
            {dropdownOpen && (
              <motion.div
                variants={dropdownVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                className="vx-account-dropdown absolute right-0 mt-2 w-52 rounded-xl bg-white border border-slate-200 shadow-lg p-1.5 text-xs z-50 origin-top-right"
              >
                <div className="px-3 py-2 border-b border-slate-100 mb-1">
                  <p className="font-semibold text-slate-900 truncate">{userName}</p>
                  <p className="text-[11px] text-slate-500 truncate mt-0.5">{userRole}</p>
                </div>

                <Link
                  href="/settings"
                  onClick={() => setDropdownOpen(false)}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <Settings className="w-3.5 h-3.5 text-slate-400" />
                  Settings
                </Link>

                <Link
                  href="/settings/billing"
                  onClick={() => setDropdownOpen(false)}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <CreditCard className="w-3.5 h-3.5 text-slate-400" />
                  Billing &amp; Subscription
                </Link>

                {isAdmin && (
                  <Link
                    href="/admin"
                    onClick={() => setDropdownOpen(false)}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    <ShieldAlert className="w-3.5 h-3.5 text-slate-400" />
                    Admin Console
                  </Link>
                )}

                <div className="my-1 border-t border-slate-100" />

                <button
                  type="button"
                  onClick={handleSignOut}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-rose-600 hover:bg-rose-50 transition-colors text-left"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Sign Out
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  );
}
