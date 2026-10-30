import "server-only";
import { auth } from "@/auth";
import type { GlucoseRole } from "./types";

export type { GlucoseRole };

// Glucose access comes in two roles, both configured through env vars so no
// personal email lives in the (public) source:
//   - owner:   GLUCOSE_OWNER_EMAIL, the person wearing the sensor. Only the
//              owner sees and edits the glucose source login and settings.
//   - watcher: GLUCOSE_WATCHER_EMAILS (comma-separated), people with remote
//              read-only access to the owner's readings (doctors, family…).
// Unset variables grant nobody access.

const normalize = (email: string) => email.trim().toLowerCase();

export function getGlucoseOwnerEmail(): string | null {
  const owner = normalize(process.env.GLUCOSE_OWNER_EMAIL ?? "");
  return owner || null;
}

function watcherEmails(): Set<string> {
  return new Set(
    (process.env.GLUCOSE_WATCHER_EMAILS ?? "").split(",").map(normalize).filter(Boolean),
  );
}

export function glucoseRoleForEmail(email: string | null | undefined): GlucoseRole | null {
  if (!email) return null;
  const e = normalize(email);
  if (!e) return null;
  if (e === getGlucoseOwnerEmail()) return "owner";
  return watcherEmails().has(e) ? "watcher" : null;
}

export async function getGlucoseRole(): Promise<GlucoseRole | null> {
  const session = await auth();
  return glucoseRoleForEmail(session?.user?.email);
}

export async function canAccessGlucose(): Promise<boolean> {
  return (await getGlucoseRole()) !== null;
}
