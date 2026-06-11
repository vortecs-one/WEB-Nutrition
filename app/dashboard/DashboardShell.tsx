"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";
import { useI18n } from "@/lib/i18n/provider";

// Responsive shell:
// - lg and up: fixed sidebar alongside the content (classic dashboard).
// - below lg: sidebar collapses into a slide-in drawer toggled from the topbar.
//   This keeps the UI usable inside the mobile app webview.
export default function DashboardShell({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { dict } = useI18n();

  return (
    <div className="min-h-screen flex bg-background text-foreground">
      {/* Desktop sidebar */}
      <div className="hidden lg:flex lg:shrink-0 border-r border-slate-800">
        <Sidebar />
      </div>

      {/* Mobile drawer + backdrop */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          {/* backdrop */}
          <button
            type="button"
            aria-label={dict.common.close}
            onClick={() => setMobileOpen(false)}
            className="absolute inset-0 bg-black/50"
          />
          {/* drawer */}
          <div className="absolute inset-y-0 left-0 w-64 shadow-xl">
            <Sidebar onNavigate={() => setMobileOpen(false)} />
          </div>
        </div>
      )}

      {/* Right side: top bar + page content */}
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar onOpenMenu={() => setMobileOpen(true)} />
        <main className="flex-1 p-4 lg:p-8 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
