// app/dashboard/groups/page.tsx
import { db } from "@/lib/db";
import { workGroups } from "@/drizzle/schema";
import WorkGroupsTable from "./WorkGroupsTable";

export const dynamic = "force-dynamic";

export default async function GroupsPage() {
  const groups = await db.select().from(workGroups).orderBy(workGroups.id);

  return (
    <div className="space-y-4">
      <WorkGroupsTable groups={groups} />
    </div>
  );
}
