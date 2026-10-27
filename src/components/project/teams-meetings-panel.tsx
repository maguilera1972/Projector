"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarClock, ExternalLink, Loader2, Video, X } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import { toIntlLocale } from "@/lib/i18n/config";
import { tDynamic } from "@/lib/i18n/translate";
import { getIntegrationTranslator } from "@/lib/integrations/i18n";
import type { HermesPhaseId, TeamsMeeting, TeamsMeetingKind } from "@/types";

interface TeamMember {
  userId: string;
  name: string;
  email: string;
}

interface MeetingsResponse {
  meetings: TeamsMeeting[];
  decisionPrompts: string[];
  available: boolean;
  unavailableReason?: string;
  defaultOrganizer: string | null;
  team: TeamMember[];
  decisionMakerIds: string[];
}

interface TeamsMeetingsPanelProps {
  projectId: string;
  currentPhase: HermesPhaseId;
  canSchedule: boolean;
}

const inputClass =
  "mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-brand-indigo focus:outline-none focus:ring-1 focus:ring-brand-indigo";

function nextSlot(): string {
  const date = new Date(Date.now() + 2 * 24 * 3600_000);
  return `${date.toISOString().slice(0, 10)}T10:00`;
}

/** Réunions Teams du projet : séance de quality gate et points de situation récurrents. */
export function TeamsMeetingsPanel({ projectId, currentPhase, canSchedule }: TeamsMeetingsPanelProps) {
  const { t, locale } = useI18n();
  const it = useMemo(() => getIntegrationTranslator(locale), [locale]);
  const [data, setData] = useState<MeetingsResponse | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  const [kind, setKind] = useState<TeamsMeetingKind>("phase_gate");
  const [start, setStart] = useState(nextSlot);
  const [duration, setDuration] = useState(60);
  const [agenda, setAgenda] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [extraEmails, setExtraEmails] = useState("");
  const [recurrence, setRecurrence] = useState<0 | 1 | 2>(0);
  const [until, setUntil] = useState("");

  const load = useCallback(async () => {
    const response = await fetch(`/api/projects/${projectId}/teams/meetings`);
    if (!response.ok) return;
    const payload = (await response.json()) as MeetingsResponse;
    setData(payload);
    setSelected(new Set(payload.decisionMakerIds));
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const formatDateTime = (value: string) =>
    new Intl.DateTimeFormat(toIntlLocale(locale), { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(
      new Date(`${value}Z`),
    );

  async function call(url: string, init: RequestInit): Promise<boolean> {
    setBusy(true);
    setFeedback(null);
    try {
      const response = await fetch(url, { headers: { "Content-Type": "application/json" }, ...init });
      const payload = (await response.json().catch(() => ({}))) as { message?: string; error?: string };
      setFeedback({
        ok: response.ok,
        text: response.ok ? (payload.message ?? "") : (payload.error ?? t("common.unknownError")),
      });
      if (response.ok) await load();
      return response.ok;
    } catch {
      setFeedback({ ok: false, text: t("common.networkError") });
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function schedule(event: React.FormEvent) {
    event.preventDefault();
    const ok = await call(`/api/projects/${projectId}/teams/meetings`, {
      method: "POST",
      body: JSON.stringify({
        kind,
        phase: kind === "phase_gate" ? currentPhase : undefined,
        start,
        durationMinutes: duration,
        agenda,
        attendeeUserIds: [...selected],
        extraEmails: extraEmails.split(/[,;\s]+/).filter(Boolean),
        recurrence: kind === "status" && recurrence ? { interval: recurrence, until: until || undefined } : null,
      }),
    });
    if (ok) setOpen(false);
  }

  if (!data) return null;
  const upcoming = data.meetings.filter((meeting) => meeting.status === "scheduled");
  if (!canSchedule && upcoming.length === 0) return null;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
            <Video className="h-5 w-5 text-brand-indigo" />
            {it("meetings.title")}
          </h2>
          {!data.available && (
            <p className="mt-1 text-sm text-amber-700">
              {it("meetings.unavailable", { reason: data.unavailableReason ?? "" })}
            </p>
          )}
        </div>
        {canSchedule && data.available && (
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-navy px-4 py-2 text-sm font-medium text-white hover:bg-brand-navy-light"
          >
            <CalendarClock className="h-4 w-4" />
            {it("meetings.schedule")}
          </button>
        )}
      </div>

      {data.decisionPrompts.map((id) => {
        const meeting = data.meetings.find((item) => item.id === id);
        if (!meeting) return null;
        return (
          <div key={id} className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <p>{it("meetings.decisionPrompt", { date: formatDateTime(meeting.start) })}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <a href="#quality-gate" className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white">
                {it("meetings.recordDecision")}
              </a>
              {canSchedule && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void call(`/api/projects/${projectId}/teams/meetings/${id}`, {
                      method: "PATCH",
                      body: JSON.stringify({ decisionRecorded: true }),
                    })
                  }
                  className="rounded-lg border border-amber-300 px-3 py-1.5 text-xs font-medium"
                >
                  {it("meetings.dismiss")}
                </button>
              )}
            </div>
          </div>
        );
      })}

      {open && (
        <form onSubmit={schedule} className="mt-4 space-y-4 rounded-lg border border-slate-100 bg-slate-50 p-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block text-sm">
              <span className="font-medium text-slate-700">{it("meetings.kindPhaseGate")}</span>
              <select value={kind} onChange={(e) => setKind(e.target.value as TeamsMeetingKind)} className={inputClass}>
                <option value="phase_gate">
                  {it("meetings.kindPhaseGate")} — {tDynamic(t, `enums.phase.${currentPhase}`)}
                </option>
                <option value="status">{it("meetings.kindStatus")}</option>
              </select>
            </label>
            <label className="block text-sm">
              <span className="font-medium text-slate-700">{it("meetings.start")}</span>
              <input
                type="datetime-local"
                required
                value={start}
                onChange={(e) => setStart(e.target.value)}
                className={inputClass}
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-slate-700">{it("meetings.duration")}</span>
              <input
                type="number"
                min={15}
                max={480}
                step={15}
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                className={inputClass}
              />
            </label>
          </div>

          {kind === "status" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="font-medium text-slate-700">{it("meetings.recurrence")}</span>
                <select
                  value={recurrence}
                  onChange={(e) => setRecurrence(Number(e.target.value) as 0 | 1 | 2)}
                  className={inputClass}
                >
                  <option value={0}>—</option>
                  <option value={1}>{it("meetings.recurrenceWeekly")}</option>
                  <option value={2}>{it("meetings.recurrenceBiweekly")}</option>
                </select>
              </label>
              {recurrence > 0 && (
                <label className="block text-sm">
                  <span className="font-medium text-slate-700">{it("meetings.until")}</span>
                  <input type="date" value={until} onChange={(e) => setUntil(e.target.value)} className={inputClass} />
                </label>
              )}
            </div>
          )}

          <label className="block text-sm">
            <span className="font-medium text-slate-700">{it("meetings.agenda")}</span>
            <textarea rows={3} value={agenda} onChange={(e) => setAgenda(e.target.value)} className={inputClass} />
          </label>

          <fieldset className="text-sm">
            <legend className="font-medium text-slate-700">{it("meetings.attendees")}</legend>
            <p className="text-xs text-brand-muted">{it("meetings.decisionMakers")}</p>
            <div className="mt-2 grid gap-1 sm:grid-cols-2">
              {data.team.map((member) => (
                <label key={member.userId} className="flex items-center gap-2 text-slate-700">
                  <input
                    type="checkbox"
                    checked={selected.has(member.userId)}
                    onChange={(e) => {
                      const next = new Set(selected);
                      if (e.target.checked) next.add(member.userId);
                      else next.delete(member.userId);
                      setSelected(next);
                    }}
                  />
                  {member.name} <span className="text-xs text-brand-muted">{member.email}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <label className="block text-sm">
            <span className="font-medium text-slate-700">{it("meetings.extraEmails")}</span>
            <input value={extraEmails} onChange={(e) => setExtraEmails(e.target.value)} className={inputClass} />
          </label>

          <p className="text-xs text-brand-muted">
            {it("meetings.organizerHint", { mailbox: data.defaultOrganizer ?? "—" })}
          </p>
          <button
            type="submit"
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-indigo px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {busy ? it("meetings.scheduling") : it("meetings.submit")}
          </button>
        </form>
      )}

      {feedback && (
        <p
          className={`mt-3 rounded-lg px-3 py-2 text-sm ${
            feedback.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"
          }`}
        >
          {feedback.text}
        </p>
      )}

      <ul className="mt-4 space-y-2">
        {upcoming.length === 0 && <li className="text-sm text-brand-muted">{it("meetings.none")}</li>}
        {upcoming.map((meeting) => (
          <li
            key={meeting.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2 text-sm"
          >
            <div>
              <p className="font-medium text-slate-900">{meeting.subject}</p>
              <p className="text-xs text-brand-muted">
                {formatDateTime(meeting.start)}
                {meeting.phase && ` · ${it("meetings.phase", { phase: tDynamic(t, `enums.phase.${meeting.phase}`) })}`}
                {meeting.recurrence && ` · ${it("meetings.recurring")}`}
                {` · ${meeting.attendees.length} ${it("meetings.attendees").toLowerCase()}`}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {meeting.joinUrl && (
                <a
                  href={meeting.joinUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-lg bg-[#5b5fc7] px-3 py-1.5 text-xs font-medium text-white"
                >
                  <Video className="h-3.5 w-3.5" />
                  {it("meetings.join")}
                </a>
              )}
              {meeting.webLink && (
                <a
                  href={meeting.webLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-brand-indigo hover:underline"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  {it("meetings.openCalendar")}
                </a>
              )}
              {canSchedule && (
                <button
                  type="button"
                  disabled={busy}
                  title={it("meetings.cancel")}
                  onClick={() => {
                    if (window.confirm(it("meetings.cancelConfirm"))) {
                      void call(`/api/projects/${projectId}/teams/meetings/${meeting.id}`, { method: "DELETE" });
                    }
                  }}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
