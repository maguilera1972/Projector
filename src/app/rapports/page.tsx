import { redirect } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { Header } from "@/components/layout/header";
import { ReportsWorkspace } from "@/components/reports/reports-workspace";
import { getSessionUser } from "@/lib/auth/session";
import { isLocale } from "@/lib/i18n/config";
import { getRequestTranslator } from "@/lib/i18n/server";
import { isMailConfigured } from "@/lib/mail/graph";
import { canViewReports, listReportableProjects } from "@/lib/reports/access";
import { isIsoDate } from "@/lib/reports/format";
import { getReportTranslator } from "@/lib/reports/i18n";
import { isReportType } from "@/lib/reports/types";

interface RapportsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function RapportsPage({ searchParams }: RapportsPageProps) {
  const { t, locale } = await getRequestTranslator();
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const rt = getReportTranslator(locale);

  const header = (
    <Header title={t("pages.reportsTitle")} subtitle={t("pages.reportsSubtitle")} user={user} />
  );

  if (!canViewReports(user)) {
    return (
      <>
        {header}
        <main className="flex flex-1 items-center justify-center p-8">
          <div className="max-w-md rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
            <ShieldAlert className="mx-auto mb-3 h-10 w-10 text-amber-500" />
            <p className="text-sm text-slate-700">{rt("ui.noAccess")}</p>
          </div>
        </main>
      </>
    );
  }

  const { projects, portfolios } = await listReportableProjects(user);
  const query = await searchParams;
  const type = single(query.type);
  const scope = single(query.scope);
  const from = single(query.from);
  const to = single(query.to);
  const reportLocale = single(query.locale);

  return (
    <>
      {header}
      <main className="p-8">
        <ReportsWorkspace
          uiLocale={locale}
          projects={projects.map((project) => ({
            id: project.id,
            name: project.name,
            portfolioId: project.portfolioId,
          }))}
          portfolios={portfolios.map((portfolio) => ({ id: portfolio.id, name: portfolio.name }))}
          mailConfigured={isMailConfigured()}
          initial={{
            type: isReportType(type) ? type : undefined,
            scope: scope === "project" || scope === "portfolio" || scope === "all" ? scope : undefined,
            projectId: projects.some((project) => project.id === single(query.projectId))
              ? single(query.projectId)
              : undefined,
            portfolioId: portfolios.some((portfolio) => portfolio.id === single(query.portfolioId))
              ? single(query.portfolioId)
              : undefined,
            from: isIsoDate(from) ? from : undefined,
            to: isIsoDate(to) ? to : undefined,
            locale: isLocale(reportLocale) ? reportLocale : undefined,
          }}
        />
      </main>
    </>
  );
}
