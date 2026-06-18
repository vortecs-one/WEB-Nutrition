"use client";

import type { ReactNode } from "react";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";
import MobileTabBar from "./MobileTabBar";

// Responsive shell:
// - lg and up: fixed sidebar alongside the content (classic dashboard).
// - below lg: native-style top tab bar (under the header) for primary
//   navigation, keeping the experience app-like inside the mobile webview.
export default function DashboardShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex bg-background text-foreground">
      {/* Desktop sidebar */}
      <div className="hidden lg:flex lg:shrink-0">
        <Sidebar />
      </div>

      {/* Right side: top bar + mobile tabs + page content */}
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar />
        {/* Mobile top navigation, directly under the header */}
        <MobileTabBar />
        <main className="flex-1 overflow-auto p-4 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
