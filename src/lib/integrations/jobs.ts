import {
  getIntegrationSettings,
  listPortfolios,
  listProjects,
  listTeamsConversations,
  scanOverdueTasks,
  updateIntegrationSettings,
} from "@/lib/db/store";
import { normalizeLocale } from "@/lib/i18n/config";
import { loadReportDataset } from "@/lib/reports/data";
import { createFormatter } from "@/lib/reports/format";
import { computeProjectHealth } from "@/lib/reports/health";
import { getReportTranslator } from "@/lib/reports/i18n";
import {
  postWeatherAlert,
  postWeeklySummaries,
  type WeatherTone,
  type WeeklySummaryInput,
} from "@/lib/teams/bot/proactive";
import { runConnectorSync } from "@/lib/copilot/connector";
import { describeError } from "./graph";
import { getJobsIntervalMinutes } from "./config";

/**
 * Tâches planifiées des intégrations Microsoft 365 : retards de tâches, météo des projets
 * (alerte au passage au rouge), synthèse hebdomadaire dans les canaux, synchronisation du connecteur.
 * Déclenchées par le timer systemd (POST /api/integrations/jobs/run), l'administration ou un intervalle.
 */

export interface JobsReport {
  startedAt: string;
  durationMs: number;
  overdueNotifications: number;
  weatherChanges: { projectId: string; name: string; from?: WeatherTone; to: WeatherTone }[];
  weatherAlertsPosted: number;
  weeklySummary: { ran: boolean; posted: number; errors: string[] };
  connector?: { ran: boolean; ok?: boolean; upserted?: number; deleted?: number; errors?: string[] };
  errors: string[];
}

function toWeather(tone: string): WeatherTone {
  return tone === "green" || tone === "orange" || tone === "red" ? tone : "neutral";
}

function zurichWeekday(date: Date): number {
  const day = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "Europe/Zurich" }).format(date);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(day);
}

let running: Promise<JobsReport> | null = null;

export async function runIntegrationJobs(options: { forceWeekly?: boolean } = {}): Promise<JobsReport> {
  if (running) return running;
  running = executeJobs(options).finally(() => {
    running = null;
  });
  return running;
}

async function executeJobs(options: { forceWeekly?: boolean }): Promise<JobsReport> {
  const started = Date.now();
  const report: JobsReport = {
    startedAt: new Date(started).toISOString(),
    durationMs: 0,
    overdueNotifications: 0,
    weatherChanges: [],
    weatherAlertsPosted: 0,
    weeklySummary: { ran: false, posted: 0, errors: [] },
    errors: [],
  };

  try {
    report.overdueNotifications = await scanOverdueTasks();
  } catch (error) {
    report.errors.push(`Retards : ${describeError(error)}`);
  }

  const settings = await getIntegrationSettings();
  const conversations = await listTeamsConversations();
  const ctx = { settings, conversations };

  try {
    const projects = (await listProjects()).filter((project) => project.status !== "termine");
    const dataset = await loadReportDataset(projects, await listPortfolios(true));
    const today = new Date().toISOString().slice(0, 10);
    const weather: Record<string, WeatherTone> = {};
    const weekly: WeeklySummaryInput[] = [];

    for (const data of dataset.projects) {
      const locale = normalizeLocale(data.project.documentLocale);
      const health = computeProjectHealth(data, getReportTranslator(locale), createFormatter(locale), today);
      const tone = toWeather(health.overall);
      const reasons = [...health.schedule.reasons, ...health.budget.reasons, ...health.decisions.reasons];
      weather[data.project.id] = tone;
      const previous = settings.projectWeather[data.project.id];
      if (previous !== tone) {
        report.weatherChanges.push({ projectId: data.project.id, name: data.project.name, from: previous, to: tone });
        if (tone === "red" && previous !== undefined && data.project.teams) {
          report.weatherAlertsPosted += await postWeatherAlert(data.project, ctx, { reasons });
        }
      }
      if (data.project.teams) weekly.push({ project: data.project, tasks: data.tasks, weather: tone, reasons });
    }

    const now = new Date();
    const last = settings.lastWeeklySummaryAt ? new Date(settings.lastWeeklySummaryAt).getTime() : 0;
    const due = zurichWeekday(now) === 1 && now.getTime() - last > 6 * 24 * 3600_000;
    if ((options.forceWeekly || due) && weekly.length > 0) {
      const result = await postWeeklySummaries(weekly, ctx);
      report.weeklySummary = { ran: true, ...result };
    }

    await updateIntegrationSettings((current) => {
      current.projectWeather = weather;
      current.lastJobRunAt = new Date().toISOString();
      if (report.weeklySummary.ran) current.lastWeeklySummaryAt = new Date().toISOString();
    });
  } catch (error) {
    report.errors.push(`Météo / synthèse : ${describeError(error)}`);
  }

  if (settings.features.connector && settings.connector.schemaStatus === "ready") {
    try {
      const result = await runConnectorSync();
      report.connector = {
        ran: true,
        ok: result.ok,
        upserted: result.upserted,
        deleted: result.deleted,
        errors: result.errors,
      };
    } catch (error) {
      report.connector = { ran: true, ok: false, errors: [describeError(error)] };
    }
  } else {
    report.connector = { ran: false };
  }

  report.durationMs = Date.now() - started;
  return report;
}

let intervalStarted = false;

/** Intervalle en processus (PROJECTOR_JOBS_INTERVAL_MIN) — alternative au timer systemd. */
export function startJobsInterval(): void {
  const minutes = getJobsIntervalMinutes();
  if (intervalStarted || minutes <= 0) return;
  intervalStarted = true;
  setInterval(() => {
    void runIntegrationJobs().catch((error: unknown) => {
      console.warn(`[jobs] Échec des tâches d'intégration : ${describeError(error)}`);
    });
  }, minutes * 60_000).unref();
}
