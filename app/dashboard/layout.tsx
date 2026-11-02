// app/dashboard/layout.tsx
import type { ReactNode } from "react";
import DashboardShell from "./DashboardShell";
import { DayLogProvider } from "@/lib/day-log/provider";

export default function DashboardLayout({
  children,
  modal,
}: {
  children: ReactNode;
  // Popups opened over the current page (intercepted routes, see @modal).
  modal: ReactNode;
}) {
  return (
    <DayLogProvider>
      <DashboardShell>{children}</DashboardShell>
      {modal}
    </DayLogProvider>
  );
}
