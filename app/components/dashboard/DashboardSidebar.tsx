"use client";

import Sidebar, { SidebarProps } from "../Sidebar";

export interface DashboardSidebarProps {
  activeTab?: string;
  onTabChange?: (tab: string) => void;
  onCreateClick?: () => void;
  onBrandKitClick?: () => void;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export default function DashboardSidebar({
  activeTab = "dashboard",
  onTabChange,
  onCreateClick,
  onBrandKitClick,
  mobileOpen = false,
  onMobileClose,
}: DashboardSidebarProps) {
  return (
    <Sidebar
      active={activeTab}
      onTabChange={onTabChange}
      onCreateClick={onCreateClick}
      onBrandKitClick={onBrandKitClick}
      mobileOpen={mobileOpen}
      onMobileClose={onMobileClose}
    />
  );
}
