import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { listScenarios } from "@/lib/hermes/referential";
import { localizeScenario } from "@/lib/hermes/i18n";
import { getRequestLocale } from "@/lib/i18n/server";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const locale = await getRequestLocale();
  const scenarios = listScenarios().map((scenario) => {
    const localized = localizeScenario(scenario.id, locale);
    return {
      id: scenario.id,
      label: localized?.label ?? scenario.labelFr,
      description: localized?.description ?? scenario.descriptionFr,
      moduleCount: scenario.moduleIds.length,
    };
  });

  return NextResponse.json({ scenarios });
}
