import { NextResponse, type NextRequest } from "next/server";
import { parseReportParams } from "@/lib/reports/access";
import { authorizeReportRequest, reportError } from "@/lib/reports/http";
import { buildReportPdfFilename, renderReportPdf } from "@/lib/reports/pdf/render";
import { generateReport } from "@/lib/reports/service";

export async function GET(request: NextRequest) {
  const auth = await authorizeReportRequest();
  if (!auth.ok) return auth.response;

  const params = parseReportParams(request.nextUrl.searchParams, auth.uiLocale);
  if (!params) return reportError(auth.t, 400, "invalid");

  const result = await generateReport(auth.user, params);
  if (!result.ok) return reportError(auth.t, result.status, result.code);

  const pdf = renderReportPdf(result.document);
  const filename = buildReportPdfFilename(result.document);
  const disposition = request.nextUrl.searchParams.get("inline") === "1" ? "inline" : "attachment";

  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${disposition}; filename="${filename}"`,
      "Content-Length": String(pdf.length),
      "Cache-Control": "no-store",
    },
  });
}
