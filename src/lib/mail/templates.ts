import { getPublicUrl } from "@/lib/env";
import { toIntlLocale, type Locale } from "@/lib/i18n/config";
import { getTranslator, tDynamic } from "@/lib/i18n/translate";
import type { InvitationSummary, Notification } from "@/types";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function absoluteUrl(href: string): string {
  if (/^https?:\/\//.test(href)) return href;
  return `${getPublicUrl().replace(/\/$/, "")}${href.startsWith("/") ? "" : "/"}${href}`;
}

function layout(locale: Locale, content: string): string {
  const t = getTranslator(locale);
  return `<!doctype html>
<html lang="${locale}">
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#0f172a;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">
        <tr><td style="background:#0f172a;padding:18px 28px;">
          <span style="font-size:18px;font-weight:700;letter-spacing:2px;color:#ffffff;">PROJECTOR</span>
        </td></tr>
        <tr><td style="padding:28px;font-size:15px;line-height:1.6;">${content}</td></tr>
        <tr><td style="padding:16px 28px;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b;">${escapeHtml(t("email.footer"))}</td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function button(label: string, href: string): string {
  return `<p style="margin:24px 0;"><a href="${escapeHtml(href)}" style="display:inline-block;background:linear-gradient(135deg,#7dd3fc,#818cf8,#a855f7);background-color:#818cf8;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:8px;">${escapeHtml(label)}</a></p>`;
}

export function buildInvitationEmail(
  invitation: InvitationSummary,
  token: string,
): { subject: string; html: string } {
  const locale = invitation.locale;
  const t = getTranslator(locale);
  const role = tDynamic(t, `enums.role.${invitation.role}`);
  const link = absoluteUrl(`/invitation/${encodeURIComponent(token)}`);
  const expires = new Intl.DateTimeFormat(toIntlLocale(locale), {
    dateStyle: "long",
    timeZone: "Europe/Zurich",
  }).format(new Date(invitation.expiresAt));

  const greeting = invitation.name
    ? t("email.greetingName", { name: invitation.name })
    : t("email.greeting");

  const personal = invitation.message
    ? `<p style="margin:16px 0 4px;font-weight:600;">${escapeHtml(t("email.invitation.personalMessage"))}</p>
       <blockquote style="margin:0;padding:12px 16px;background:#f8fafc;border-left:3px solid #818cf8;white-space:pre-line;">${escapeHtml(invitation.message)}</blockquote>`
    : "";

  const content = `
    <p>${escapeHtml(greeting)}</p>
    <p>${escapeHtml(t("email.invitation.body", { inviter: invitation.invitedByName, role }))}</p>
    ${personal}
    ${button(t("email.invitation.cta"), link)}
    <p style="font-size:13px;color:#475569;">${escapeHtml(t("email.invitation.expires", { date: expires }))}</p>
    <p style="font-size:12px;color:#64748b;word-break:break-all;">${escapeHtml(link)}</p>
    <p style="font-size:13px;color:#64748b;">${escapeHtml(t("email.invitation.ignore"))}</p>`;

  return {
    subject: t("email.invitation.subject", { inviter: invitation.invitedByName }),
    html: layout(locale, content),
  };
}

export function buildNotificationEmail(
  notification: Notification,
  recipientName: string,
  locale: Locale,
): { subject: string; html: string } {
  const t = getTranslator(locale);
  const content = `
    <p>${escapeHtml(t("email.greetingName", { name: recipientName }))}</p>
    <p style="font-size:17px;font-weight:600;margin:0 0 8px;">${escapeHtml(notification.title)}</p>
    <p>${escapeHtml(notification.message)}</p>
    ${notification.href ? button(t("email.notification.cta"), absoluteUrl(notification.href)) : ""}
    <p style="font-size:12px;color:#64748b;">${escapeHtml(t("email.notification.reason"))}</p>`;

  return {
    subject: t("email.notification.subject", { title: notification.title }),
    html: layout(locale, content),
  };
}

export function buildTestEmail(locale: Locale): { subject: string; html: string } {
  const t = getTranslator(locale);
  return {
    subject: t("email.test.subject"),
    html: layout(locale, `<p>${escapeHtml(t("email.test.body"))}</p>`),
  };
}
