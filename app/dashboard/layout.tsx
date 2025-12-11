// app/dashboard/layout.tsx
import type { ReactNode } from "react";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";

export default function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen flex bg-background text-foreground">
      {/* Left sidebar */}
      <Sidebar />

      {/* Right side: top bar + page content */}
      <div className="flex-1 flex flex-col">
        <Topbar />
        <main className="flex-1 p-4 lg:p-8 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
