import { normalizeLocale, type Locale } from "@/lib/i18n/config";
import type { TeamsTabErrorCode } from "@/lib/teams/tab/sso";
import type { HermesPhaseId } from "@/types";

/** Libellés des pages d'onglet Teams (amorçage SSO, configuration), en 5 langues. */
export interface TeamsTabMessages {
  loading: string;
  stepSdk: string;
  stepSso: string;
  stepRedirect: string;
  outsideTitle: string;
  outsideBody: string;
  openProjector: string;
  openInBrowser: string;
  retry: string;
  errorTitle: string;
  adminHint: string;
  errors: Record<TeamsTabErrorCode, string>;
  configTitle: string;
  configIntro: string;
  configProject: string;
  configProjectPlaceholder: string;
  configPhase: string;
  configPhaseGeneral: string;
  configPhaseHint: string;
  configNoProjects: string;
  configLoadError: string;
  configReady: string;
  configSaveError: string;
  phases: Record<HermesPhaseId, string>;
}

const fr: TeamsTabMessages = {
  loading: "Connexion à PROJECTOR…",
  stepSdk: "Initialisation de Microsoft Teams…",
  stepSso: "Authentification unique en cours…",
  stepRedirect: "Ouverture de PROJECTOR…",
  outsideTitle: "Cette page s'ouvre dans Microsoft Teams",
  outsideBody:
    "Vous consultez une page d'onglet Teams de PROJECTOR en dehors de Microsoft Teams. Ouvrez PROJECTOR directement dans votre navigateur.",
  openProjector: "Ouvrir PROJECTOR",
  openInBrowser: "Ouvrir dans le navigateur",
  retry: "Réessayer",
  errorTitle: "Connexion impossible",
  adminHint: "Si le problème persiste, transmettez ce message à l'administrateur PROJECTOR.",
  errors: {
    invalid_request: "Requête d'authentification incomplète.",
    sso_not_configured:
      "L'authentification unique Teams n'est pas configurée : l'inscription d'application Entra doit exposer une API (« Expose an API », URI api://projector.aguilera.ch/<client-id>, étendue access_as_user, clients Teams pré-autorisés).",
    entra_disabled: "La connexion Microsoft est désactivée sur ce serveur PROJECTOR.",
    invalid_token: "Le jeton Microsoft fourni par Teams n'a pas pu être validé.",
    wrong_tenant: "Votre compte Microsoft appartient à une autre organisation que PROJECTOR.",
    missing_scope: "Le jeton Teams ne contient pas l'autorisation access_as_user.",
    denied: "Votre compte Microsoft n'est pas autorisé sur PROJECTOR. Demandez une invitation à un administrateur.",
    pending: "Votre compte a été enregistré et attend l'approbation d'un administrateur.",
    suspended: "Votre compte PROJECTOR est suspendu.",
    server_error: "Erreur interne lors de la connexion. Réessayez dans un instant.",
    consent_required:
      "Un consentement est requis : un administrateur doit accorder le consentement à l'application PROJECTOR dans Entra ID.",
    token_failed: "Teams n'a pas pu fournir de jeton d'authentification.",
    sdk_failed: "Le SDK Microsoft Teams n'a pas pu être chargé.",
    network: "Le serveur PROJECTOR est injoignable.",
  },
  configTitle: "Ajouter PROJECTOR à cet espace",
  configIntro: "Choisissez le projet à afficher dans l'onglet.",
  configProject: "Projet",
  configProjectPlaceholder: "Sélectionner un projet…",
  configPhase: "Phase HERMES (facultatif)",
  configPhaseGeneral: "Vue projet (toutes les phases)",
  configPhaseHint: "Avec une phase, l'onglet ouvre le dossier documentaire de cette phase.",
  configNoProjects: "Aucun projet accessible avec votre compte.",
  configLoadError: "Impossible de charger la liste des projets.",
  configReady: "Cliquez sur « Enregistrer » pour ajouter l'onglet.",
  configSaveError: "L'onglet n'a pas pu être enregistré.",
  phases: {
    initialisation: "Initialisation",
    conception: "Conception",
    realisation: "Réalisation",
    deploiement: "Déploiement",
    execution: "Exécution",
    cloture: "Clôture",
  },
};

const en: TeamsTabMessages = {
  loading: "Signing in to PROJECTOR…",
  stepSdk: "Initialising Microsoft Teams…",
  stepSso: "Single sign-on in progress…",
  stepRedirect: "Opening PROJECTOR…",
  outsideTitle: "This page opens in Microsoft Teams",
  outsideBody:
    "You are viewing a PROJECTOR Teams tab page outside Microsoft Teams. Open PROJECTOR directly in your browser.",
  openProjector: "Open PROJECTOR",
  openInBrowser: "Open in browser",
  retry: "Retry",
  errorTitle: "Unable to sign in",
  adminHint: "If the problem persists, forward this message to your PROJECTOR administrator.",
  errors: {
    invalid_request: "Incomplete authentication request.",
    sso_not_configured:
      "Teams single sign-on is not configured: the Entra app registration must expose an API (\"Expose an API\", URI api://projector.aguilera.ch/<client-id>, scope access_as_user, Teams clients pre-authorised).",
    entra_disabled: "Microsoft sign-in is disabled on this PROJECTOR server.",
    invalid_token: "The Microsoft token provided by Teams could not be validated.",
    wrong_tenant: "Your Microsoft account belongs to a different organisation than PROJECTOR.",
    missing_scope: "The Teams token does not contain the access_as_user permission.",
    denied: "Your Microsoft account is not allowed on PROJECTOR. Ask an administrator for an invitation.",
    pending: "Your account has been registered and is awaiting administrator approval.",
    suspended: "Your PROJECTOR account is suspended.",
    server_error: "Internal error while signing in. Please try again shortly.",
    consent_required:
      "Consent is required: an administrator must grant consent to the PROJECTOR application in Entra ID.",
    token_failed: "Teams could not provide an authentication token.",
    sdk_failed: "The Microsoft Teams SDK could not be loaded.",
    network: "The PROJECTOR server cannot be reached.",
  },
  configTitle: "Add PROJECTOR to this space",
  configIntro: "Choose the project to display in the tab.",
  configProject: "Project",
  configProjectPlaceholder: "Select a project…",
  configPhase: "HERMES phase (optional)",
  configPhaseGeneral: "Project view (all phases)",
  configPhaseHint: "With a phase, the tab opens that phase's document folder.",
  configNoProjects: "No project is accessible with your account.",
  configLoadError: "Unable to load the project list.",
  configReady: "Click \"Save\" to add the tab.",
  configSaveError: "The tab could not be saved.",
  phases: {
    initialisation: "Initiation",
    conception: "Concept",
    realisation: "Implementation",
    deploiement: "Deployment",
    execution: "Execution",
    cloture: "Closure",
  },
};

const it: TeamsTabMessages = {
  loading: "Connessione a PROJECTOR…",
  stepSdk: "Inizializzazione di Microsoft Teams…",
  stepSso: "Accesso unico in corso…",
  stepRedirect: "Apertura di PROJECTOR…",
  outsideTitle: "Questa pagina si apre in Microsoft Teams",
  outsideBody:
    "Stai consultando una pagina di scheda Teams di PROJECTOR al di fuori di Microsoft Teams. Apri PROJECTOR direttamente nel browser.",
  openProjector: "Apri PROJECTOR",
  openInBrowser: "Apri nel browser",
  retry: "Riprova",
  errorTitle: "Accesso impossibile",
  adminHint: "Se il problema persiste, inoltra questo messaggio all'amministratore di PROJECTOR.",
  errors: {
    invalid_request: "Richiesta di autenticazione incompleta.",
    sso_not_configured:
      "L'accesso unico Teams non è configurato: la registrazione dell'app Entra deve esporre un'API (« Expose an API », URI api://projector.aguilera.ch/<client-id>, ambito access_as_user, client Teams preautorizzati).",
    entra_disabled: "L'accesso Microsoft è disattivato su questo server PROJECTOR.",
    invalid_token: "Il token Microsoft fornito da Teams non ha potuto essere convalidato.",
    wrong_tenant: "Il tuo account Microsoft appartiene a un'organizzazione diversa da PROJECTOR.",
    missing_scope: "Il token Teams non contiene l'autorizzazione access_as_user.",
    denied: "Il tuo account Microsoft non è autorizzato su PROJECTOR. Chiedi un invito a un amministratore.",
    pending: "Il tuo account è stato registrato ed è in attesa dell'approvazione di un amministratore.",
    suspended: "Il tuo account PROJECTOR è sospeso.",
    server_error: "Errore interno durante l'accesso. Riprova tra un istante.",
    consent_required:
      "È richiesto un consenso: un amministratore deve concedere il consenso all'applicazione PROJECTOR in Entra ID.",
    token_failed: "Teams non ha potuto fornire un token di autenticazione.",
    sdk_failed: "Impossibile caricare l'SDK di Microsoft Teams.",
    network: "Il server PROJECTOR non è raggiungibile.",
  },
  configTitle: "Aggiungi PROJECTOR a questo spazio",
  configIntro: "Scegli il progetto da visualizzare nella scheda.",
  configProject: "Progetto",
  configProjectPlaceholder: "Seleziona un progetto…",
  configPhase: "Fase HERMES (facoltativa)",
  configPhaseGeneral: "Vista progetto (tutte le fasi)",
  configPhaseHint: "Con una fase, la scheda apre la cartella documentale di quella fase.",
  configNoProjects: "Nessun progetto accessibile con il tuo account.",
  configLoadError: "Impossibile caricare l'elenco dei progetti.",
  configReady: "Fai clic su « Salva » per aggiungere la scheda.",
  configSaveError: "Impossibile salvare la scheda.",
  phases: {
    initialisation: "Avvio",
    conception: "Concetto",
    realisation: "Realizzazione",
    deploiement: "Introduzione",
    execution: "Esecuzione",
    cloture: "Chiusura",
  },
};

const es: TeamsTabMessages = {
  loading: "Conectando con PROJECTOR…",
  stepSdk: "Inicializando Microsoft Teams…",
  stepSso: "Inicio de sesión único en curso…",
  stepRedirect: "Abriendo PROJECTOR…",
  outsideTitle: "Esta página se abre en Microsoft Teams",
  outsideBody:
    "Está consultando una página de pestaña de Teams de PROJECTOR fuera de Microsoft Teams. Abra PROJECTOR directamente en su navegador.",
  openProjector: "Abrir PROJECTOR",
  openInBrowser: "Abrir en el navegador",
  retry: "Reintentar",
  errorTitle: "No se puede iniciar sesión",
  adminHint: "Si el problema persiste, envíe este mensaje al administrador de PROJECTOR.",
  errors: {
    invalid_request: "Solicitud de autenticación incompleta.",
    sso_not_configured:
      "El inicio de sesión único de Teams no está configurado: el registro de la aplicación Entra debe exponer una API (« Expose an API », URI api://projector.aguilera.ch/<client-id>, ámbito access_as_user, clientes de Teams preautorizados).",
    entra_disabled: "El inicio de sesión de Microsoft está desactivado en este servidor PROJECTOR.",
    invalid_token: "No se pudo validar el token de Microsoft proporcionado por Teams.",
    wrong_tenant: "Su cuenta de Microsoft pertenece a una organización distinta de la de PROJECTOR.",
    missing_scope: "El token de Teams no contiene el permiso access_as_user.",
    denied: "Su cuenta de Microsoft no está autorizada en PROJECTOR. Solicite una invitación a un administrador.",
    pending: "Su cuenta se ha registrado y está pendiente de la aprobación de un administrador.",
    suspended: "Su cuenta de PROJECTOR está suspendida.",
    server_error: "Error interno al iniciar sesión. Vuelva a intentarlo en un momento.",
    consent_required:
      "Se requiere consentimiento: un administrador debe conceder el consentimiento a la aplicación PROJECTOR en Entra ID.",
    token_failed: "Teams no pudo proporcionar un token de autenticación.",
    sdk_failed: "No se pudo cargar el SDK de Microsoft Teams.",
    network: "No se puede acceder al servidor PROJECTOR.",
  },
  configTitle: "Añadir PROJECTOR a este espacio",
  configIntro: "Elija el proyecto que se mostrará en la pestaña.",
  configProject: "Proyecto",
  configProjectPlaceholder: "Seleccione un proyecto…",
  configPhase: "Fase HERMES (opcional)",
  configPhaseGeneral: "Vista del proyecto (todas las fases)",
  configPhaseHint: "Con una fase, la pestaña abre la carpeta de documentos de esa fase.",
  configNoProjects: "No hay ningún proyecto accesible con su cuenta.",
  configLoadError: "No se pudo cargar la lista de proyectos.",
  configReady: "Haga clic en « Guardar » para añadir la pestaña.",
  configSaveError: "No se pudo guardar la pestaña.",
  phases: {
    initialisation: "Inicialización",
    conception: "Concepción",
    realisation: "Realización",
    deploiement: "Despliegue",
    execution: "Ejecución",
    cloture: "Cierre",
  },
};

const de: TeamsTabMessages = {
  loading: "Anmeldung bei PROJECTOR…",
  stepSdk: "Microsoft Teams wird initialisiert…",
  stepSso: "Einmalige Anmeldung läuft…",
  stepRedirect: "PROJECTOR wird geöffnet…",
  outsideTitle: "Diese Seite wird in Microsoft Teams geöffnet",
  outsideBody:
    "Sie betrachten eine Teams-Registerkartenseite von PROJECTOR ausserhalb von Microsoft Teams. Öffnen Sie PROJECTOR direkt im Browser.",
  openProjector: "PROJECTOR öffnen",
  openInBrowser: "Im Browser öffnen",
  retry: "Erneut versuchen",
  errorTitle: "Anmeldung nicht möglich",
  adminHint: "Wenn das Problem weiterhin besteht, leiten Sie diese Meldung an die PROJECTOR-Administration weiter.",
  errors: {
    invalid_request: "Unvollständige Authentifizierungsanfrage.",
    sso_not_configured:
      "Die einmalige Anmeldung für Teams ist nicht konfiguriert: Die Entra-App-Registrierung muss eine API verfügbar machen (« Expose an API », URI api://projector.aguilera.ch/<client-id>, Bereich access_as_user, Teams-Clients vorautorisiert).",
    entra_disabled: "Die Microsoft-Anmeldung ist auf diesem PROJECTOR-Server deaktiviert.",
    invalid_token: "Das von Teams gelieferte Microsoft-Token konnte nicht validiert werden.",
    wrong_tenant: "Ihr Microsoft-Konto gehört zu einer anderen Organisation als PROJECTOR.",
    missing_scope: "Das Teams-Token enthält die Berechtigung access_as_user nicht.",
    denied: "Ihr Microsoft-Konto ist für PROJECTOR nicht zugelassen. Bitten Sie eine Administratorin oder einen Administrator um eine Einladung.",
    pending: "Ihr Konto wurde registriert und wartet auf die Freigabe durch die Administration.",
    suspended: "Ihr PROJECTOR-Konto ist gesperrt.",
    server_error: "Interner Fehler bei der Anmeldung. Bitte versuchen Sie es gleich noch einmal.",
    consent_required:
      "Eine Zustimmung ist erforderlich: Die Administration muss der Anwendung PROJECTOR in Entra ID zustimmen.",
    token_failed: "Teams konnte kein Authentifizierungstoken bereitstellen.",
    sdk_failed: "Das Microsoft Teams SDK konnte nicht geladen werden.",
    network: "Der PROJECTOR-Server ist nicht erreichbar.",
  },
  configTitle: "PROJECTOR zu diesem Bereich hinzufügen",
  configIntro: "Wählen Sie das Projekt, das in der Registerkarte angezeigt wird.",
  configProject: "Projekt",
  configProjectPlaceholder: "Projekt auswählen…",
  configPhase: "HERMES-Phase (optional)",
  configPhaseGeneral: "Projektansicht (alle Phasen)",
  configPhaseHint: "Mit einer Phase öffnet die Registerkarte den Dokumentenordner dieser Phase.",
  configNoProjects: "Mit Ihrem Konto ist kein Projekt zugänglich.",
  configLoadError: "Die Projektliste konnte nicht geladen werden.",
  configReady: "Klicken Sie auf « Speichern », um die Registerkarte hinzuzufügen.",
  configSaveError: "Die Registerkarte konnte nicht gespeichert werden.",
  phases: {
    initialisation: "Initialisierung",
    conception: "Konzept",
    realisation: "Realisierung",
    deploiement: "Einführung",
    execution: "Umsetzung",
    cloture: "Abschluss",
  },
};

const MESSAGES: Record<Locale, TeamsTabMessages> = { fr, en, it, es, de };

/** Langue Teams (ex. « fr-ch », « de-DE ») ramenée aux langues PROJECTOR. */
export function getTeamsTabMessages(locale: string | undefined): TeamsTabMessages {
  return MESSAGES[normalizeLocale(locale?.toLowerCase())];
}
