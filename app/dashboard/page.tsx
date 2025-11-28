import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { LogoutButton } from "@/components/logout-button";

export default async function DashboardPage() {
  const session = await auth();

  if (!session) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
      <div className="w-full max-w-lg bg-card border border-border rounded-xl shadow-sm p-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold">Dashboard</h1>

          {/* Client logout button */}
          <LogoutButton />
        </div>

        <p className="text-lg text-muted-foreground">
          Logged in as <span className="font-medium">{session.user?.email}</span>
        </p>
      </div>
    </div>
  );
}
