import { NextResponse } from "next/server";
import { principalLabel, type CopilotPrincipal } from "@/lib/copilot/auth";
import { copilotError, copilotJson, withCopilot } from "@/lib/copilot/http";
import { projectReportsUrl } from "@/lib/copilot/insights";
import { reportToMarkdown } from "@/lib/copilot/report-text";
import { principalLocale, principalProject } from "@/lib/copilot/service";
import { listPortfolios } from "@/lib/db/store";
import type { Locale } from "@/lib/i18n/config";
import { buildReport } from "@/lib/reports/builders";
import { loadReportDataset } from "@/lib/reports/data";
import { generateReport } from "@/lib/reports/service";
import type { ReportDocument, ReportParams } from "@/lib/reports/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface RouteParams {
  params: Promise<{ id: string }>;
}

type ReportOutcome = { ok: true; document: ReportDocument } | { ok: false; response: Response };

async function buildStatusReport(
  principal: CopilotPrincipal,
  projectId: string,
  locale: Locale,
): Promise<ReportOutcome> {
  const params: ReportParams = { type: "status", scope: { kind: "project", projectId }, locale };
  switch (principal.kind) {
    case "user": {
      const result = await generateReport(principal.user, params);
      if (result.ok) return { ok: true, document: result.document };
      const message =
        result.code === "forbidden"
          ? "Permission « Rapports » requise pour générer un rapport de statut."
          : "Projet introuvable ou non accessible.";
      return { ok: false, response: copilotError(result.status, message, result.code) };
    }
    case "app": {
      const project = await principalProject(principal, projectId);
      if (!project) return { ok: false, response: copilotError(404, "Projet introuvable.", "not_found") };
      const portfolios = await listPortfolios(true);
      const dataset = await loadReportDataset([project], portfolios);
      const document = buildReport({
        params,
        dataset,
        portfolio: portfolios.find((portfolio) => portfolio.id === project.portfolioId),
        generatedBy: principalLabel(principal),
      });
      return { ok: true, document };
    }
    default: {
      const exhaustive: never = principal;
      return exhaustive;
    }
  }
}

export async function GET(request: Request, { params }: RouteParams) {
  return withCopilot(request, async (principal) => {
    const { id } = await params;
    const locale = principalLocale(principal, request);
    const outcome = await buildStatusReport(principal, id, locale);
    if (!outcome.ok) return outcome.response;

    const url = projectReportsUrl(id);
    const markdown = reportToMarkdown(outcome.document, { url });
    const format = new URL(request.url).searchParams.get("format");
    const wantsMarkdown =
      format === "markdown" || (format !== "json" && (request.headers.get("accept") ?? "").startsWith("text/markdown"));
    if (wantsMarkdown) {
      return new NextResponse(markdown, {
        headers: { "Content-Type": "text/markdown; charset=utf-8", "Cache-Control": "no-store" },
      });
    }
    return copilotJson({
      projectId: id,
      projectName: outcome.document.scopeLabel,
      title: outcome.document.title,
      locale: outcome.document.locale,
      generatedAt: outcome.document.generatedAt,
      url,
      markdown,
    });
  });
}
