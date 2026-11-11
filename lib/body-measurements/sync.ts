// Writes the app's height / weight changes to the Thruxion Humans API, so the
// human's measurement history follows them over time.

import { auth } from "@/auth";
import {
  createBodyMeasurement,
  listBodyMeasurements,
  updateBodyMeasurement,
  type BodyMeasurementFields,
} from "@/lib/thruxion-api";

export async function sessionHumanId(): Promise<string | null> {
  const session = await auth();
  return (session?.user as { humanId?: string | null } | undefined)?.humanId ?? null;
}

// Noon UTC keeps the record on the same calendar day for the Americas and
// Europe. The API rejects future dates, so fall back to midnight, then "now".
function measuredAtFor(dateKey: string): string | undefined {
  const now = Date.now();
  if (Date.parse(`${dateKey}T12:00:00Z`) <= now) return `${dateKey} 12:00:00`;
  if (Date.parse(`${dateKey}T00:00:00Z`) <= now) return dateKey;
  return undefined;
}

/**
 * One measurement per day, like the day-log weigh-ins: updates that day's
 * newest record when there is one, otherwise creates it.
 */
export async function upsertDayMeasurement(
  humanId: string,
  dateKey: string,
  values: { heightCm?: number; weightKg?: number },
): Promise<void> {
  const fields: BodyMeasurementFields = {};
  if (values.heightCm != null) fields.height_cm = values.heightCm;
  if (values.weightKg != null) fields.weight_kg = values.weightKg;
  if (fields.height_cm == null && fields.weight_kg == null) return;

  const [existing] = await listBodyMeasurements(humanId, { from: dateKey, to: dateKey, limit: 1 });
  if (existing) {
    await updateBodyMeasurement(existing.id, fields);
  } else {
    await createBodyMeasurement(humanId, { ...fields, measured_at: measuredAtFor(dateKey) });
  }
}

/** Best effort: a Thruxion outage must not break the local weigh-in. */
export async function syncDayWeight(dateKey: string, weightKg: number): Promise<void> {
  try {
    const humanId = await sessionHumanId();
    if (humanId) await upsertDayMeasurement(humanId, dateKey, { weightKg });
  } catch (err) {
    console.log("[body-measurements] weight sync failed:", (err as Error).message);
  }
}
