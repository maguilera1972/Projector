"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { TeamsSsoGate, type TeamsSession } from "@/app/teams/_components/teams-sso-gate";
import {
  isHermesPhaseId,
  projectTabContentUrl,
  projectTabEntityId,
  tabPhasesForApproach,
} from "@/lib/teams/tab/phases";
import type { HermesApproach, HermesPhaseId, Project } from "@/types";

type ProjectOption = Pick<Project, "id" | "name" | "approach" | "status">;

interface TeamsConfigClientProps {
  locale: string;
}

export function TeamsConfigClient({ locale }: TeamsConfigClientProps) {
  const target = useCallback(() => "/projets", []);
  return (
    <TeamsSsoGate initialLocale={locale} target={target} fallbackPath="/projets">
      {(session) => <TeamsConfigForm session={session} />}
    </TeamsSsoGate>
  );
}

interface Selection {
  project: ProjectOption;
  phase?: HermesPhaseId;
}

function TeamsConfigForm({ session }: { session: TeamsSession }) {
  const { sdk, messages, theme } = session;
  const [projects, setProjects] = useState<ProjectOption[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [projectId, setProjectId] = useState("");
  const [phase, setPhase] = useState<HermesPhaseId | "">("");
  const selectionRef = useRef<Selection | null>(null);
  const messagesRef = useRef(messages);

  const selectedProject = useMemo(
    () => projects?.find((project) => project.id === projectId),
    [projects, projectId],
  );
  const phaseOptions = useMemo(
    () => (selectedProject ? tabPhasesForApproach(selectedProject.approach) : []),
    [selectedProject],
  );

  useEffect(() => {
    let cancelled = false;
    fetch("/api/projects", { credentials: "same-origin" })
      .then(async (response) => {
        if (!response.ok) throw new Error(String(response.status));
        const data = (await response.json()) as { projects?: ProjectOption[] };
        if (cancelled) return;
        const list = (data.projects ?? []).map(({ id, name, approach, status }) => ({
          id,
          name,
          approach: (approach === "agile" ? "agile" : "classic") as HermesApproach,
          status,
        }));
        list.sort(
          (a, b) =>
            Number(a.status === "termine") - Number(b.status === "termine") ||
            a.name.localeCompare(b.name),
        );
        setProjects(list);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    selectionRef.current = selectedProject
      ? { project: selectedProject, phase: phase || undefined }
      : null;
    try {
      sdk.pages.config.setValidityState(Boolean(selectedProject));
    } catch {
      // Hors du cadre de configuration Teams : rien à signaler.
    }
  }, [sdk, selectedProject, phase]);

  useEffect(() => {
    try {
      sdk.pages.config.registerOnSaveHandler((event) => {
        const selection = selectionRef.current;
        if (!selection) {
          event.notifyFailure(messagesRef.current.configSaveError);
          return;
        }
        const origin = window.location.origin;
        const { project, phase: selectedPhase } = selection;
        const phaseLabel = selectedPhase ? ` · ${messagesRef.current.phases[selectedPhase]}` : "";
        sdk.pages.config
          .setConfig({
            entityId: projectTabEntityId(project.id, selectedPhase),
            contentUrl: projectTabContentUrl(origin, project.id, selectedPhase),
            websiteUrl: `${origin}/projets/${encodeURIComponent(project.id)}`,
            suggestedDisplayName: `PROJECTOR · ${project.name}${phaseLabel}`.slice(0, 120),
          })
          .then(
            () => event.notifySuccess(),
            () => event.notifyFailure(messagesRef.current.configSaveError),
          );
      });
    } catch {
      // Page ouverte hors du cadre de configuration Teams.
    }
  }, [sdk]);

  const muted = theme === "default" ? "text-slate-500" : "text-slate-300";
  const field = cn(
    "w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-indigo",
    theme === "default" ? "border-slate-300 bg-white text-slate-900" : "border-slate-600 bg-black/30 text-white",
  );

  return (
    <div className="mx-auto max-w-xl space-y-5 p-6">
      <div>
        <h1 className="text-lg font-semibold">{messages.configTitle}</h1>
        <p className={cn("text-sm", muted)}>{messages.configIntro}</p>
      </div>

      {loadError ? (
        <p className="text-sm text-red-500" role="alert">
          {messages.configLoadError}
        </p>
      ) : projects === null ? (
        <p className={cn("text-sm", muted)} role="status">
          {messages.loading}
        </p>
      ) : projects.length === 0 ? (
        <p className={cn("text-sm", muted)}>{messages.configNoProjects}</p>
      ) : (
        <>
          <label className="block space-y-1">
            <span className="text-sm font-medium">{messages.configProject}</span>
            <select
              className={field}
              value={projectId}
              onChange={(event) => {
                setProjectId(event.target.value);
                setPhase("");
              }}
            >
              <option value="">{messages.configProjectPlaceholder}</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>

          {selectedProject && (
            <label className="block space-y-1">
              <span className="text-sm font-medium">{messages.configPhase}</span>
              <select
                className={field}
                value={phase}
                onChange={(event) =>
                  setPhase(isHermesPhaseId(event.target.value) ? event.target.value : "")
                }
              >
                <option value="">{messages.configPhaseGeneral}</option>
                {phaseOptions.map((id) => (
                  <option key={id} value={id}>
                    {messages.phases[id]}
                  </option>
                ))}
              </select>
              <span className={cn("block text-xs", muted)}>{messages.configPhaseHint}</span>
            </label>
          )}

          {selectedProject && <p className={cn("text-sm", muted)}>{messages.configReady}</p>}
        </>
      )}
    </div>
  );
}
