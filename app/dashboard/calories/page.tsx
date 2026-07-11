// app/dashboard/calories/page.tsx
import { getCurrentRole } from "@/lib/role/server";
import { redirect } from "next/navigation";
import { fetchGlucoseSettings } from "@/lib/glucose/actions";
import GlucoseTracker from "../glucose/GlucoseTracker";
import CaloriesTracker from "./CaloriesTracker";

// Personal dashboard for normal users: glucose monitoring at top, then calorie balance.
export default async function CaloriesPage() {
  const role = await getCurrentRole();

  if (role !== "user") {
    redirect("/dashboard");
  }

  const glucoseSettings = await fetchGlucoseSettings();

  return (
    <div className="space-y-6">
      <GlucoseTracker initialSettings={glucoseSettings} />
      <CaloriesTracker />
    </div>
  );
}
