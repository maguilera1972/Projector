import { getPublicUrl } from "@/lib/env";
import type { Locale } from "@/lib/i18n/config";
import { getTranslator } from "@/lib/i18n/translate";
import { getMailTranslator } from "@/lib/mail/i18n";

/** Couleurs du thème (`src/app/globals.css`) reprises dans les e-mails. */
export const EMAIL_BRAND = {
  navyDark: "#0f172a",
  navy: "#1e293b",
  cyan: "#7dd3fc",
  indigo: "#818cf8",
  purple: "#a855f7",
  surface: "#f8fafc",
  page: "#f1f5f9",
  border: "#e2e8f0",
  text: "#0f172a",
  body: "#334155",
  muted: "#64748b",
  link: "#4f46e5",
} as const;

export const EMAIL_LOGO_PATH = "/brand/projector-logo-email.png";
const LOGO_WIDTH = 225;
const LOGO_HEIGHT = 47;

const FONT_STACK =
  "Inter,'Segoe UI',-apple-system,BlinkMacSystemFont,Roboto,Helvetica,Arial,sans-serif";
const GRADIENT = `linear-gradient(135deg,${EMAIL_BRAND.cyan} 0%,${EMAIL_BRAND.indigo} 50%,${EMAIL_BRAND.purple} 100%)`;

export interface EmailCta {
  label: string;
  /** URL absolue ou chemin de l'application (`/projets/…`). */
  url: string;
}

export interface EmailDetail {
  label: string;
  value: string;
  /** Lien optionnel sur la valeur (absolu ou chemin de l'application). */
  url?: string;
}

export interface EmailQuote {
  label?: string;
  text: string;
}

/**
 * Contenu d'un e-mail PROJECTOR. Tous les textes sont du texte brut :
 * ils sont échappés au rendu (aucun HTML fourni par l'appelant n'est interprété).
 */
export interface EmailContent {
  locale: Locale;
  /** Par défaut : « [PROJECTOR] {title} ». */
  subject?: string;
  title: string;
  /** Aperçu affiché par les clients mail après l'objet (sinon : intro). */
  preheader?: string;
  greeting?: string;
  intro?: string;
  paragraphs?: string[];
  /** Citation mise en évidence (message personnel, commentaire…). */
  quote?: EmailQuote;
  /** Tableau clé / valeur (projet, phase, échéance…). Les valeurs vides sont ignorées. */
  details?: EmailDetail[];
  cta?: EmailCta;
  /** Affiche le lien brut sous le bouton (défaut : true si `cta`). */
  ctaLinkFallback?: boolean;
  /** Remarques en petit texte après le bouton (validité, consignes…). */
  notes?: string[];
  /** Raison de l'envoi (« Vous recevez ce message car… »). */
  footerNote?: string;
  /** Lien vers les préférences de notification du profil (défaut : true). */
  preferencesLink?: boolean;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeMultiline(value: string): string {
  return escapeHtml(value.replace(/\r\n?/g, "\n")).replace(/\n/g, "<br>");
}

function publicBaseUrl(): string {
  return getPublicUrl().replace(/\/$/, "");
}

/** Rend une URL absolue à partir d'un chemin de l'application. */
export function absoluteUrl(href: string): string {
  if (/^https?:\/\//i.test(href)) return href;
  return `${publicBaseUrl()}${href.startsWith("/") ? "" : "/"}${href}`;
}

/** N'accepte que les liens http(s) ; tout autre schéma (javascript:, data:…) est écarté. */
function safeUrl(href: string): string | null {
  try {
    const url = new URL(absoluteUrl(href.trim()));
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function hostLabel(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function preheaderBlock(text: string): string {
  if (!text) return "";
  const filler = "&#847;&zwnj;&nbsp;".repeat(60);
  return `<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${escapeHtml(text)}${filler}</div>`;
}

function paragraph(text: string, style = "", className = "text-body"): string {
  return `<p class="${className}" style="margin:0 0 16px;font-family:${FONT_STACK};font-size:15px;line-height:24px;color:${EMAIL_BRAND.body};${style}">${escapeMultiline(text)}</p>`;
}

function quoteBlock(quote: EmailQuote): string {
  const label = quote.label
    ? `<p class="text-strong" style="margin:8px 0 8px;font-family:${FONT_STACK};font-size:14px;line-height:20px;font-weight:600;color:${EMAIL_BRAND.text};">${escapeHtml(quote.label)}</p>`
    : "";
  return `${label}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px;">
  <tr><td class="bg-soft text-body" bgcolor="${EMAIL_BRAND.surface}" style="background-color:${EMAIL_BRAND.surface};border-left:3px solid ${EMAIL_BRAND.indigo};padding:12px 16px;font-family:${FONT_STACK};font-size:15px;line-height:24px;color:${EMAIL_BRAND.body};">${escapeMultiline(quote.text)}</td></tr>
</table>`;
}

function detailsBlock(details: EmailDetail[]): string {
  const rows = details
    .map((detail, index) => {
      const border = index === 0 ? "" : `border-top:1px solid ${EMAIL_BRAND.border};`;
      const href = detail.url ? safeUrl(detail.url) : null;
      const value = href
        ? `<a class="link" href="${escapeHtml(href)}" target="_blank" style="color:${EMAIL_BRAND.link};text-decoration:underline;">${escapeHtml(detail.value)}</a>`
        : escapeMultiline(detail.value);
      return `<tr>
    <td class="detail-label text-muted border-soft" width="36%" valign="top" style="${border}padding:10px 16px;font-family:${FONT_STACK};font-size:13px;line-height:20px;color:${EMAIL_BRAND.muted};">${escapeHtml(detail.label)}</td>
    <td class="detail-value text-strong border-soft" valign="top" style="${border}padding:10px 16px;font-family:${FONT_STACK};font-size:14px;line-height:20px;font-weight:600;color:${EMAIL_BRAND.text};">${value}</td>
  </tr>`;
    })
    .join("\n  ");
  return `<table role="presentation" class="bg-soft border-soft" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${EMAIL_BRAND.surface}" style="margin:8px 0 8px;background-color:${EMAIL_BRAND.surface};border:1px solid ${EMAIL_BRAND.border};border-radius:10px;border-collapse:separate;">
  ${rows}
</table>`;
}

/** Bouton « bulletproof » : dégradé de la marque, repli VML arrondi pour Outlook (Windows). */
function ctaButton(label: string, href: string): string {
  const safeLabel = escapeHtml(label);
  const safeHref = escapeHtml(href);
  const vmlWidth = Math.max(200, Math.min(520, Math.round(label.length * 9.5 + 56)));
  return `<table role="presentation" class="btn" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 8px;">
  <tr><td align="center" bgcolor="${EMAIL_BRAND.indigo}" style="border-radius:8px;background-color:${EMAIL_BRAND.indigo};background-image:${GRADIENT};">
    <!--[if mso]>
    <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${safeHref}" style="height:46px;v-text-anchor:middle;width:${vmlWidth}px;" arcsize="18%" stroke="f" fillcolor="${EMAIL_BRAND.indigo}">
      <v:fill type="gradient" color="${EMAIL_BRAND.cyan}" color2="${EMAIL_BRAND.purple}" angle="90" />
      <w:anchorlock/>
      <center style="color:#ffffff;font-family:Arial,sans-serif;font-size:15px;font-weight:bold;">${safeLabel}</center>
    </v:roundrect>
    <![endif]-->
    <!--[if !mso]><!-- --><a href="${safeHref}" target="_blank" style="display:inline-block;padding:13px 28px;font-family:${FONT_STACK};font-size:15px;line-height:20px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">${safeLabel}</a><!--<![endif]-->
  </td></tr>
</table>`;
}

const STYLE_BLOCK = `<style>
  :root { color-scheme: light dark; supported-color-schemes: light dark; }
  body { margin:0 !important; padding:0 !important; width:100% !important; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
  table, td { mso-table-lspace:0pt; mso-table-rspace:0pt; }
  img { border:0; outline:none; text-decoration:none; -ms-interpolation-mode:bicubic; }
  a[x-apple-data-detectors] { color:inherit !important; text-decoration:none !important; }
  @media only screen and (max-width:620px) {
    .px-card { padding-left:20px !important; padding-right:20px !important; }
    .email-title { font-size:20px !important; line-height:28px !important; }
    .detail-label, .detail-value { display:block !important; width:auto !important; }
    .detail-value { border-top:0 !important; padding-top:0 !important; }
  }
  @media (prefers-color-scheme: dark) {
    .bg-page { background-color:#0b1120 !important; }
    .bg-card { background-color:${EMAIL_BRAND.navy} !important; border-color:#334155 !important; }
    .bg-soft { background-color:${EMAIL_BRAND.navyDark} !important; }
    .border-soft { border-color:#334155 !important; }
    .text-strong { color:#f1f5f9 !important; }
    .text-body { color:#cbd5e1 !important; }
    .text-muted { color:#94a3b8 !important; }
    .link { color:#a5b4fc !important; }
  }
</style>`;

/** Gabarit HTML commun à tous les e-mails PROJECTOR (+ version texte brut). */
export function renderEmail(content: EmailContent): RenderedEmail {
  const t = getTranslator(content.locale);
  const tm = getMailTranslator(content.locale);
  const portalUrl = `${publicBaseUrl()}/`;
  const preferencesUrl = `${publicBaseUrl()}/parametres/profil`;
  const assetsBase = (process.env.PROJECTOR_MAIL_ASSETS_URL?.trim() || publicBaseUrl()).replace(/\/$/, "");
  const logoUrl = `${assetsBase}${EMAIL_LOGO_PATH}`;
  const subject = content.subject ?? `[PROJECTOR] ${content.title}`;
  const tagline = t("email.footer");
  const reason = content.footerNote ?? tm("layout.defaultReason");
  const showPreferences = content.preferencesLink !== false;
  const ctaUrl = content.cta ? safeUrl(content.cta.url) : null;
  const showFallback = Boolean(ctaUrl) && content.ctaLinkFallback !== false;
  const details = (content.details ?? []).filter((detail) => detail.value.trim() !== "");
  const preheader = content.preheader ?? content.intro ?? content.paragraphs?.[0] ?? "";

  const body: string[] = [
    `<h1 class="email-title text-strong" style="margin:0 0 20px;font-family:${FONT_STACK};font-size:22px;line-height:30px;font-weight:700;color:${EMAIL_BRAND.text};">${escapeHtml(content.title)}</h1>`,
  ];
  if (content.greeting) body.push(paragraph(content.greeting));
  if (content.intro) body.push(paragraph(content.intro));
  for (const text of content.paragraphs ?? []) body.push(paragraph(text));
  if (content.quote?.text.trim()) body.push(quoteBlock(content.quote));
  if (details.length > 0) body.push(detailsBlock(details));
  if (ctaUrl && content.cta) body.push(ctaButton(content.cta.label, ctaUrl));
  if (showFallback && ctaUrl) {
    body.push(
      `<p class="text-muted" style="margin:8px 0 16px;font-family:${FONT_STACK};font-size:12px;line-height:18px;color:${EMAIL_BRAND.muted};">${escapeHtml(tm("layout.linkFallback"))}<br><a class="link" href="${escapeHtml(ctaUrl)}" target="_blank" style="color:${EMAIL_BRAND.link};text-decoration:underline;word-break:break-all;">${escapeHtml(ctaUrl)}</a></p>`,
    );
  }
  for (const note of content.notes ?? []) {
    body.push(
      paragraph(
        note,
        `font-size:13px;line-height:20px;color:${EMAIL_BRAND.muted};margin:0 0 8px;`,
        "text-muted",
      ),
    );
  }

  const footerLinks = [
    `<a class="link" href="${escapeHtml(portalUrl)}" target="_blank" style="color:${EMAIL_BRAND.link};text-decoration:none;font-weight:600;">${escapeHtml(hostLabel(portalUrl))}</a>`,
    showPreferences
      ? `<a class="link" href="${escapeHtml(preferencesUrl)}" target="_blank" style="color:${EMAIL_BRAND.link};text-decoration:underline;">${escapeHtml(tm("layout.preferences"))}</a>`
      : "",
  ]
    .filter(Boolean)
    .join(`&nbsp;&nbsp;·&nbsp;&nbsp;`);

  const html = `<!DOCTYPE html>
<html lang="${content.locale}" dir="ltr" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="x-apple-disable-message-reformatting">
<meta name="format-detection" content="telephone=no,address=no,email=no,date=no,url=no">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${escapeHtml(subject)}</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
${STYLE_BLOCK}
</head>
<body class="bg-page" style="margin:0;padding:0;background-color:${EMAIL_BRAND.page};">
${preheaderBlock(preheader)}
<table role="presentation" class="bg-page" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${EMAIL_BRAND.page}" style="background-color:${EMAIL_BRAND.page};">
  <tr><td align="center" style="padding:24px 12px;">
    <!--[if mso]><table role="presentation" width="600" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;margin:0 auto;">
      <tr><td bgcolor="${EMAIL_BRAND.navyDark}" style="background-color:${EMAIL_BRAND.navyDark};padding:22px 32px;border-radius:12px 12px 0 0;" class="px-card">
        <a href="${escapeHtml(portalUrl)}" target="_blank" style="text-decoration:none;"><img src="${escapeHtml(logoUrl)}" width="${LOGO_WIDTH}" height="${LOGO_HEIGHT}" alt="PROJECTOR" style="display:block;width:${LOGO_WIDTH}px;max-width:100%;height:auto;border:0;font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:${LOGO_HEIGHT}px;font-weight:700;letter-spacing:3px;color:#ffffff;"></a>
      </td></tr>
      <tr><td height="4" bgcolor="${EMAIL_BRAND.indigo}" style="height:4px;line-height:4px;font-size:4px;mso-line-height-rule:exactly;background-color:${EMAIL_BRAND.indigo};background-image:linear-gradient(90deg,${EMAIL_BRAND.cyan},${EMAIL_BRAND.indigo},${EMAIL_BRAND.purple});">&nbsp;</td></tr>
      <tr><td class="bg-card px-card" bgcolor="#ffffff" style="background-color:#ffffff;padding:32px;border:1px solid ${EMAIL_BRAND.border};border-top:0;border-radius:0 0 12px 12px;">
${body.join("\n")}
      </td></tr>
      <tr><td align="center" class="px-card" style="padding:24px 32px 8px;font-family:${FONT_STACK};">
        <p class="text-muted" style="margin:0 0 8px;font-family:${FONT_STACK};font-size:13px;line-height:20px;font-weight:600;color:${EMAIL_BRAND.muted};">${escapeHtml(tagline)}</p>
        <p style="margin:0 0 12px;font-family:${FONT_STACK};font-size:13px;line-height:20px;">${footerLinks}</p>
        <p class="text-muted" style="margin:0;font-family:${FONT_STACK};font-size:12px;line-height:18px;color:${EMAIL_BRAND.muted};">${escapeHtml(reason)}</p>
      </td></tr>
    </table>
    <!--[if mso]></td></tr></table><![endif]-->
  </td></tr>
</table>
</body>
</html>`;

  const text = renderText(content, {
    ctaUrl,
    details,
    tagline,
    reason,
    portalUrl,
    preferencesUrl: showPreferences ? preferencesUrl : null,
    preferencesLabel: tm("layout.preferences"),
  });
  return { subject, html, text };
}

function renderText(
  content: EmailContent,
  extra: {
    ctaUrl: string | null;
    details: EmailDetail[];
    tagline: string;
    reason: string;
    portalUrl: string;
    preferencesUrl: string | null;
    preferencesLabel: string;
  },
): string {
  const colon = content.locale === "fr" ? " : " : ": ";
  const blocks: string[] = [content.title, "=".repeat(Math.min(content.title.length, 72))];
  const push = (text?: string) => {
    if (text && text.trim()) blocks.push("", text.trim());
  };
  push(content.greeting);
  push(content.intro);
  for (const text of content.paragraphs ?? []) push(text);
  if (content.quote?.text.trim()) {
    push(
      [
        content.quote.label,
        ...content.quote.text.trim().split(/\r?\n/).map((line) => `> ${line}`),
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }
  if (extra.details.length > 0) {
    push(
      extra.details
        .map(
          (detail) =>
            `${detail.label}${colon}${detail.value}${detail.url ? ` (${absoluteUrl(detail.url)})` : ""}`,
        )
        .join("\n"),
    );
  }
  if (extra.ctaUrl && content.cta) push(`${content.cta.label}${colon.trimEnd()}\n${extra.ctaUrl}`);
  for (const note of content.notes ?? []) push(note);
  blocks.push("", "--", extra.tagline, extra.portalUrl);
  if (extra.preferencesUrl) blocks.push(`${extra.preferencesLabel}${colon}${extra.preferencesUrl}`);
  blocks.push("", extra.reason);
  return `${blocks.join("\n")}\n`;
}
