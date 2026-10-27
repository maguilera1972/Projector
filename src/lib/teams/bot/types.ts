/**
 * Sous-ensemble du schéma d'activité Bot Framework utilisé par le bot PROJECTOR (Teams).
 * Les champs reçus ne sont jamais considérés comme fiables avant l'authentification du jeton.
 */

export interface ChannelAccount {
  id: string;
  name?: string;
  aadObjectId?: string;
}

export interface ConversationAccount {
  id: string;
  conversationType?: string;
  tenantId?: string;
  isGroup?: boolean;
  name?: string;
}

export interface TeamsChannelData {
  tenant?: { id?: string };
  team?: { id?: string; name?: string; aadGroupId?: string };
  channel?: { id?: string; name?: string };
  eventType?: string;
  settings?: { selectedChannel?: { id?: string } };
}

export interface Attachment {
  contentType: string;
  content?: unknown;
  contentUrl?: string;
  name?: string;
}

export interface IncomingActivity {
  type: string;
  id?: string;
  name?: string;
  action?: string;
  channelId: string;
  serviceUrl: string;
  locale?: string;
  text?: string;
  value?: unknown;
  replyToId?: string;
  from: ChannelAccount;
  recipient: ChannelAccount;
  conversation: ConversationAccount;
  channelData?: TeamsChannelData;
  membersAdded?: ChannelAccount[];
  membersRemoved?: ChannelAccount[];
}

/** Activité émise par le bot (réponse, message proactif, mise à jour de carte). */
export interface OutgoingActivity {
  type: "message" | "typing";
  text?: string;
  textFormat?: "plain" | "markdown" | "xml";
  summary?: string;
  attachments?: Attachment[];
  locale?: string;
}

/** Réponse HTTP renvoyée au Bot Connector (synchrone pour les `invoke`). */
export interface BotHttpResponse {
  status: number;
  body?: unknown;
}

/** Résultat de l'authentification d'une requête entrante. */
export interface BotRequestAuth {
  /** Origine du jeton : Bot Connector (api.botframework.com) ou jeton Entra du locataire. */
  issuerKind: "botframework" | "entra";
  /** serviceUrl authentifié (claim) et autorisé : seul cas où le jeton du bot peut y être envoyé. */
  serviceUrlTrusted: boolean;
  tenantId: string;
  botAppId: string;
}

export type AdaptiveCard = Record<string, unknown>;

export function adaptiveCardAttachment(card: AdaptiveCard): Attachment {
  return { contentType: "application/vnd.microsoft.card.adaptive", content: card };
}

/** Partie conversation d'un identifiant de fil (« 19:…@thread.tacv2;messageid=… »). */
export function baseConversationId(conversationId: string): string {
  return conversationId.split(";")[0];
}
