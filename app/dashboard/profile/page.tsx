// app/dashboard/profile/page.tsx
import { getCurrentRole } from "@/lib/role/server";
import { redirect } from "next/navigation";
import ProfileForm from "./ProfileForm";

// Personal information view for normal users.
export default async function ProfilePage() {
  const role = await getCurrentRole();

  // This view is for normal users; nutritionists use the patients module.
  if (role !== "user") {
    redirect("/dashboard");
  }

  return <ProfileForm />;
}
