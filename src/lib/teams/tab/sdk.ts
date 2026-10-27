/**
 * Typage minimal du SDK JavaScript Microsoft Teams v2 (chargé depuis le CDN Microsoft,
 * global `window.microsoftTeams`) — uniquement les API utilisées par les onglets PROJECTOR.
 */

export const TEAMS_SDK_VERSION = "2.58.0";
export const TEAMS_SDK_URL = `https://res.cdn.office.net/teams-js/${TEAMS_SDK_VERSION}/js/MicrosoftTeams.min.js`;
/** Empreinte SRI du fichier ci-dessus : à recalculer à chaque changement de version. */
export const TEAMS_SDK_INTEGRITY =
  "sha384-sMo/EOqQPa1OCup2/VBRum7oFeOS22kvs8WGDc45xK53tUVZzFR5WwFYDUYN1LO4";

export type TeamsTheme = "default" | "dark" | "contrast";

export interface TeamsContext {
  app: {
    locale: string;
    theme?: string;
    host?: { name?: string; clientType?: string };
    sessionId?: string;
  };
  page: {
    id: string;
    /** subEntityId des liens profonds (ici : un chemin PROJECTOR, ex. `/projets/<id>`). */
    subPageId?: string;
    frameContext?: string;
  };
  user?: {
    id?: string;
    userPrincipalName?: string;
    tenant?: { id: string };
  };
  team?: { displayName?: string; groupId?: string };
  channel?: { id?: string; displayName?: string };
}

export interface TeamsSaveEvent {
  notifySuccess(): void;
  notifyFailure(reason?: string): void;
}

export interface TeamsInstanceConfig {
  entityId: string;
  contentUrl: string;
  websiteUrl?: string;
  suggestedDisplayName?: string;
  removeUrl?: string;
}

export interface TeamsSdk {
  app: {
    initialize(validMessageOrigins?: string[]): Promise<void>;
    getContext(): Promise<TeamsContext>;
    registerOnThemeChangeHandler(handler: (theme: string) => void): void;
    openLink(deepLink: string): Promise<void>;
  };
  authentication: {
    getAuthToken(request?: { resources?: string[]; claims?: string[]; silent?: boolean }): Promise<string>;
  };
  pages: {
    config: {
      registerOnSaveHandler(handler: (event: TeamsSaveEvent) => void): void;
      setConfig(config: TeamsInstanceConfig): Promise<void>;
      setValidityState(valid: boolean): void;
    };
  };
}

declare global {
  interface Window {
    microsoftTeams?: TeamsSdk;
    /** Interface native des clients mobiles Teams (onglets sans iframe). */
    nativeInterface?: unknown;
  }
}

/** Indice rapide : hors iframe et sans pont natif, la page n'est pas hébergée par Teams. */
export function isLikelyHostedInTeams(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.self !== window.top || Boolean(window.nativeInterface);
  } catch {
    // Accès refusé à window.top : cadre d'une autre origine, donc hébergé.
    return true;
  }
}

export function normalizeTeamsTheme(theme: string | undefined): TeamsTheme {
  if (theme === "dark" || theme === "contrast") return theme;
  return "default";
}

/** Rejette après `ms` millisecondes (app.initialize ne répond jamais hors de Teams). */
export function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });
}
