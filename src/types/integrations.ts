import type { HermesPhaseId } from "./index";

/** Fonctionnalités Microsoft Teams / Copilot activables depuis l'administration. */
export type IntegrationFeature =
  | "activityFeed"
  | "meetings"
  | "workspaces"
  | "tabs"
  | "sharepoint"
  | "bot"
  | "proactive"
  | "connector"
  | "copilotApi";

export const INTEGRATION_FEATURES: IntegrationFeature[] = [
  "activityFeed",
  "meetings",
  "workspaces",
  "tabs",
  "sharepoint",
  "bot",
  "proactive",
  "connector",
  "copilotApi",
];

export type GraphConnectorSchemaStatus = "none" | "pending" | "ready" | "failed";

export interface GraphConnectorSyncResult {
  ok: boolean;
  upserted: number;
  deleted: number;
  errors: string[];
  durationMs?: number;
}

/** État du connecteur Microsoft Graph (Copilot / Microsoft Search). */
export interface GraphConnectorState {
  connectionId: string;
  connectionCreatedAt?: string;
  schemaStatus: GraphConnectorSchemaStatus;
  /** URL d'opération renvoyée par Graph lors de l'enregistrement asynchrone du schéma. */
  schemaOperationUrl?: string;
  schemaError?: string;
  lastSyncAt?: string;
  lastSyncResult?: GraphConnectorSyncResult;
  /** Identifiants des éléments externes indexés (suppression des éléments obsolètes). */
  itemIds: string[];
  /** Empreinte du contenu par élément (synchronisation incrémentale). */
  itemHashes: Record<string, string>;
}

/** Paramètres d'intégration Microsoft 365 (stockés dans la base JSON). */
export interface IntegrationSettings {
  features: Record<IntegrationFeature, boolean>;
  /** ID de l'application Teams dans le catalogue de l'organisation (installation automatique). */
  teamsAppCatalogId?: string;
  /** serviceUrl du Bot Connector observé (messages proactifs vers des canaux connus). */
  botServiceUrl?: string;
  connector: GraphConnectorState;
  /** Dernière météo calculée par projet (détection du passage au rouge). */
  projectWeather: Record<string, "green" | "orange" | "red" | "neutral">;
  lastWeeklySummaryAt?: string;
  lastOverdueScanAt?: string;
  lastJobRunAt?: string;
  updatedAt?: string;
  updatedBy?: string;
}

export type TeamsConversationScope = "personal" | "channel" | "groupChat";

/** Référence de conversation Bot Framework (capturée à l'installation / conversationUpdate). */
export interface TeamsConversationRef {
  /** conversation.id (clé). */
  id: string;
  serviceUrl: string;
  tenantId?: string;
  scope: TeamsConversationScope;
  /** Identifiant du bot dans la conversation (recipient.id, ex. « 28:… »). */
  botId: string;
  teamId?: string;
  teamAadGroupId?: string;
  teamName?: string;
  channelId?: string;
  channelName?: string;
  /** Conversation personnelle : objet Entra de l'utilisateur. */
  userAadObjectId?: string;
  userName?: string;
  installedAt: string;
  updatedAt: string;
}

export interface ProjectTeamsChannel {
  /** Phase HERMES associée (absente pour le canal général / projet). */
  phase?: HermesPhaseId;
  channelId: string;
  displayName: string;
  webUrl?: string;
  tabId?: string;
}

export interface ProjectTeamsMemberSync {
  at: string;
  added: string[];
  alreadyMembers: string[];
  skipped: { userId: string; name: string; reason: "no_entra" | "guest" | "inactive" | "error"; detail?: string }[];
}

/** Espace Teams d'un projet (équipe dédiée ou canal dans une équipe existante). */
export interface ProjectTeamsWorkspace {
  mode: "team" | "channel";
  teamId: string;
  teamName?: string;
  teamWebUrl?: string;
  /** Canal « Général » (mode équipe) ou canal projet (mode canal). */
  primaryChannelId?: string;
  channels: ProjectTeamsChannel[];
  status: "provisioning" | "ready" | "partial" | "failed";
  warnings: string[];
  createdAt: string;
  createdBy: string;
  lastMemberSync?: ProjectTeamsMemberSync;
  /** Synchronisation SharePoint des dossiers de phase (Sites.Selected). */
  sharePointSiteId?: string;
}

export type TeamsMeetingKind = "phase_gate" | "status";

export interface TeamsMeetingAttendee {
  email: string;
  name: string;
  userId?: string;
  type: "required" | "optional";
}

/** Réunion Teams (événement de calendrier en ligne) planifiée depuis PROJECTOR. */
export interface TeamsMeeting {
  id: string;
  projectId: string;
  kind: TeamsMeetingKind;
  phase?: HermesPhaseId;
  validationId?: string;
  eventId: string;
  organizerUpn: string;
  subject: string;
  start: string;
  end: string;
  timeZone: string;
  joinUrl?: string;
  webLink?: string;
  attendees: TeamsMeetingAttendee[];
  recurrence?: { interval: 1 | 2; dayOfWeek: string; until?: string };
  status: "scheduled" | "cancelled";
  decisionRecordedAt?: string;
  createdAt: string;
  createdBy: string;
  createdByName: string;
}
