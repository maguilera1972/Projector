import { getPublicUrl } from "@/lib/env";
import type { Translator } from "@/lib/i18n/translate";
import { sendMail } from "@/lib/mail/graph";
import { buildInvitationEmail } from "@/lib/mail/templates";
import { InvitationError, recordInvitationEmailResult } from "@/lib/db/store";
import type { InvitationSummary } from "@/types";

export function buildInvitationLink(token: string): string {
  return `${getPublicUrl().replace(/\/$/, "")}/invitation/${encodeURIComponent(token)}`;
}

export interface InvitationDeliveryResult {
  invitation: InvitationSummary;
  link: string;
  emailSent: boolean;
  emailError?: string;
}

/** Envoie l'e-mail d'invitation et enregistre le résultat (le lien reste partageable manuellement). */
export async function deliverInvitation(
  invitation: InvitationSummary,
  token: string,
): Promise<InvitationDeliveryResult> {
  const link = buildInvitationLink(token);
  const { subject, html, text } = buildInvitationEmail(invitation, token);
  const result = await sendMail({ to: invitation.email, subject, html, text });

  const updated =
    (await recordInvitationEmailResult(
      invitation.id,
      result.ok ? "sent" : result.reason === "not_configured" ? "not_configured" : "failed",
      result.ok ? undefined : result.error,
    )) ?? invitation;

  return {
    invitation: updated,
    link,
    emailSent: result.ok,
    emailError: result.ok ? undefined : result.error,
  };
}

export function invitationErrorMessage(error: unknown, t: Translator): string {
  if (error instanceof InvitationError) {
    switch (error.code) {
      case "alreadyUser":
        return t("invitations.alreadyUser");
      case "alreadyPending":
        return t("invitations.alreadyPending");
      case "notFound":
        return t("invitations.notFound");
      case "expired":
        return t("invitationAccept.expired");
      case "revoked":
        return t("invitationAccept.revoked");
      case "accepted":
        return t("invitationAccept.accepted");
      default:
        return t("invitationAccept.invalid");
    }
  }
  return error instanceof Error ? error.message : t("common.unknownError");
}
