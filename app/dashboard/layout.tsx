// app/dashboard/layout.tsx
import type { ReactNode } from "react";
import DashboardShell from "./DashboardShell";
import { DayLogProvider } from "@/lib/day-log/provider";

export default function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <DayLogProvider>
      <DashboardShell>{children}</DashboardShell>
    </DayLogProvider>
  );
}
