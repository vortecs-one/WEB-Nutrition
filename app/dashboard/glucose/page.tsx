// app/dashboard/glucose/page.tsx
import { getCurrentRole } from "@/lib/role/server";
import { redirect } from "next/navigation";
import { fetchGlucoseSettings } from "@/lib/glucose/actions";
import GlucoseTracker from "./GlucoseTracker";

// Personal glucose monitor (Nightscout-backed) for normal users.
export default async function GlucosePage() {
  const role = await getCurrentRole();

  if (role !== "user") {
    redirect("/dashboard");
  }

  const settings = await fetchGlucoseSettings();

  return <GlucoseTracker initialSettings={settings} />;
}
