import "server-only";
import { auth } from "@/auth";

// Accounts that may choose exclusive companions (e.g. the Humboldt penguin).
// Everyone else sees them locked.
const EXCLUSIVE_PET_EMAILS = new Set([
  "vinka.jalilc@gmail.com",
  "vortecs.ink@gmail.com",
]);

export function isExclusivePetEmail(email: string | null | undefined): boolean {
  return !!email && EXCLUSIVE_PET_EMAILS.has(email.trim().toLowerCase());
}

export async function canUseExclusivePets(): Promise<boolean> {
  const session = await auth();
  return isExclusivePetEmail(session?.user?.email);
}
