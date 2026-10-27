/**
 * Envoi d'e-mails via Microsoft Graph (flux « client credentials »).
 * Permission d'application requise : Mail.Send (consentement administrateur),
 * idéalement restreinte à la boîte expéditrice (RBAC for Applications / Application Access Policy).
 */

interface GraphConfig {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  sender: string;
}

export interface MailMessage {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}

export type MailResult =
  | { ok: true }
  | { ok: false; reason: "not_configured" | "failed"; error: string };

export function getGraphConfig(): GraphConfig | null {
  const tenantId = process.env.MS_GRAPH_TENANT_ID?.trim();
  const clientId = process.env.MS_GRAPH_CLIENT_ID?.trim();
  const clientSecret = process.env.MS_GRAPH_CLIENT_SECRET?.trim();
  const sender = process.env.MAIL_FROM?.trim();
  if (!tenantId || !clientId || !clientSecret || !sender) return null;
  return { tenantId, clientId, clientSecret, sender };
}

export function isMailConfigured(): boolean {
  return getGraphConfig() !== null;
}

export function getMailSender(): string | null {
  return getGraphConfig()?.sender ?? null;
}

let cachedToken: { value: string; expiresAt: number; key: string } | null = null;

export async function getGraphAppToken(config: GraphConfig): Promise<string> {
  const key = `${config.tenantId}:${config.clientId}`;
  if (cachedToken && cachedToken.key === key && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.value;
  }

  const response = await fetch(
    `https://login.microsoftonline.com/${encodeURIComponent(config.tenantId)}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        scope: "https://graph.microsoft.com/.default",
        grant_type: "client_credentials",
      }),
      cache: "no-store",
    },
  );

  const data = (await response.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };

  if (!response.ok || !data.access_token) {
    throw new Error(
      `Jeton Entra refusé (${response.status}) : ${data.error ?? ""} ${
        data.error_description?.split("\r\n")[0] ?? ""
      }`.trim(),
    );
  }

  cachedToken = {
    key,
    value: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
  return data.access_token;
}

export async function sendMail(message: MailMessage): Promise<MailResult> {
  const config = getGraphConfig();
  if (!config) {
    return {
      ok: false,
      reason: "not_configured",
      error: "Microsoft Graph non configuré (MS_GRAPH_* / MAIL_FROM).",
    };
  }

  try {
    const token = await getGraphAppToken(config);
    const recipients = (Array.isArray(message.to) ? message.to : [message.to]).map(
      (address) => ({ emailAddress: { address } }),
    );

    const response = await fetch(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(config.sender)}/sendMail`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: {
            subject: message.subject,
            body: { contentType: "HTML", content: message.html },
            toRecipients: recipients,
            ...(message.replyTo
              ? { replyTo: [{ emailAddress: { address: message.replyTo } }] }
              : {}),
          },
          saveToSentItems: false,
        }),
        cache: "no-store",
      },
    );

    if (response.status === 202 || response.ok) return { ok: true };

    const body = (await response.json().catch(() => ({}))) as {
      error?: { code?: string; message?: string };
    };
    return {
      ok: false,
      reason: "failed",
      error: `Graph ${response.status} ${body.error?.code ?? ""} ${body.error?.message ?? ""}`.trim(),
    };
  } catch (error) {
    return {
      ok: false,
      reason: "failed",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
