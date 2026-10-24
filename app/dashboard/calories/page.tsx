// app/dashboard/calories/page.tsx
import { getCurrentRole } from "@/lib/role/server";
import { redirect } from "next/navigation";
import { fetchGlucoseSettings } from "@/lib/glucose/actions";
import { canAccessGlucose } from "@/lib/glucose/access";
import { GlucoseStatusProvider } from "@/lib/glucose/status-provider";
import GlucoseTracker from "../glucose/GlucoseTracker";
import CaloriesTracker from "./CaloriesTracker";
import CompanionCard from "../pets/CompanionCard";

// Personal dashboard for normal users: calorie balance at top, then glucose
// monitoring, with the companion card last (it takes its color from the
// glucose card's latest reading).
export default async function CaloriesPage() {
  const role = await getCurrentRole();

  if (role !== "user") {
    redirect("/dashboard");
  }

  const showGlucose = await canAccessGlucose();
  const glucoseSettings = showGlucose ? await fetchGlucoseSettings() : null;

  return (
    <div className="space-y-6">
      <CaloriesTracker />
      <GlucoseStatusProvider>
        {showGlucose && <GlucoseTracker initialSettings={glucoseSettings} />}
        <CompanionCard />
      </GlucoseStatusProvider>
    </div>
  );
}
