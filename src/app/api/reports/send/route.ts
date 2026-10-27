import { NextResponse, type NextRequest } from "next/server";
import { parseReportParams } from "@/lib/reports/access";
import { MAX_REPORT_RECIPIENTS, sendReportByEmail, type SendRecipientInput } from "@/lib/reports/email";
import { authorizeReportRequest, reportError } from "@/lib/reports/http";

function parseRecipients(value: unknown): SendRecipientInput[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_REPORT_RECIPIENTS) return null;
  const recipients: SendRecipientInput[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") return null;
    const { userId, email, name } = item as Record<string, unknown>;
    if (typeof userId !== "string" && typeof email !== "string") return null;
    recipients.push({
      userId: typeof userId === "string" ? userId : undefined,
      email: typeof email === "string" ? email.trim() : undefined,
      name: typeof name === "string" ? name.slice(0, 120) : undefined,
    });
  }
  return recipients;
}

export async function POST(request: NextRequest) {
  const auth = await authorizeReportRequest();
  if (!auth.ok) return auth.response;

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return reportError(auth.t, 400, "invalid");

  const params = parseReportParams(body, auth.uiLocale);
  const recipients = parseRecipients(body.recipients);
  if (!params || !recipients) return reportError(auth.t, 400, "invalid");

  const result = await sendReportByEmail({
    user: auth.user,
    params,
    recipients,
    message: typeof body.message === "string" ? body.message : undefined,
    perRecipientLocale: body.perRecipientLocale !== false,
  });

  if (!result.ok) {
    if (result.code === "invalid" && result.detail) {
      return NextResponse.json(
        { error: `${auth.t("ui.invalidEmail")} (${result.detail})`, code: "invalid" },
        { status: 400 },
      );
    }
    return reportError(auth.t, result.status, result.code);
  }

  return NextResponse.json({
    sent: result.sent.length,
    failed: result.failed,
    attached: result.attached,
  });
}
