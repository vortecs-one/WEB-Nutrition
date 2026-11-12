import ProfileView from "@/app/dashboard/profile/ProfileView";
import ProfileModal from "./ProfileModal";

// /dashboard/profile reached by in-app navigation on mobile: the form opens as
// a popup over the current page. Desktop, direct visits and reloads get the
// full page (see ProfileModal).
export default function ProfileModalPage() {
  return (
    <ProfileModal>
      <ProfileView inModal />
    </ProfileModal>
  );
}
