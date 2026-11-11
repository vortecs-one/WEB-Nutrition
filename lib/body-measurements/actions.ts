"use server";

import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { dayLogEntries } from "@/drizzle/schema";
import { DATE_KEY_RE } from "@/lib/day-log/types";
import { setWeightEntry } from "@/lib/day-log/actions";
import {
  deleteBodyMeasurement,
  getBodyMeasurement,
  listBodyMeasurements,
} from "@/lib/thruxion-api";
import { sessionHumanId, upsertDayMeasurement } from "./sync";
import {
  isMeasurementHeight,
  isMeasurementWeight,
  measurementDateKey,
  type MeasurementInput,
  type MeasurementPoint,
} from "./types";

/**
 * The signed-in human's measurements, newest first. Null when the account has
 * no Thruxion human (nothing to show) or the API can't be reached.
 */
export async function fetchMeasurementHistory(): Promise<MeasurementPoint[] | null> {
  const humanId = await sessionHumanId();
  if (!humanId) return null;
  try {
    const rows = await listBodyMeasurements(humanId, { limit: 100 });
    return rows.map((m) => ({
      id: m.id,
      dateKey: measurementDateKey(m.measured_at),
      heightCm: m.height_cm,
      weightKg: m.weight_kg,
    }));
  } catch (err) {
    console.log("[body-measurements] list failed:", (err as Error).message);
    return null;
  }
}

export type MeasurementResult = { ok: true } | { ok: false; error: "unauthenticated" | "invalid" | "failed" };

/**
 * Records a day's height and/or weight. The weight also becomes that day's
 * weigh-in in the day log (which syncs it to Thruxion itself).
 */
export async function addMeasurement(input: MeasurementInput): Promise<MeasurementResult> {
  const humanId = await sessionHumanId();
  if (!humanId) return { ok: false, error: "unauthenticated" };

  const { dateKey, heightCm, weightKg } = input ?? {};
  const today = new Date(Date.now() + 14 * 3600_000).toISOString().slice(0, 10);
  if (
    typeof dateKey !== "string" ||
    !DATE_KEY_RE.test(dateKey) ||
    dateKey > today ||
    (heightCm === null && weightKg === null) ||
    (heightCm !== null && !isMeasurementHeight(heightCm)) ||
    (weightKg !== null && !isMeasurementWeight(weightKg))
  ) {
    return { ok: false, error: "invalid" };
  }

  try {
    if (weightKg !== null) await setWeightEntry(dateKey, Math.round(weightKg * 1000));
    if (heightCm !== null) await upsertDayMeasurement(humanId, dateKey, { heightCm: Math.round(heightCm * 10) / 10 });
    return { ok: true };
  } catch (err) {
    console.log("[body-measurements] add failed:", (err as Error).message);
    return { ok: false, error: "failed" };
  }
}

/** Deletes one of the user's own measurements (and its day-log weigh-in). */
export async function removeMeasurement(id: number): Promise<MeasurementResult> {
  const humanId = await sessionHumanId();
  if (!humanId) return { ok: false, error: "unauthenticated" };
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "invalid" };

  try {
    // The API token is an admin token: check ownership before deleting.
    const record = await getBodyMeasurement(id);
    if (!record || String(record.human_id) !== String(humanId)) return { ok: false, error: "invalid" };

    await deleteBodyMeasurement(id);
    if (record.weight_kg !== null) {
      await db
        .delete(dayLogEntries)
        .where(
          and(
            eq(dayLogEntries.userKey, humanId),
            eq(dayLogEntries.logDate, measurementDateKey(record.measured_at)),
            eq(dayLogEntries.kind, "weight"),
          ),
        );
    }
    return { ok: true };
  } catch (err) {
    console.log("[body-measurements] delete failed:", (err as Error).message);
    return { ok: false, error: "failed" };
  }
}
