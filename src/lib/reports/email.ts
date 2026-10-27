import type { SessionUser } from "@/lib/auth/permissions";
import { appendAuditEntries, listUsers } from "@/lib/db/store";
import { getPublicUrl } from "@/lib/env";
import { normalizeLocale, type Locale } from "@/lib/i18n/config";
import { getTranslator } from "@/lib/i18n/translate";
import { isMailConfigured } from "@/lib/mail/graph";
import type { EmailContent } from "@/lib/mail/layout";
import { sendBrandedMail } from "@/lib/mail/send";
import { reportParamsToSearch } from "./access";
import { createFormatter } from "./format";
import { getReportTranslator } from "./i18n";
import { buildReportPdfFilename, renderReportPdf } from "./pdf/render";
import { generateReport } from "./service";
import type { ReportDocument, ReportParams } from "./types";

/** Au-delà, le PDF n'est pas joint (limite Graph sendMail) : seul le lien sécurisé est envoyé. */
const MAX_ATTACHMENT_BYTES = 3 * 1024 * 1024;
export const MAX_REPORT_RECIPIENTS = 25;

const EMAIL_PATTERN = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;

export function isValidEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value) && value.length <= 254;
}

export function buildReportLink(params: ReportParams): string {
  return `${getPublicUrl().replace(/\/$/, "")}/rapports?${reportParamsToSearch(params).toString()}`;
}

function buildReportEmail(input: {
  doc: ReportDocument;
  locale: Locale;
  recipientName?: string;
  senderName: string;
  message?: string;
  link: string;
  attached: boolean;
}): EmailContent {
  const t = getReportTranslator(input.locale);
  const tm = getTranslator(input.locale);
  const fmt = createFormatter(input.locale);
  const message = input.message?.trim();
  return {
    locale: input.locale,
    subject: t("email.subject", { title: input.doc.title, scope: input.doc.scopeLabel }),
    title: input.doc.title,
    greeting: input.recipientName
      ? t("email.greeting", { name: input.recipientName })
      : tm("email.greeting"),
    intro: t("email.intro", {
      sender: input.senderName,
      title: input.doc.title,
      scope: input.doc.scopeLabel,
      date: fmt.dateTime(input.doc.generatedAt),
    }),
    paragraphs: [input.attached ? t("email.attached") : t("email.tooLarge")],
    quote: message
      ? { label: t("email.personalMessage", { sender: input.senderName }), text: message }
      : undefined,
    details: [
      { label: input.doc.labels.scope, value: input.doc.scopeLabel },
      { label: input.doc.labels.period, value: input.doc.periodLabel },
    ],
    cta: { label: t("email.cta"), url: input.link },
    notes: [t("email.link")],
    footerNote: t("email.reason"),
    preferencesLink: false,
  };
}

export interface SendRecipientInput {
  userId?: string;
  email?: string;
  name?: string;
}

export type SendReportResult =
  | {
      ok: true;
      sent: { email: string; name?: string }[];
      failed: { email: string; error: string }[];
      attached: boolean;
    }
  | {
      ok: false;
      status: 400 | 403 | 404 | 503;
      code: "forbidden" | "notFound" | "projectRequired" | "mailNotConfigured" | "invalid";
      detail?: string;
    };

export async function sendReportByEmail(input: {
  user: SessionUser;
  params: ReportParams;
  recipients: SendRecipientInput[];
  message?: string;
  perRecipientLocale: boolean;
}): Promise<SendReportResult> {
  const { user, params } = input;
  const base = await generateReport(user, params);
  if (!base.ok) return base;
  if (!isMailConfigured()) return { ok: false, status: 503, code: "mailNotConfigured" };

  const users = await listUsers();
  const byId = new Map(users.map((item) => [item.id, item]));
  const byEmail = new Map(users.map((item) => [item.email.toLowerCase(), item]));

  const resolved = new Map<string, { email: string; name?: string; locale: Locale }>();
  for (const recipient of input.recipients) {
    const platformUser = recipient.userId
      ? byId.get(recipient.userId)
      : recipient.email
        ? byEmail.get(recipient.email.trim().toLowerCase())
        : undefined;
    const email = (platformUser?.email ?? recipient.email ?? "").trim();
    if (!isValidEmail(email)) {
      return { ok: false, status: 400, code: "invalid", detail: email || recipient.userId };
    }
    resolved.set(email.toLowerCase(), {
      email,
      name: platformUser?.name ?? recipient.name?.trim() ?? undefined,
      locale: input.perRecipientLocale && platformUser ? normalizeLocale(platformUser.locale) : params.locale,
    });
  }
  if (resolved.size === 0 || resolved.size > MAX_REPORT_RECIPIENTS) {
    return { ok: false, status: 400, code: "invalid" };
  }

  const rendered = new Map<Locale, { doc: ReportDocument; pdf: Buffer; filename: string }>();
  const renderFor = async (locale: Locale) => {
    const cached = rendered.get(locale);
    if (cached) return cached;
    const generation =
      locale === params.locale ? base : await generateReport(user, { ...params, locale });
    if (!generation.ok) throw new Error(generation.code);
    const pdf = renderReportPdf(generation.document);
    const value = { doc: generation.document, pdf, filename: buildReportPdfFilename(generation.document) };
    rendered.set(locale, value);
    return value;
  };

  const sent: { email: string; name?: string }[] = [];
  const failed: { email: string; error: string }[] = [];
  let attachedAll = true;
  const message = input.message?.slice(0, 4000);

  for (const recipient of resolved.values()) {
    const { doc, pdf, filename } = await renderFor(recipient.locale);
    const attached = pdf.length <= MAX_ATTACHMENT_BYTES;
    if (!attached) attachedAll = false;
    const link = buildReportLink({ ...params, locale: recipient.locale });
    const email = buildReportEmail({
      doc,
      locale: recipient.locale,
      recipientName: recipient.name,
      senderName: user.name,
      message,
      link,
      attached,
    });
    const result = await sendBrandedMail({
      to: recipient.email,
      email,
      replyTo: user.email,
      attachments: attached ? [{ name: filename, contentType: "application/pdf", content: pdf }] : undefined,
    });
    if (result.ok) sent.push({ email: recipient.email, name: recipient.name });
    else failed.push({ email: recipient.email, error: result.error });
  }

  await appendAuditEntries(
    base.projectIds.map((projectId) => ({
      projectId,
      action: "report.sent",
      actorId: user.id,
      actorName: user.name,
      details: {
        reportType: params.type,
        scope: params.scope.kind,
        portfolioId: params.scope.kind === "portfolio" ? params.scope.portfolioId : undefined,
        from: params.from,
        to: params.to,
        locale: params.locale,
        recipients: sent.map((item) => item.email),
        failed: failed.map((item) => item.email),
        attached: attachedAll,
      },
    })),
  );

  return { ok: true, sent, failed, attached: attachedAll };
}
