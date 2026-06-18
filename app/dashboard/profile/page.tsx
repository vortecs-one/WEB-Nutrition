// app/dashboard/profile/page.tsx
import { getCurrentRole } from "@/lib/role/server";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getHuman, type HumanData } from "@/lib/thruxion-api";
import ProfileForm from "./ProfileForm";

// Personal information view for normal users.
export default async function ProfilePage() {
  const role = await getCurrentRole();

  // This view is for normal users; nutritionists use the patients module.
  if (role !== "user") {
    redirect("/dashboard");
  }

  // Load the logged-in user's full human record from the Thruxion API using
  // the human_id captured at login.
  const session = await auth();
  const humanId = (session?.user as { humanId?: string | null })?.humanId;

  let human: HumanData | null = null;
  if (humanId) {
    try {
      human = await getHuman(humanId);
    } catch (err) {
      console.log("[v0] getHuman error:", (err as Error).message);
    }
  }

  return <ProfileForm human={human} />;
}
