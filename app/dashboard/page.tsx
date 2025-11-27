import { auth } from "@/auth";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  const session = await auth();

  if (!session) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
      <div className="w-full max-w-lg bg-card border border-border rounded-xl shadow-sm p-8">
        <h1 className="text-3xl font-bold mb-4">
          Welcome to the Nutrition Dashboard
        </h1>

        <p className="text-lg text-muted-foreground">
          Logged in as <span className="font-medium">{session.user?.email}</span>
        </p>

        <div className="mt-6">
          <a
            href="/"
            className="inline-block bg-primary text-primary-foreground px-4 py-2 rounded-lg hover:bg-primary/90"
          >
            Go Home
          </a>
        </div>
      </div>
    </div>
  );
}

