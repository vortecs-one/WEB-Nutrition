"use server";

import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { dayLogEntries } from "@/drizzle/schema";
import { DATE_KEY_RE } from "@/lib/day-log/types";
import { setWeightEntry } from "@/lib/day-log/actions";
import {
  deleteBodyMeasurement,
  getBodyMeasurement,
  getLatestBodyMeasurement,
  listBodyMeasurements,
  updateBodyMeasurement,
  type BodyMeasurement,
  type BodyMeasurementFields,
} from "@/lib/thruxion-api";
import { sessionHumanId, upsertDayMeasurement } from "./sync";
import {
  HISTORY_PAGE_SIZE,
  isApiHeight,
  isApiWeight,
  isMeasurementHeight,
  isMeasurementRange,
  isMeasurementWeight,
  measurementDateKey,
  type MeasurementInput,
  type MeasurementPage,
  type MeasurementPoint,
  type MeasurementRange,
  type MeasurementSummary,
} from "./types";

const RANGE_DAYS: Record<Exclude<MeasurementRange, "all">, number> = { "30d": 30, "90d": 90, "1y": 365 };

const daysAgoKey = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);

const toPoint = (m: BodyMeasurement): MeasurementPoint => ({
  id: m.id,
  dateKey: measurementDateKey(m.measured_at),
  heightCm: m.height_cm,
  weightKg: m.weight_kg,
});

/**
 * One page of the signed-in human's measurements in a date range, in the order
 * the API returns them. Null when the account has no Thruxion human (nothing
 * to show) or the API can't be reached.
 */
export async function fetchMeasurementHistory(
  range: MeasurementRange = "all",
  page = 1,
): Promise<MeasurementPage | null> {
  const humanId = await sessionHumanId();
  if (!humanId) return null;
  const safeRange = isMeasurementRange(range) ? range : "all";
  const safePage = Number.isInteger(page) && page > 0 && page <= 100 ? page : 1;
  try {
    const rows = await listBodyMeasurements(humanId, {
      from: safeRange === "all" ? undefined : daysAgoKey(RANGE_DAYS[safeRange]),
      page: safePage,
      limit: HISTORY_PAGE_SIZE,
    });
    return { points: rows.map(toPoint), hasMore: rows.length === HISTORY_PAGE_SIZE };
  } catch (err) {
    console.log("[body-measurements] list failed:", (err as Error).message);
    return null;
  }
}

/**
 * Latest height and weight from the API's /latest endpoint (each field from its
 * own newest record), plus the weight change over 7 and 30 days.
 */
export async function fetchMeasurementSummary(): Promise<MeasurementSummary | null> {
  const humanId = await sessionHumanId();
  if (!humanId) return null;
  try {
    const [latest, recent] = await Promise.all([
      getLatestBodyMeasurement(humanId),
      listBodyMeasurements(humanId, { from: daysAgoKey(45), limit: 100 }),
    ]);
    if (!latest) {
      return { heightCm: null, heightDateKey: null, weightKg: null, weightDateKey: null, weightDelta7d: null, weightDelta30d: null };
    }

    const weighIns = recent
      .filter((m) => m.weight_kg !== null)
      .map((m) => ({ dateKey: measurementDateKey(m.measured_at), kg: m.weight_kg as number }))
      .sort((a, b) => b.dateKey.localeCompare(a.dateKey));

    const deltaSince = (days: number) => {
      if (latest.weight_kg == null) return null;
      const cutoff = daysAgoKey(days);
      const base = weighIns.find((w) => w.dateKey <= cutoff);
      return base ? Math.round((latest.weight_kg - base.kg) * 10) / 10 : null;
    };

    return {
      heightCm: latest.height_cm,
      heightDateKey: latest.height_measured_at ? measurementDateKey(latest.height_measured_at) : null,
      weightKg: latest.weight_kg,
      weightDateKey: latest.weight_measured_at ? measurementDateKey(latest.weight_measured_at) : null,
      weightDelta7d: deltaSince(7),
      weightDelta30d: deltaSince(30),
    };
  } catch (err) {
    console.log("[body-measurements] summary failed:", (err as Error).message);
    return null;
  }
}

/** Corrects the height / weight of one of the user's own measurements. */
export async function editMeasurement(
  id: number,
  values: { heightCm: number | null; weightKg: number | null },
): Promise<MeasurementResult> {
  const humanId = await sessionHumanId();
  if (!humanId) return { ok: false, error: "unauthenticated" };
  const { heightCm, weightKg } = values ?? {};
  if (
    !Number.isInteger(id) ||
    id <= 0 ||
    (heightCm == null && weightKg == null) ||
    (heightCm != null && !(isMeasurementHeight(heightCm) && isApiHeight(heightCm))) ||
    (weightKg != null && !(isMeasurementWeight(weightKg) && isApiWeight(weightKg)))
  ) {
    return { ok: false, error: "invalid" };
  }

  try {
    const record = await getBodyMeasurement(id);
    if (!record || String(record.human_id) !== String(humanId)) return { ok: false, error: "invalid" };

    const fields: BodyMeasurementFields = {};
    if (heightCm != null) fields.height_cm = Math.round(heightCm * 10) / 10;
    if (weightKg != null) fields.weight_kg = Math.round(weightKg * 10) / 10;

    if (fields.weight_kg != null) {
      // Goes through the day log so the local weigh-in stays in step; it also
      // upserts that day's record, which is this one.
      await setWeightEntry(measurementDateKey(record.measured_at), Math.round(fields.weight_kg * 1000));
    }
    await updateBodyMeasurement(id, fields);
    return { ok: true };
  } catch (err) {
    console.log("[body-measurements] edit failed:", (err as Error).message);
    return { ok: false, error: "failed" };
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
