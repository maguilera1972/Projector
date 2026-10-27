import type { SessionUser } from "@/lib/auth/permissions";
import { resolveReportScope } from "./access";
import { buildReport } from "./builders";
import { loadReportDataset } from "./data";
import type { ReportDocument, ReportParams } from "./types";

export type ReportGeneration =
  | { ok: true; document: ReportDocument; projectIds: string[] }
  | { ok: false; status: 400 | 403 | 404; code: "forbidden" | "notFound" | "projectRequired" };

/** Résout le périmètre (droits compris), charge les données et construit le rapport. */
export async function generateReport(
  user: SessionUser,
  params: ReportParams,
): Promise<ReportGeneration> {
  const scope = await resolveReportScope(user, params);
  if (!scope.ok) return scope;
  const dataset = await loadReportDataset(scope.projects, scope.portfolios);
  const document = buildReport({
    params,
    dataset,
    portfolio: scope.portfolio,
    generatedBy: user.name,
  });
  return { ok: true, document, projectIds: scope.projects.map((project) => project.id) };
}
