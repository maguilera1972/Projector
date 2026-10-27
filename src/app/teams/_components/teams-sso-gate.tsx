"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Script from "next/script";
import { AlertTriangle, ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { Logo } from "@/components/ui/logo";
import { cn } from "@/lib/utils";
import { getTeamsTabMessages, type TeamsTabMessages } from "@/lib/teams/tab/i18n";
import {
  isLikelyHostedInTeams,
  normalizeTeamsTheme,
  TEAMS_SDK_INTEGRITY,
  TEAMS_SDK_URL,
  withTimeout,
  type TeamsContext,
  type TeamsSdk,
  type TeamsTheme,
} from "@/lib/teams/tab/sdk";
import {
  classifyAuthTokenError,
  type TeamsSsoResponse,
  type TeamsTabErrorCode,
} from "@/lib/teams/tab/sso";

const INITIALIZE_TIMEOUT_MS = 10_000;

export interface TeamsSession {
  sdk: TeamsSdk;
  context: TeamsContext;
  redirect: string;
  messages: TeamsTabMessages;
  theme: TeamsTheme;
}

type GateState =
  | { status: "loading"; step: "sdk" | "sso" | "redirect" }
  | { status: "outside" }
  | { status: "error"; code: TeamsTabErrorCode; detail?: string }
  | { status: "ready"; session: Omit<TeamsSession, "messages" | "theme"> };

interface TeamsSsoGateProps {
  /** Langue de la requête (avant lecture du contexte Teams). */
  initialLocale: string;
  /** Chemin PROJECTOR demandé après l'authentification (validé par le serveur). */
  target: (context: TeamsContext) => string;
  /** Chemin ouvert hors de Teams ou depuis l'écran d'erreur. */
  fallbackPath: string;
  /** Contenu affiché une fois connecté ; sans lui, la page redirige vers `redirect`. */
  children?: (session: TeamsSession) => React.ReactNode;
}

const THEME_CLASSES: Record<TeamsTheme, string> = {
  default: "bg-white text-slate-900",
  dark: "bg-[#1f1f1f] text-slate-100",
  contrast: "bg-black text-white",
};

export function TeamsSsoGate({ initialLocale, target, fallbackPath, children }: TeamsSsoGateProps) {
  const [sdkStatus, setSdkStatus] = useState<"pending" | "loaded" | "failed">("pending");
  const [state, setState] = useState<GateState>({ status: "loading", step: "sdk" });
  const [locale, setLocale] = useState(initialLocale);
  const [theme, setTheme] = useState<TeamsTheme>("default");
  const [attempt, setAttempt] = useState(0);
  const messages = useMemo(() => getTeamsTabMessages(locale), [locale]);
  const hasChildren = Boolean(children);
  const targetRef = useRef(target);

  useEffect(() => {
    targetRef.current = target;
  }, [target]);

  useEffect(() => {
    if (!isLikelyHostedInTeams()) setState({ status: "outside" });
  }, []);

  useEffect(() => {
    if (sdkStatus === "failed" && isLikelyHostedInTeams()) {
      setState({ status: "error", code: "sdk_failed" });
    }
  }, [sdkStatus]);

  useEffect(() => {
    if (sdkStatus !== "loaded" || !isLikelyHostedInTeams()) return;
    let cancelled = false;

    async function run() {
      const sdk = window.microsoftTeams;
      if (!sdk) {
        setState({ status: "error", code: "sdk_failed" });
        return;
      }
      setState({ status: "loading", step: "sdk" });
      try {
        await withTimeout(sdk.app.initialize(), INITIALIZE_TIMEOUT_MS, "initialize timeout");
      } catch {
        if (!cancelled) setState({ status: "outside" });
        return;
      }
      let context: TeamsContext;
      try {
        context = await sdk.app.getContext();
      } catch (error) {
        if (!cancelled) {
          setState({
            status: "error",
            code: "sdk_failed",
            detail: error instanceof Error ? error.message : String(error),
          });
        }
        return;
      }
      if (cancelled) return;
      setLocale(context.app.locale || initialLocale);
      setTheme(normalizeTeamsTheme(context.app.theme));
      sdk.app.registerOnThemeChangeHandler((next) => setTheme(normalizeTeamsTheme(next)));

      setState({ status: "loading", step: "sso" });
      let token: string;
      try {
        token = await sdk.authentication.getAuthToken();
      } catch (error) {
        if (!cancelled) {
          setState({
            status: "error",
            code: classifyAuthTokenError(error),
            detail: error instanceof Error ? error.message : String(error),
          });
        }
        return;
      }
      if (cancelled) return;

      let data: TeamsSsoResponse;
      try {
        const response = await fetch("/api/teams/sso", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ token, redirect: targetRef.current(context) }),
        });
        data = (await response.json()) as TeamsSsoResponse;
      } catch {
        if (!cancelled) setState({ status: "error", code: "network" });
        return;
      }
      if (cancelled) return;
      if (!data.ok) {
        setState({ status: "error", code: data.code });
        return;
      }
      if (hasChildren) {
        setState({ status: "ready", session: { sdk, context, redirect: data.redirect } });
      } else {
        setState({ status: "loading", step: "redirect" });
        window.location.replace(data.redirect);
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [sdkStatus, attempt, hasChildren, initialLocale]);

  const retry = useCallback(() => {
    if (sdkStatus === "failed") {
      window.location.reload();
      return;
    }
    setAttempt((value) => value + 1);
  }, [sdkStatus]);

  return (
    <div className={cn("min-h-full", THEME_CLASSES[theme])}>
      <Script
        src={TEAMS_SDK_URL}
        integrity={TEAMS_SDK_INTEGRITY}
        crossOrigin="anonymous"
        strategy="afterInteractive"
        onReady={() => setSdkStatus("loaded")}
        onError={() => setSdkStatus("failed")}
      />
      {state.status === "ready" && children ? (
        children({ ...state.session, messages, theme })
      ) : (
        <GateStatus
          state={state}
          messages={messages}
          theme={theme}
          fallbackPath={fallbackPath}
          onRetry={retry}
        />
      )}
    </div>
  );
}

function GateStatus({
  state,
  messages,
  theme,
  fallbackPath,
  onRetry,
}: {
  state: GateState;
  messages: TeamsTabMessages;
  theme: TeamsTheme;
  fallbackPath: string;
  onRetry: () => void;
}) {
  const muted = theme === "default" ? "text-slate-500" : "text-slate-300";
  const card =
    theme === "default" ? "border-slate-200 bg-white shadow-sm" : "border-slate-700 bg-white/5";

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className={cn("w-full max-w-lg rounded-xl border p-6", card)}>
        <div className="mb-5 flex items-center gap-3">
          <div className="rounded-lg bg-brand-navy p-1.5">
            <Logo size={28} showText={false} />
          </div>
          <span className="text-lg font-bold tracking-wider">PROJECTOR</span>
        </div>
        <StatusBody
          state={state}
          messages={messages}
          muted={muted}
          fallbackPath={fallbackPath}
          onRetry={onRetry}
        />
      </div>
    </div>
  );
}

function StatusBody({
  state,
  messages,
  muted,
  fallbackPath,
  onRetry,
}: {
  state: GateState;
  messages: TeamsTabMessages;
  muted: string;
  fallbackPath: string;
  onRetry: () => void;
}) {
  switch (state.status) {
    case "loading":
    case "ready": {
      const step = state.status === "ready" ? "redirect" : state.step;
      const label =
        step === "sdk" ? messages.stepSdk : step === "sso" ? messages.stepSso : messages.stepRedirect;
      return (
        <div className="flex items-center gap-3" role="status" aria-live="polite">
          <Loader2 className="h-5 w-5 animate-spin text-brand-indigo" aria-hidden="true" />
          <div>
            <p className="font-medium">{messages.loading}</p>
            <p className={cn("text-sm", muted)}>{label}</p>
          </div>
        </div>
      );
    }
    case "outside":
      return (
        <div className="space-y-4">
          <h1 className="text-base font-semibold">{messages.outsideTitle}</h1>
          <p className={cn("text-sm", muted)}>{messages.outsideBody}</p>
          <a
            href={fallbackPath}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-navy px-4 py-2 text-sm font-medium text-white hover:bg-brand-navy-light"
          >
            {messages.openProjector}
          </a>
        </div>
      );
    case "error":
      return (
        <div className="space-y-4" role="alert">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" aria-hidden="true" />
            <div className="space-y-1">
              <h1 className="text-base font-semibold">{messages.errorTitle}</h1>
              <p className="text-sm">{messages.errors[state.code] ?? messages.errors.server_error}</p>
              <p className={cn("text-xs", muted)}>{messages.adminHint}</p>
              <p className={cn("font-mono text-xs", muted)}>
                {state.code}
                {state.detail ? ` — ${state.detail}` : ""}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-navy px-4 py-2 text-sm font-medium text-white hover:bg-brand-navy-light"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              {messages.retry}
            </button>
            <a
              href={fallbackPath}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-500/10"
            >
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
              {messages.openInBrowser}
            </a>
          </div>
        </div>
      );
    default: {
      const exhaustive: never = state;
      return exhaustive;
    }
  }
}
