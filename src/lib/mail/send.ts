import { sendMail, type MailMessage, type MailResult } from "@/lib/mail/graph";
import { renderEmail, type EmailContent } from "@/lib/mail/layout";

export interface BrandedMailMessage extends Omit<MailMessage, "subject" | "html" | "text"> {
  /** Contenu mis en forme avec le gabarit PROJECTOR (`renderEmail`). */
  email: EmailContent;
}

/**
 * Envoie un e-mail au visuel PROJECTOR : rend le gabarit commun puis délègue à `sendMail`
 * (destinataires, `replyTo` et pièces jointes inchangés).
 */
export async function sendBrandedMail(message: BrandedMailMessage): Promise<MailResult> {
  const { email, ...envelope } = message;
  const rendered = renderEmail(email);
  return sendMail({ ...envelope, subject: rendered.subject, html: rendered.html, text: rendered.text });
}
