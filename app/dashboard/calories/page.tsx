// app/dashboard/calories/page.tsx
import { getCurrentRole } from "@/lib/role/server";
import { redirect } from "next/navigation";
import CaloriesTracker from "./CaloriesTracker";

// Personal calorie balance tracker (consumed vs. burned) for normal users.
export default async function CaloriesPage() {
  const role = await getCurrentRole();

  if (role !== "user") {
    redirect("/dashboard");
  }

  return <CaloriesTracker />;
}
