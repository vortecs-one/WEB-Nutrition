"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n/provider";
import BarcodeLookup from "./BarcodeLookup";
import ActivityLog from "./ActivityLog";
import DietLog from "./DietLog";

function toDateKey(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default function NutritionTracker() {
  const { dict } = useI18n();
  const t = dict.nutritionUser;

  const [todayKey, setTodayKey] = useState<string>("");
  // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time client-only init to avoid SSR/hydration mismatch
  useEffect(() => setTodayKey(toDateKey(new Date())), []);

  return (
    <div className="mx-auto w-full max-w-2xl space-y-5">
      {/* Barcode scanner — at the top for easy access */}
      <div className="rounded-2xl border border-border bg-card text-card-foreground shadow-sm p-4">
        <BarcodeLookup todayKey={todayKey} embedded />
      </div>

      {/* Diet log */}
      <DietLog todayKey={todayKey} />

      {/* Activity log */}
      <section className="bg-card text-card-foreground rounded-3xl border border-border shadow-sm p-5">
        <h2 className="text-lg font-semibold mb-4">{t.activityLog}</h2>
        <ActivityLog todayKey={todayKey} embedded />
      </section>
    </div>
  );
}
