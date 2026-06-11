// app/dashboard/nutrition/page.tsx
import { getCurrentRole } from "@/lib/role/server";
import { redirect } from "next/navigation";
import NutritionTracker from "./NutritionTracker";

// Personal nutrition / calorie tracker for normal users.
export default async function NutritionPage() {
  const role = await getCurrentRole();

  if (role !== "user") {
    redirect("/dashboard");
  }

  return <NutritionTracker />;
}
