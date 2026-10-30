import "server-only";
import { auth } from "@/auth";
import { glucoseRoleForEmail } from "@/lib/glucose/access";

// Accounts that may choose exclusive companions (e.g. the Humboldt penguin
// and Penguin Girl) and try their moods by hand: the glucose sensor owner and
// their health watchers (see lib/glucose/access.ts).
// Everyone else sees them locked.
export function isExclusivePetEmail(email: string | null | undefined): boolean {
  return glucoseRoleForEmail(email) !== null;
}

export async function canUseExclusivePets(): Promise<boolean> {
  const session = await auth();
  return isExclusivePetEmail(session?.user?.email);
}
