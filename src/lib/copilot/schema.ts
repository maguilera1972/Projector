/**
 * Schéma du connecteur Microsoft Graph « PROJECTOR » (éléments externes indexés pour Copilot / Search).
 * Contraintes Graph : nom alphanumérique ≤ 32 caractères, une propriété ne peut pas être à la fois
 * « searchable » et « refinable », seules les chaînes sont « searchable ».
 * Les libellés containerName / containerUrl / iconUrl sont des membres « évolutifs » de l'énumération :
 * les requêtes de schéma doivent envoyer `Prefer: include-unknown-enum-members`.
 */

export type ExternalPropertyType = "string" | "int64" | "double" | "dateTime" | "boolean";

export type ExternalPropertyLabel =
  | "title"
  | "url"
  | "createdBy"
  | "createdDateTime"
  | "lastModifiedDateTime"
  | "iconUrl"
  | "containerName"
  | "containerUrl";

export interface ExternalSchemaProperty {
  name: string;
  type: ExternalPropertyType;
  isSearchable?: boolean;
  isQueryable?: boolean;
  isRetrievable?: boolean;
  isRefinable?: boolean;
  isExactMatchRequired?: boolean;
  labels?: ExternalPropertyLabel[];
  aliases?: string[];
}

export const CONNECTOR_SCHEMA_PROPERTIES: ExternalSchemaProperty[] = [
  { name: "title", type: "string", isSearchable: true, isQueryable: true, isRetrievable: true, labels: ["title"] },
  { name: "itemType", type: "string", isQueryable: true, isRetrievable: true, isRefinable: true, aliases: ["kind"] },
  { name: "projectId", type: "string", isQueryable: true, isRetrievable: true, isExactMatchRequired: true },
  {
    name: "projectName",
    type: "string",
    isSearchable: true,
    isQueryable: true,
    isRetrievable: true,
    labels: ["containerName"],
    aliases: ["projet", "project"],
  },
  { name: "projectUrl", type: "string", isRetrievable: true, labels: ["containerUrl"] },
  { name: "status", type: "string", isQueryable: true, isRetrievable: true, isRefinable: true, aliases: ["statut"] },
  { name: "phase", type: "string", isQueryable: true, isRetrievable: true, isRefinable: true },
  { name: "approach", type: "string", isQueryable: true, isRetrievable: true, isRefinable: true, aliases: ["approche"] },
  { name: "weather", type: "string", isQueryable: true, isRetrievable: true, isRefinable: true, aliases: ["meteo", "health"] },
  { name: "progress", type: "int64", isQueryable: true, isRetrievable: true, aliases: ["avancement"] },
  {
    name: "chef",
    type: "string",
    isSearchable: true,
    isQueryable: true,
    isRetrievable: true,
    aliases: ["chefDeProjet", "projectManager"],
  },
  { name: "mandant", type: "string", isSearchable: true, isQueryable: true, isRetrievable: true, aliases: ["sponsor"] },
  { name: "portfolio", type: "string", isSearchable: true, isQueryable: true, isRetrievable: true },
  { name: "startDate", type: "dateTime", isQueryable: true, isRetrievable: true },
  { name: "endDate", type: "dateTime", isQueryable: true, isRetrievable: true },
  { name: "budget", type: "double", isQueryable: true, isRetrievable: true },
  { name: "summary", type: "string", isSearchable: true, isRetrievable: true, aliases: ["resume"] },
  { name: "url", type: "string", isRetrievable: true, labels: ["url"] },
  { name: "iconUrl", type: "string", isRetrievable: true, labels: ["iconUrl"] },
  { name: "createdBy", type: "string", isQueryable: true, isRetrievable: true, labels: ["createdBy"] },
  { name: "createdDateTime", type: "dateTime", isQueryable: true, isRetrievable: true, labels: ["createdDateTime"] },
  {
    name: "lastModified",
    type: "dateTime",
    isQueryable: true,
    isRetrievable: true,
    labels: ["lastModifiedDateTime"],
  },
];

export const CONNECTOR_SCHEMA_PROPERTY_NAMES = CONNECTOR_SCHEMA_PROPERTIES.map((property) => property.name);

export type ConnectorItemType = "project" | "decision" | "budgetRevision" | "report";

/** Valeurs des propriétés d'un élément (clés = noms du schéma ; propriétés absentes omises). */
export interface ConnectorItemProperties {
  title: string;
  itemType: ConnectorItemType;
  projectId: string;
  projectName: string;
  projectUrl: string;
  status?: string;
  phase?: string;
  approach?: string;
  weather?: string;
  progress?: number;
  chef?: string;
  mandant?: string;
  portfolio?: string;
  startDate?: string;
  endDate?: string;
  budget?: number;
  summary?: string;
  url: string;
  iconUrl?: string;
  createdBy?: string;
  createdDateTime?: string;
  lastModified: string;
}

export function buildSchemaPayload(): {
  baseType: "microsoft.graph.externalItem";
  properties: ExternalSchemaProperty[];
} {
  return { baseType: "microsoft.graph.externalItem", properties: CONNECTOR_SCHEMA_PROPERTIES };
}

/** Date « AAAA-MM-JJ » ou ISO → date-heure ISO 8601 UTC attendue par Graph (undefined si invalide). */
export function toGraphDateTime(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00Z` : value;
  const time = Date.parse(iso);
  return Number.isNaN(time) ? undefined : new Date(time).toISOString();
}
