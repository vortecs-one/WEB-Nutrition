"use client";

import { useEffect, useMemo, useState } from "react";
import { useDayLog, WATER_GOAL_ML } from "@/lib/day-log/provider";
import { useGlucoseReading } from "@/lib/glucose/status-provider";
import { minutesAgo } from "@/lib/glucose/types";
import { deriveMood, type CompanionMood } from "@/lib/pets/mood";

// Same day key as the calorie card (CaloriesTracker), so the companion reacts
// to the day the gauge shows.
function toDateKey(d: Date) {
  return d.toISOString().slice(0, 10);
}

/**
 * The companion's mood (lib/pets/mood.ts) from the latest glucose reading
 * (published by the glucose card), today's log and the time of day. Null
 * until mounted: the clock only exists on the client.
 */
export function useCompanionMood(): CompanionMood | null {
  const reading = useGlucoseReading();
  const { waterFor, burnedFor, sleepFor, stressFor } = useDayLog();
  // Re-derived every minute: the reading ages and the day moves on.
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time client-only init to avoid SSR/hydration mismatch
    setNow(new Date());
    const clock = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(clock);
  }, []);

  return useMemo(() => {
    if (!now) return null;
    const day = toDateKey(now);
    return deriveMood({
      glucose: reading && {
        status: reading.status,
        sgv: reading.sgv,
        direction: reading.direction,
        targetLow: reading.targetLow,
        ageMinutes: minutesAgo(reading.date),
      },
      waterMl: waterFor(day),
      waterGoalMl: WATER_GOAL_ML,
      burnedKcal: burnedFor(day),
      sleepMinutes: sleepFor(day),
      stress: stressFor(day),
      hour: now.getHours() + now.getMinutes() / 60,
    });
  }, [now, reading, waterFor, burnedFor, sleepFor, stressFor]);
}
