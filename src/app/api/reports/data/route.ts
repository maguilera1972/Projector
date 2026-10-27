import { NextResponse, type NextRequest } from "next/server";
import { parseReportParams } from "@/lib/reports/access";
import { authorizeReportRequest, reportError } from "@/lib/reports/http";
import { generateReport } from "@/lib/reports/service";

export async function GET(request: NextRequest) {
  const auth = await authorizeReportRequest();
  if (!auth.ok) return auth.response;

  const params = parseReportParams(request.nextUrl.searchParams, auth.uiLocale);
  if (!params) return reportError(auth.t, 400, "invalid");

  const result = await generateReport(auth.user, params);
  if (!result.ok) return reportError(auth.t, result.status, result.code);

  return NextResponse.json(
    { report: result.document },
    { headers: { "Cache-Control": "no-store" } },
  );
}
