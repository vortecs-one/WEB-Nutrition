// app/dashboard/glucose/page.tsx
import { getCurrentRole } from "@/lib/role/server";
import { redirect } from "next/navigation";
import { fetchGlucoseSettings } from "@/lib/glucose/actions";
import { getGlucoseRole } from "@/lib/glucose/access";
import GlucoseTracker from "./GlucoseTracker";

// Server actions run under this route's limit: connecting chains token
// exchange, profile lookup and the first sync, each with a 15s timeout.
export const maxDuration = 60;
// Medtronic's Cloudflare edge refuses some datacenter egress IPs (fra1 and
// gru1 were blocked); AWS us-west-1 is accepted.
export const preferredRegion = "sfo1";

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
