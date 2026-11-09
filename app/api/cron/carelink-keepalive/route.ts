import { keepCareLinkAlive } from "@/lib/glucose/carelink-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
// Same region as the pages that connect; Medtronic blocks some datacenter IPs.
export const preferredRegion = "sfo1";

// Vercel Cron sends `Authorization: Bearer $CRON_SECRET` when CRON_SECRET is set.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ ok: false }, { status: 401 });
  }

  const results = await keepCareLinkAlive();
  return Response.json({
    ok: true,
    accounts: results.length,
    refreshed: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).map((r) => r.error),
  });
}
