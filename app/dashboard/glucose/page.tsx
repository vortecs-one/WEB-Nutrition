// app/dashboard/glucose/page.tsx
import { getCurrentRole } from "@/lib/role/server";
import { redirect } from "next/navigation";
import { fetchGlucoseSettings } from "@/lib/glucose/actions";
import { getGlucoseRole } from "@/lib/glucose/access";
import GlucoseTracker from "./GlucoseTracker";

// Personal glucose monitor (Nightscout-backed) for normal users: the sensor
// owner, or a health watcher reading the owner's data.
export default async function GlucosePage() {
  const role = await getCurrentRole();
  const glucoseRole = await getGlucoseRole();

  if (role !== "user" || !glucoseRole) {
    redirect("/dashboard");
  }

  const settings = await fetchGlucoseSettings();

  return <GlucoseTracker initialSettings={settings} role={glucoseRole} />;
}
