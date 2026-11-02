import ProfileView from "@/app/dashboard/profile/ProfileView";
import ProfileModal from "./ProfileModal";

// /dashboard/profile reached by in-app navigation: the form opens as a popup
// over the current page. Direct visits and reloads get the full page.
export default function ProfileModalPage() {
  return (
    <ProfileModal>
      <ProfileView inModal />
    </ProfileModal>
  );
}
