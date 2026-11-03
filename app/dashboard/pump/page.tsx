// app/dashboard/pump/page.tsx
import { getCurrentRole } from "@/lib/role/server";
import { redirect } from "next/navigation";
import { fetchGlucoseSettings } from "@/lib/glucose/actions";
import { getGlucoseRole } from "@/lib/glucose/access";
import PumpDashboard from "./PumpDashboard";

// Insulin pump (MiniMed 780G + CareLink) for normal users with glucose
// access: the sensor owner imports, a health watcher sees the status.
export default async function PumpPage() {
  const role = await getCurrentRole();
  const glucoseRole = await getGlucoseRole();

  if (role !== "user" || !glucoseRole) {
    redirect("/dashboard");
  }

  const settings = await fetchGlucoseSettings();

  return <PumpDashboard initialSettings={settings} role={glucoseRole} />;
}
