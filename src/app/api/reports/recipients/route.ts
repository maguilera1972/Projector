import { NextResponse, type NextRequest } from "next/server";
import { isMailConfigured } from "@/lib/mail/graph";
import { listReportRecipients, parseReportParams, resolveReportScope } from "@/lib/reports/access";
import { authorizeReportRequest, reportError } from "@/lib/reports/http";

export async function GET(request: NextRequest) {
  const auth = await authorizeReportRequest();
  if (!auth.ok) return auth.response;

  const params = parseReportParams(request.nextUrl.searchParams, auth.uiLocale);
  if (!params) return reportError(auth.t, 400, "invalid");

  const scope = await resolveReportScope(auth.user, params);
  if (!scope.ok) return reportError(auth.t, scope.status, scope.code);

  const recipients = await listReportRecipients(scope.projects, scope.portfolios);
  return NextResponse.json(
    { recipients, mailConfigured: isMailConfigured() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
