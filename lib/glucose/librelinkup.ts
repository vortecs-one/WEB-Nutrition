// lib/glucose/librelinkup.ts
// Server-only client for the LibreLinkUp (Abbott LibreView) follower API.
// This is the same API the LibreLinkUp mobile app uses. Credentials and
// tokens never leave the server — the browser only receives normalized
// readings via the server actions in ./actions.ts.
//
// Flow:
//   1. POST /llu/auth/login on the global host. If the account lives in
//      another region the API answers with { redirect: true, region } and
//      we retry against api-<region>.libreview.io (auto-detect).
//   2. GET /llu/connections lists the patients this account can see:
//      - the account owner's own sensor ("patient" / main reading)
//      - followed patients shared with this account ("friend" / remote).
//   3. GET /llu/connections/<patientId>/graph returns the live measurement
//      plus ~12h of history for the selected patient.

import "server-only";

import type { GlucoseReading, TrendDirection } from "./types";

// --- Constants ---------------------------------------------------------------

const GLOBAL_HOST = "api.libreview.io";

// Headers the LibreLinkUp app sends; the API rejects requests without them.
const LLU_VERSION = "4.12.0";
const LLU_PRODUCT = "llu.android";

export type LibreSession = {
  token: string;
  /** Epoch ms when the token expires. */
  expires: number;
  /** SHA-256 hex of the LibreView user id (sent as the Account-Id header). */
  accountIdHash: string;
  /** Region slug (e.g. "eu", "us") or null for the global host. */
  region: string | null;
};

export type LibrePatient = {
  patientId: string;
  firstName: string;
  lastName: string;
  /** Latest measurement in mg/dL, if present in the connections payload. */
  currentMgdl: number | null;
};

export type LibreGraphResult = {
  current: GlucoseReading | null;
  readings: GlucoseReading[];
  patientName: string;
};

export class LibreError extends Error {
  code: "invalid-credentials" | "unauthorized" | "unreachable" | "terms" | "unknown";
  constructor(code: LibreError["code"], message?: string) {
    super(message ?? code);
    this.code = code;
  }
}

// --- Helpers -----------------------------------------------------------------

function hostFor(region: string | null): string {
  return region ? `api-${region}.libreview.io` : GLOBAL_HOST;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function baseHeaders(): Record<string, string> {
  return {
    "content-type": "application/json",
    accept: "application/json",
    product: LLU_PRODUCT,
    version: LLU_VERSION,
  };
}

function authHeaders(session: LibreSession): Record<string, string> {
  return {
    ...baseHeaders(),
    authorization: `Bearer ${session.token}`,
    "account-id": session.accountIdHash,
  };
}

async function llFetch(
  region: string | null,
  path: string,
  init: RequestInit,
): Promise<Response> {
  return fetch(`https://${hostFor(region)}${path}`, {
    ...init,
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
}

// LibreLinkUp trend arrows are 1–5 (Libre sensors have no double arrows).
function mapTrend(arrow: number | undefined): TrendDirection {
  switch (arrow) {
    case 1:
      return "SingleDown";
    case 2:
      return "FortyFiveDown";
    case 3:
      return "Flat";
    case 4:
      return "FortyFiveUp";
    case 5:
      return "SingleUp";
    default:
      return "NONE";
  }
}

// FactoryTimestamp is UTC in "M/D/YYYY h:mm:ss AM" format.
function parseFactoryTimestamp(ts: string | undefined): number {
  if (!ts) return 0;
  const ms = Date.parse(`${ts} UTC`);
  return Number.isNaN(ms) ? 0 : ms;
}

type RawMeasurement = {
  ValueInMgPerDl?: number;
  Value?: number;
  TrendArrow?: number;
  FactoryTimestamp?: string;
  Timestamp?: string;
};

function toReading(m: RawMeasurement | null | undefined): GlucoseReading | null {
  if (!m) return null;
  const sgv = m.ValueInMgPerDl ?? 0;
  const date = parseFactoryTimestamp(m.FactoryTimestamp);
  if (sgv <= 0 || date <= 0) return null;
  return { sgv, date, direction: mapTrend(m.TrendArrow) };
}

// --- API calls ---------------------------------------------------------------

type LoginResponse = {
  status?: number;
  data?: {
    redirect?: boolean;
    region?: string;
    authTicket?: { token?: string; expires?: number; duration?: number };
    user?: { id?: string };
    /** Present when status === 4: a required action (tou, pp, …) */
    step?: { type?: string };
  };
  error?: { message?: string };
};

/**
 * When Abbott requires acceptance of new Terms of Use (status:4), the
 * login response includes a short-lived authTicket and a step.type
 * ("tou" | "pp" | …). We POST to /auth/continue/{type} using that
 * token, which may itself return another status:4 (chained steps).
 * After all steps are accepted we re-run the full login to get a real
 * long-lived session token.
 *
 * This matches the behaviour of the official LibreLinkUp mobile app and
 * every documented open-source client.
 */
async function acceptContinueStep(
  region: string | null,
  stepType: string,
  stepToken: string,
): Promise<LoginResponse> {
  let res: Response;
  try {
    res = await llFetch(region, `/auth/continue/${encodeURIComponent(stepType)}`, {
      method: "POST",
      headers: {
        ...baseHeaders(),
        authorization: `Bearer ${stepToken}`,
      },
      body: "{}",
    });
  } catch {
    throw new LibreError("unreachable");
  }
  if (!res.ok) throw new LibreError("unreachable");
  return (await res.json()) as LoginResponse;
}

/**
 * Logs in to LibreLinkUp with:
 *  - Auto region detection (follows `data.redirect` to the correct regional host)
 *  - Auto TOU/PP acceptance (silently accepts pending Terms of Use steps via
 *    /auth/continue/{type}, matching what the LibreLinkUp app does)
 */
export async function libreLogin(email: string, password: string): Promise<LibreSession> {
  let region: string | null = null;
  let didAcceptTerms = false;

  for (let attempt = 0; attempt < 4; attempt++) {
    let res: Response;
    try {
      res = await llFetch(region, "/llu/auth/login", {
        method: "POST",
        headers: baseHeaders(),
        body: JSON.stringify({ email, password }),
      });
    } catch {
      throw new LibreError("unreachable");
    }

    if (res.status === 429) throw new LibreError("unreachable", "rate-limited");
    if (!res.ok && res.status !== 200) throw new LibreError("unreachable");

    const body = (await res.json()) as LoginResponse;

    // Wrong email/password.
    if (body.status === 2) throw new LibreError("invalid-credentials");

    // Account lives in another region — retry against the correct host.
    if (body.data?.redirect && body.data.region) {
      region = body.data.region;
      continue;
    }

    // status:4 = action required before login can complete.
    // The response includes a short-lived authTicket for /auth/continue/{type}.
    // We accept up to 2 chained steps (e.g. tou → pp) then re-login.
    if (body.status === 4) {
      const step = body.data?.step;
      const stepToken = body.data?.authTicket?.token;

      if (!step?.type || !stepToken) {
        // Unknown blocking step — we can't handle it programmatically.
        throw new LibreError("terms");
      }

      // Accept first step.
      let continueBody = await acceptContinueStep(region, step.type, stepToken);

      // Accept a second chained step if present (e.g. tou then pp).
      if (continueBody.status === 4) {
        const step2 = continueBody.data?.step;
        const stepToken2 = continueBody.data?.authTicket?.token;
        if (step2?.type && stepToken2) {
          continueBody = await acceptContinueStep(region, step2.type, stepToken2);
        }
      }

      // If still blocked after two accepts, bail out gracefully.
      if (continueBody.status === 4) throw new LibreError("terms");

      // Re-run the full login now that TOU is accepted.
      didAcceptTerms = true;
      continue;
    }

    const token = body.data?.authTicket?.token;
    const userId = body.data?.user?.id;
    const expires = body.data?.authTicket?.expires;
    if (!token || !userId) throw new LibreError("unknown", "missing token in login response");

    return {
      token,
      // `expires` is epoch seconds; fall back to 30 min if absent.
      expires: expires ? expires * 1000 : Date.now() + 30 * 60_000,
      accountIdHash: await sha256Hex(userId),
      region,
    };
  }

  // Reached if we kept redirecting/accepting without getting a real token.
  throw new LibreError(didAcceptTerms ? "terms" : "unknown", "too many login attempts");
}

type ConnectionsResponse = {
  status?: number;
  data?: Array<{
    patientId?: string;
    firstName?: string;
    lastName?: string;
    glucoseMeasurement?: RawMeasurement | null;
  }>;
};

/** Lists the patients (own sensor + followed people) visible to this account. */
export async function libreGetConnections(session: LibreSession): Promise<LibrePatient[]> {
  let res: Response;
  try {
    res = await llFetch(session.region, "/llu/connections", {
      method: "GET",
      headers: authHeaders(session),
    });
  } catch {
    throw new LibreError("unreachable");
  }

  if (res.status === 401 || res.status === 403) throw new LibreError("unauthorized");
  if (!res.ok) throw new LibreError("unreachable");

  const body = (await res.json()) as ConnectionsResponse;
  return (body.data ?? [])
    .filter((c) => c.patientId)
    .map((c) => ({
      patientId: c.patientId as string,
      firstName: c.firstName ?? "",
      lastName: c.lastName ?? "",
      currentMgdl: c.glucoseMeasurement?.ValueInMgPerDl ?? null,
    }));
}

type GraphResponse = {
  status?: number;
  data?: {
    connection?: {
      firstName?: string;
      lastName?: string;
      glucoseMeasurement?: RawMeasurement | null;
    };
    graphData?: RawMeasurement[];
  };
};

/**
 * Fetches the live measurement + ~12h history for one patient.
 * All values are normalized to mg/dL GlucoseReading, oldest first.
 */
export async function libreGetGraph(
  session: LibreSession,
  patientId: string,
): Promise<LibreGraphResult> {
  let res: Response;
  try {
    res = await llFetch(session.region, `/llu/connections/${encodeURIComponent(patientId)}/graph`, {
      method: "GET",
      headers: authHeaders(session),
    });
  } catch {
    throw new LibreError("unreachable");
  }

  if (res.status === 401 || res.status === 403) throw new LibreError("unauthorized");
  if (!res.ok) throw new LibreError("unreachable");

  const body = (await res.json()) as GraphResponse;
  const connection = body.data?.connection;

  const current = toReading(connection?.glucoseMeasurement);

  const readings = (body.data?.graphData ?? [])
    .map(toReading)
    .filter((r): r is GlucoseReading => r !== null)
    .sort((a, b) => a.date - b.date);

  // The live measurement is newer than the last graph point — append it so
  // the chart line reaches "now".
  if (current && (readings.length === 0 || current.date > readings[readings.length - 1].date)) {
    readings.push(current);
  }

  const patientName = [connection?.firstName, connection?.lastName].filter(Boolean).join(" ");
  return { current, readings, patientName };
}
