// app/dashboard/profile/page.tsx
import ProfileView from "./ProfileView";

// Personal information view for normal users (full page: desktop, direct
// visits and reloads). In-app navigation on mobile opens it as a popup
// instead, see app/dashboard/@modal/(.)profile.
export default function ProfilePage() {
  return <ProfileView />;
}
