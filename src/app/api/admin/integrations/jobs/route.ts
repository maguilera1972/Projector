import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/integrations/http";
import { runIntegrationJobs } from "@/lib/integrations/jobs";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const body = (await request.json().catch(() => ({}))) as { forceWeekly?: boolean };
  const report = await runIntegrationJobs({ forceWeekly: body.forceWeekly === true });
  return NextResponse.json({ report });
}
