// Server-only CareLink live sync: token lifecycle + storing readings.
// Used by the glucose server actions (on-demand while someone is watching)
// and by /api/cron/carelink (keep-alive, twice a day).

import { and, eq, isNotNull, isNull, lt, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { carelinkReadings, glucoseSettings } from "@/drizzle/schema";
import {
  CareLinkError,
  getCareLinkConfig,
  getDisplayMessage,
  parsePatientData,
  refreshTokens,
  type CareLinkRegion,
  type CareLinkSnapshot,
} from "./carelink";
import { openSecret, sealSecret } from "./secret-box";

type SettingsRow = typeof glucoseSettings.$inferSelect;

// MiniMed uploads every 5 minutes; polling Medtronic faster only adds load.
export const CARELINK_MIN_SYNC_INTERVAL_MS = 4 * 60_000;
const TOKEN_EXPIRY_MARGIN_MS = 2 * 60_000;
const REFRESH_LEASE_MS = 30_000;

export const isCareLinkLive = (row: SettingsRow | null | undefined) =>
  Boolean(row?.carelinkRefreshToken && row.carelinkUsername && !row.carelinkNeedsReconnect);

export function regionOf(row: SettingsRow): CareLinkRegion {
  return row.carelinkRegion === "US" ? "US" : "EU";
}

async function readRow(id: number): Promise<SettingsRow | null> {
  const [row] = await db
    .select()
    .from(glucoseSettings)
    .where(eq(glucoseSettings.id, id))
    .limit(1);
  return row ?? null;
}

/**
 * Refreshes the Auth0 tokens under a short DB lease. Medtronic rotates
 * refresh tokens, so two concurrent refreshes would invalidate each other.
 */
async function refreshWithLease(row: SettingsRow): Promise<SettingsRow> {
  const now = new Date();
  const [locked] = await db
    .update(glucoseSettings)
    .set({ carelinkRefreshLockUntil: new Date(now.getTime() + REFRESH_LEASE_MS) })
    .where(
      and(
        eq(glucoseSettings.id, row.id),
        or(isNull(glucoseSettings.carelinkRefreshLockUntil), lt(glucoseSettings.carelinkRefreshLockUntil, now)),
      ),
    )
    .returning();

  if (!locked) {
    // Someone else is refreshing: wait for their result instead.
    await new Promise((r) => setTimeout(r, 2500));
    const fresh = await readRow(row.id);
    if (fresh && fresh.carelinkTokenExpires && fresh.carelinkTokenExpires.getTime() > Date.now()) return fresh;
    throw new CareLinkError("unreachable", "refresh in progress");
  }

  const refreshToken = openSecret(locked.carelinkRefreshToken);
  if (!refreshToken) {
    const [updated] = await db
      .update(glucoseSettings)
      .set({ carelinkNeedsReconnect: true, carelinkRefreshLockUntil: null })
      .where(eq(glucoseSettings.id, row.id))
      .returning();
    void updated;
    throw new CareLinkError("invalid-grant", "stored refresh token unreadable");
  }

  try {
    const config = await getCareLinkConfig(regionOf(locked));
    const tokens = await refreshTokens(config, refreshToken);
    const [updated] = await db
      .update(glucoseSettings)
      .set({
        carelinkAccessToken: sealSecret(tokens.accessToken),
        // Keep the old one if Medtronic didn't rotate it.
        carelinkRefreshToken: tokens.refreshToken ? sealSecret(tokens.refreshToken) : locked.carelinkRefreshToken,
        carelinkTokenExpires: tokens.expiresAt,
        carelinkLastRefreshAt: new Date(),
        carelinkNeedsReconnect: false,
        carelinkRefreshLockUntil: null,
      })
      .where(eq(glucoseSettings.id, row.id))
      .returning();
    return updated;
  } catch (err) {
    await db
      .update(glucoseSettings)
      .set({
        carelinkRefreshLockUntil: null,
        ...(err instanceof CareLinkError && err.code === "invalid-grant" ? { carelinkNeedsReconnect: true } : {}),
      })
      .where(eq(glucoseSettings.id, row.id));
    throw err;
  }
}

async function accessTokenFor(row: SettingsRow, forceRefresh: boolean): Promise<{ row: SettingsRow; token: string }> {
  const valid =
    !forceRefresh &&
    row.carelinkTokenExpires &&
    row.carelinkTokenExpires.getTime() - TOKEN_EXPIRY_MARGIN_MS > Date.now();
  const token = valid ? openSecret(row.carelinkAccessToken) : null;
  if (token) return { row, token };
  const refreshed = await refreshWithLease(row);
  const fresh = openSecret(refreshed.carelinkAccessToken);
  if (!fresh) throw new CareLinkError("invalid-grant", "no access token after refresh");
  return { row: refreshed, token: fresh };
}

export type CareLinkSyncResult = { row: SettingsRow; added: number; snapshot: CareLinkSnapshot };

/** Pulls display/message, upserts readings, stores the snapshot. */
export async function syncCareLink(
  input: SettingsRow,
  opts: { forceRefresh?: boolean } = {},
): Promise<CareLinkSyncResult> {
  if (!input.carelinkUsername || !input.carelinkRole) throw new CareLinkError("invalid-grant", "not connected");

  let { row, token } = await accessTokenFor(input, Boolean(opts.forceRefresh));
  const config = await getCareLinkConfig(regionOf(row));
  const who = {
    username: row.carelinkUsername!,
    role: row.carelinkRole!,
    patientId: row.carelinkPatientId,
  };

  let patientData: Record<string, unknown>;
  try {
    patientData = await getDisplayMessage(config, token, who);
  } catch (err) {
    if (!(err instanceof CareLinkError) || err.code !== "unauthorized") throw err;
    // Access token revoked early: refresh once and retry.
    ({ row, token } = await accessTokenFor(row, true));
    patientData = await getDisplayMessage(config, token, who);
  }

  const { readings, snapshot } = parsePatientData(patientData);

  let added = 0;
  if (readings.length > 0) {
    const inserted = await db
      .insert(carelinkReadings)
      .values(readings.map((r) => ({ userKey: row.userKey, date: new Date(r.date), sgv: r.sgv, origin: "live" })))
      .onConflictDoNothing({ target: [carelinkReadings.userKey, carelinkReadings.date] })
      .returning({ id: carelinkReadings.id });
    added = inserted.length;
  }

  const count = added > 0 ? await db.$count(carelinkReadings, eq(carelinkReadings.userKey, row.userKey)) : null;
  const [updated] = await db
    .update(glucoseSettings)
    .set({
      carelinkSnapshot: snapshot,
      carelinkLastSyncAt: new Date(),
      ...(count !== null ? { carelinkReadingCount: count } : {}),
    })
    .where(eq(glucoseSettings.id, row.id))
    .returning();

  return { row: updated, added, snapshot };
}

/**
 * Cron keep-alive: force a token refresh for every connected account (so the
 * refresh token never sits idle) and store whatever readings are available.
 */
export async function keepCareLinkAlive(): Promise<
  { userKey: string; ok: boolean; added?: number; error?: string }[]
> {
  const rows = await db
    .select()
    .from(glucoseSettings)
    .where(and(isNotNull(glucoseSettings.carelinkRefreshToken), eq(glucoseSettings.carelinkNeedsReconnect, false)));

  const results = [];
  for (const row of rows) {
    try {
      const { added } = await syncCareLink(row, { forceRefresh: true });
      results.push({ userKey: row.userKey, ok: true, added });
    } catch (err) {
      const code = err instanceof CareLinkError ? err.code : "unknown";
      console.error("[carelink] keep-alive failed:", row.userKey, code, (err as Error).message);
      results.push({ userKey: row.userKey, ok: false, error: code });
    }
  }
  return results;
}
