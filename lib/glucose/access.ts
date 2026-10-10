import "server-only";
import { auth } from "@/auth";

const GLUCOSE_ALLOWED_EMAILS = new Set([
  "vinka.jalilc@gmail.com",
  "vortecs.ink@gmail.com",
]);

export function isGlucoseEmailAllowed(email: string | null | undefined): boolean {
  return !!email && GLUCOSE_ALLOWED_EMAILS.has(email.trim().toLowerCase());
}

export async function canAccessGlucose(): Promise<boolean> {
  const session = await auth();
  return isGlucoseEmailAllowed(session?.user?.email);
}
