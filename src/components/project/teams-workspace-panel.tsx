"use client";

import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Loader2, RefreshCw, Users } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import { formatDate } from "@/lib/utils";
import { getIntegrationTranslator, itDynamic } from "@/lib/integrations/i18n";
import { readApiResponse } from "@/lib/integrations/client-response";
import type { ProjectTeamsWorkspace } from "@/types";

interface WorkspacePlan {
  owner?: { name: string };
  channels: { displayName: string }[];
  members: { name: string }[];
  skipped: { name: string; reason: string }[];
  tabs: { possible: boolean; reason?: string };
  warnings: string[];
}

interface TeamsWorkspacePanelProps {
  projectId: string;
  initialWorkspace: ProjectTeamsWorkspace | null;
  canManage: boolean;
}

const inputClass =
  "mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-brand-indigo focus:outline-none focus:ring-1 focus:ring-brand-indigo";

/** Espace Microsoft Teams du projet : création (équipe ou canal), membres, liens. */
export function TeamsWorkspacePanel({ projectId, initialWorkspace, canManage }: TeamsWorkspacePanelProps) {
  const { t, locale } = useI18n();
  const it = useMemo(() => getIntegrationTranslator(locale), [locale]);
  const [workspace, setWorkspace] = useState(initialWorkspace);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [unavailableReason, setUnavailableReason] = useState<string>();
  const [mode, setMode] = useState<"team" | "channel">("team");
  const [teams, setTeams] = useState<{ id: string; displayName: string }[] | null>(null);
  const [teamId, setTeamId] = useState("");
  const [phaseChannels, setPhaseChannels] = useState(false);
  const [plan, setPlan] = useState<WorkspacePlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!canManage) return;
    void fetch(`/api/projects/${projectId}/teams/workspace`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { available: boolean; unavailableReason?: string } | null) => {
        if (!data) return;
        setAvailable(data.available);
        setUnavailableReason(data.unavailableReason);
      });
  }, [projectId, canManage]);

  useEffect(() => {
    if (mode !== "channel" || teams !== null || !available) return;
    void fetch("/api/integrations/teams/list")
      .then((response) => (response.ok ? response.json() : { teams: [] }))
      .then((data: { teams: { id: string; displayName: string }[] }) => setTeams(data.teams));
  }, [mode, teams, available]);

  async function request<T>(url: string, init: RequestInit): Promise<T | null> {
    setBusy(true);
    setFeedback(null);
    try {
      const response = await fetch(url, { headers: { "Content-Type": "application/json" }, ...init });
      const result = await readApiResponse<Record<string, unknown>>(response);
      const data = result.data as T & { message?: string };
      if (!result.ok) {
        setFeedback({
          ok: false,
          text: it("admin.actionFailed", { status: result.status, error: result.error ?? t("common.unknownError") }),
        });
        return null;
      }
      if (data.message) setFeedback({ ok: true, text: data.message });
      return data;
    } catch {
      setFeedback({ ok: false, text: t("common.networkError") });
      return null;
    } finally {
      setBusy(false);
    }
  }

  const body = (dryRun: boolean) =>
    JSON.stringify({ mode, teamId: mode === "channel" ? teamId : undefined, phaseChannels, dryRun });

  async function preview() {
    const data = await request<{ plan: WorkspacePlan }>(`/api/projects/${projectId}/teams/workspace`, {
      method: "POST",
      body: body(true),
    });
    if (data) setPlan(data.plan);
  }

  async function create() {
    const data = await request<{ workspace: ProjectTeamsWorkspace }>(`/api/projects/${projectId}/teams/workspace`, {
      method: "POST",
      body: body(false),
    });
    if (data?.workspace) {
      setWorkspace(data.workspace);
      setPlan(null);
    }
  }

  async function syncMembers() {
    const data = await request<{ workspace: ProjectTeamsWorkspace | null }>(
      `/api/projects/${projectId}/teams/workspace/members`,
      { method: "POST" },
    );
    if (data?.workspace) setWorkspace(data.workspace);
  }

  async function unlink() {
    if (!window.confirm(it("workspace.unlinkConfirm"))) return;
    const data = await request<{ workspace: null }>(`/api/projects/${projectId}/teams/workspace`, {
      method: "DELETE",
    });
    if (data) setWorkspace(null);
  }

  if (!workspace && !canManage) return null;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
        <Users className="h-5 w-5 text-[#5b5fc7]" />
        {it("workspace.title")}
      </h2>

      {workspace ? (
        <div className="mt-3 space-y-3 text-sm">
          <p>
            <span className="text-brand-muted">{it("workspace.team")} : </span>
            <span className="font-medium text-slate-900">{workspace.teamName ?? workspace.teamId}</span>
            <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
              {itDynamic(it, `workspace.status.${workspace.status}`)}
            </span>
          </p>
          {workspace.teamWebUrl && (
            <a
              href={workspace.teamWebUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-lg bg-[#5b5fc7] px-3 py-1.5 text-xs font-medium text-white"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              {it("workspace.open")}
            </a>
          )}
          <div>
            <p className="text-brand-muted">{it("workspace.channels")}</p>
            <ul className="mt-1 space-y-0.5">
              {workspace.channels.map((channel) => (
                <li key={channel.channelId}>
                  {channel.webUrl ? (
                    <a href={channel.webUrl} target="_blank" rel="noopener noreferrer" className="text-brand-indigo hover:underline">
                      # {channel.displayName}
                    </a>
                  ) : (
                    <span># {channel.displayName}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
          {workspace.lastMemberSync && (
            <p className="text-xs text-brand-muted">
              {it("workspace.lastSync", { date: formatDate(workspace.lastMemberSync.at, locale) })} —{" "}
              {it("workspace.synced", {
                added: workspace.lastMemberSync.added.length,
                already: workspace.lastMemberSync.alreadyMembers.length,
                skipped: workspace.lastMemberSync.skipped.length,
              })}
            </p>
          )}
          {workspace.lastMemberSync && workspace.lastMemberSync.skipped.length > 0 && (
            <ul className="text-xs text-amber-700">
              {workspace.lastMemberSync.skipped.map((item) => (
                <li key={item.userId}>
                  {item.name} — {itDynamic(it, `workspace.reason.${item.reason}`)}
                  {item.detail ? ` (${item.detail})` : ""}
                </li>
              ))}
            </ul>
          )}
          {workspace.warnings.length > 0 && (
            <details className="text-xs text-amber-700">
              <summary>{it("workspace.warnings")} ({workspace.warnings.length})</summary>
              <ul className="mt-1 list-disc pl-4">
                {workspace.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </details>
          )}
          {canManage && (
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                disabled={busy}
                onClick={() => void syncMembers()}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                {it("workspace.syncMembers")}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void unlink()}
                className="rounded-lg px-3 py-1.5 text-xs text-slate-500 hover:bg-red-50 hover:text-red-600"
              >
                {it("workspace.unlink")}
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="mt-3 space-y-3 text-sm">
          <p className="text-brand-muted">{it("workspace.none")}</p>
          {available === false && (
            <p className="text-amber-700">{it("workspace.unavailable", { reason: unavailableReason ?? "" })}</p>
          )}
          {available && (
            <>
              <fieldset className="space-y-1">
                {(["team", "channel"] as const).map((value) => (
                  <label key={value} className="flex items-center gap-2 text-slate-700">
                    <input
                      type="radio"
                      name="teams-mode"
                      checked={mode === value}
                      onChange={() => {
                        setMode(value);
                        setPlan(null);
                      }}
                    />
                    {value === "team" ? it("workspace.modeTeam") : it("workspace.modeChannel")}
                  </label>
                ))}
              </fieldset>
              {mode === "channel" && (
                <>
                  <label className="block">
                    <span className="text-slate-700">{it("workspace.chooseTeam")}</span>
                    <select value={teamId} onChange={(e) => setTeamId(e.target.value)} className={inputClass}>
                      <option value="">{teams === null ? it("workspace.loadingTeams") : "—"}</option>
                      {(teams ?? []).map((team) => (
                        <option key={team.id} value={team.id}>
                          {team.displayName}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex items-center gap-2 text-slate-700">
                    <input type="checkbox" checked={phaseChannels} onChange={(e) => setPhaseChannels(e.target.checked)} />
                    {it("workspace.phaseChannels")}
                  </label>
                </>
              )}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy || (mode === "channel" && !teamId)}
                  onClick={() => void preview()}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  {it("workspace.preview")}
                </button>
                <button
                  type="button"
                  disabled={busy || !plan || (mode === "channel" && !teamId)}
                  onClick={() => void create()}
                  className="inline-flex items-center gap-1 rounded-lg bg-[#5b5fc7] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                >
                  {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {busy ? it("workspace.creating") : it("workspace.create")}
                </button>
              </div>
              {plan && (
                <div className="space-y-2 rounded-lg border border-slate-100 bg-slate-50 p-3 text-xs">
                  {plan.owner && <p>{it("workspace.planOwner", { name: plan.owner.name })}</p>}
                  <p className="font-medium">{it("workspace.planChannels")}</p>
                  <ul className="list-disc pl-4">
                    {plan.channels.map((channel) => (
                      <li key={channel.displayName}>{channel.displayName}</li>
                    ))}
                  </ul>
                  <p className="font-medium">{it("workspace.planMembers", { count: plan.members.length })}</p>
                  <p>{plan.members.map((member) => member.name).join(", ") || "—"}</p>
                  {plan.skipped.length > 0 && (
                    <>
                      <p className="font-medium text-amber-700">
                        {it("workspace.planSkipped", { count: plan.skipped.length })}
                      </p>
                      <ul className="text-amber-700">
                        {plan.skipped.map((item) => (
                          <li key={`${item.name}-${item.reason}`}>
                            {item.name} — {itDynamic(it, `workspace.reason.${item.reason}`)}
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                  <p>
                    {it("workspace.planTabs")} :{" "}
                    {plan.tabs.possible ? it("workspace.tabsYes") : it("workspace.tabsNo", { reason: plan.tabs.reason ?? "" })}
                  </p>
                  {plan.warnings.map((warning) => (
                    <p key={warning} className="text-amber-700">
                      {warning}
                    </p>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {feedback && (
        <p
          className={`mt-3 rounded-lg px-3 py-2 text-xs ${
            feedback.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"
          }`}
        >
          {feedback.text}
        </p>
      )}
    </section>
  );
}
