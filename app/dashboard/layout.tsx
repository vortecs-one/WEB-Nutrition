// app/dashboard/layout.tsx
import type { ReactNode } from "react";
import DashboardShell from "./DashboardShell";
import { DayLogProvider } from "@/lib/day-log/provider";
import { canAccessGlucose } from "@/lib/glucose/access";

export default async function DashboardLayout({
  children,
  modal,
}: {
  children: ReactNode;
  // Popups opened over the current page (intercepted routes, see @modal).
  modal: ReactNode;
}) {
  // Glucose access adds the Insulin pump page to a user's menu.
  const hasGlucose = await canAccessGlucose();

  return (
    <DayLogProvider>
      <DashboardShell hasGlucose={hasGlucose}>{children}</DashboardShell>
      {modal}
    </DayLogProvider>
  );
}
