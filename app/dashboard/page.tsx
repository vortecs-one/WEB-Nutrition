// app/dashboard/page.tsx
import { getServerI18n } from "@/lib/i18n/server";

export default async function DashboardHomePage() {
  const { dict } = await getServerI18n();

  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold tracking-tight">
        {dict.dashboard.title}
      </h1>
      <p className="text-sm text-muted-foreground">
        {dict.dashboard.subtitle}
      </p>
    </div>
  );
}
