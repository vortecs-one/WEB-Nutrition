// app/dashboard/page.tsx
import { redirect } from "next/navigation";
import { getServerI18n } from "@/lib/i18n/server";
import { getCurrentRole } from "@/lib/role/server";

export default async function DashboardHomePage() {
  const role = await getCurrentRole();

  // Normal users land directly on their Dashboard (calorie balance) view.
  if (role === "user") {
    redirect("/dashboard/calories");
  }

  const { dict } = await getServerI18n();

  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold tracking-tight text-balance">
        {dict.dashboard.title}
      </h1>
      <p className="text-sm text-muted-foreground">{dict.dashboard.subtitle}</p>
    </div>
  );
}
