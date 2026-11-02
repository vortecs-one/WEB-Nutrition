import { getCurrentRole } from "@/lib/role/server";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getHuman, type HumanData } from "@/lib/thruxion-api";
import { fetchBodyProfile } from "@/lib/body-profile/actions";
import ProfileForm from "./ProfileForm";

// Loads the data behind the profile form; shared by the full page and the popup.
export default async function ProfileView({ inModal = false }: { inModal?: boolean }) {
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

  // Body data for the calorie formulas (sex and birth date fall back to the
  // Thruxion record until saved here).
  const bodyProfile = await fetchBodyProfile();

  return <ProfileForm human={human} bodyProfile={bodyProfile} inModal={inModal} />;
}
