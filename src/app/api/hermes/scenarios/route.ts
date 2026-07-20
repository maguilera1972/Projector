import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { listScenarios } from "@/lib/hermes/referential";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const scenarios = listScenarios().map((scenario) => ({
    id: scenario.id,
    label: scenario.labelFr,
    description: scenario.descriptionFr,
    moduleCount: scenario.moduleIds.length,
  }));

  return NextResponse.json({ scenarios });
}
