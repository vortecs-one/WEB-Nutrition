"use client";

import type { ReactNode } from "react";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";
import MobileTabBar from "./MobileTabBar";

// Responsive shell:
// - lg and up: fixed sidebar alongside the content (classic dashboard).
// - below lg: native-style bottom tab bar for primary navigation, keeping
//   the experience thumb-friendly inside the mobile app webview.
export default function DashboardShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex bg-background text-foreground">
      {/* Desktop sidebar */}
      <div className="hidden lg:flex lg:shrink-0">
        <Sidebar />
      </div>

      {/* Right side: top bar + page content */}
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar />
        {/* Extra bottom padding on mobile so content clears the tab bar */}
        <main className="flex-1 overflow-auto p-4 pb-24 lg:p-8 lg:pb-8">
          {children}
        </main>
      </div>

      {/* Mobile bottom navigation */}
      <MobileTabBar />
    </div>
  );
}
