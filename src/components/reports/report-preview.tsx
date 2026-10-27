import { Logo } from "@/components/ui/logo";
import { cn } from "@/lib/utils";
import type {
  ReportBlock,
  ReportCell,
  ReportDocument,
  ReportTone,
} from "@/lib/reports/types";

const TONE_TEXT: Record<ReportTone, string> = {
  green: "text-emerald-700",
  orange: "text-amber-700",
  red: "text-red-700",
  neutral: "text-slate-600",
  brand: "text-indigo-600",
};

const TONE_BG: Record<ReportTone, string> = {
  green: "bg-emerald-50 border-emerald-200",
  orange: "bg-amber-50 border-amber-200",
  red: "bg-red-50 border-red-200",
  neutral: "bg-slate-50 border-slate-200",
  brand: "bg-indigo-50 border-indigo-200",
};

const TONE_DOT: Record<ReportTone, string> = {
  green: "bg-emerald-500",
  orange: "bg-amber-500",
  red: "bg-red-500",
  neutral: "bg-slate-400",
  brand: "bg-brand-indigo",
};

function Kpis({ items }: Extract<ReportBlock, { kind: "kpis" }>) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => (
        <div
          key={item.label}
          className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-50/60 p-4 pl-5"
        >
          <span
            className={cn(
              "absolute inset-y-3 left-0 w-1 rounded-r",
              item.tone ? TONE_DOT[item.tone] : "bg-slate-200",
              item.tone === "brand" && "gradient-brand",
            )}
          />
          <p className="text-xs font-medium text-brand-muted">{item.label}</p>
          <p className={cn("mt-1 text-xl font-bold", item.tone ? TONE_TEXT[item.tone] : "text-slate-900")}>
            {item.value}
          </p>
          {item.hint && <p className="mt-0.5 text-xs text-brand-muted">{item.hint}</p>}
        </div>
      ))}
    </div>
  );
}

function KeyValues({ items }: Extract<ReportBlock, { kind: "keyValues" }>) {
  return (
    <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
      {items.map((item) => (
        <div key={item.label} className="border-b border-slate-100 pb-2">
          <dt className="text-xs text-brand-muted">{item.label}</dt>
          <dd className="text-sm font-semibold text-slate-900">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Weather({ items }: Extract<ReportBlock, { kind: "weather" }>) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <div key={item.dimension} className={cn("rounded-xl border p-4", TONE_BG[item.tone])}>
          <div className="flex items-center gap-3">
            <span className={cn("h-4 w-4 shrink-0 rounded-full ring-4 ring-white", TONE_DOT[item.tone])} />
            <div>
              <p className="text-sm font-semibold text-slate-900">{item.dimension}</p>
              <p className={cn("text-xs font-semibold", TONE_TEXT[item.tone])}>{item.label}</p>
            </div>
          </div>
          {item.reasons.length > 0 && (
            <ul className="mt-3 space-y-1 text-xs text-slate-600">
              {item.reasons.map((reason) => (
                <li key={reason}>• {reason}</li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}

function Progress({ rows }: Extract<ReportBlock, { kind: "progress" }>) {
  return (
    <div className="space-y-3">
      {rows.map((row) => {
        const value = Math.max(0, Math.min(100, row.value));
        return (
          <div key={row.label} className="grid items-center gap-2 sm:grid-cols-[minmax(0,14rem)_1fr_3rem]">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-900">{row.label}</p>
              {row.detail && <p className="truncate text-xs text-brand-muted">{row.detail}</p>}
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-slate-200">
              <div
                className={cn(
                  "h-full rounded-full",
                  !row.tone || row.tone === "brand" ? "gradient-brand" : TONE_DOT[row.tone],
                )}
                style={{ width: `${value}%` }}
              />
            </div>
            <span className="text-right text-sm font-semibold text-slate-700">
              {row.valueLabel ?? `${Math.round(value)} %`}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function Bars(block: Extract<ReportBlock, { kind: "bars" }>) {
  const max = Math.max(1, ...block.rows.flatMap((row) => row.values.map((value) => value ?? 0)));
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-4 text-xs text-slate-600">
        {block.series.map((series) => (
          <span key={series.key} className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: series.color }} />
            {series.label}
          </span>
        ))}
      </div>
      {block.rows.map((row, rowIndex) => (
        <div key={row.label}>
          <p className="mb-1.5 text-sm font-semibold text-slate-900">{row.label}</p>
          <div className="space-y-1.5">
            {block.series.map((series, index) => {
              const value = row.values[index] ?? 0;
              return (
                <div key={series.key} className="grid grid-cols-[1fr_8rem] items-center gap-3">
                  <div className="h-3 overflow-hidden rounded bg-slate-100">
                    <div
                      className="h-full rounded"
                      style={{ width: `${value > 0 ? Math.max(1, (value / max) * 100) : 0}%`, background: series.color }}
                    />
                  </div>
                  <span className="text-right text-xs font-medium text-slate-600">
                    {block.formatted[rowIndex]?.[index] ?? "—"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function Stack(block: Extract<ReportBlock, { kind: "stack" }>) {
  return (
    <div>
      <div className="flex h-5 overflow-hidden rounded-md bg-slate-200">
        {block.total > 0 &&
          block.segments
            .filter((segment) => segment.value > 0)
            .map((segment) => (
              <div
                key={segment.label}
                className="flex items-center justify-center text-[11px] font-bold text-white"
                style={{ width: `${(segment.value / block.total) * 100}%`, background: segment.color }}
                title={`${segment.label} : ${segment.value}`}
              >
                {segment.value}
              </div>
            ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-600">
        {block.segments.map((segment) => (
          <span key={segment.label} className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: segment.color }} />
            {segment.label} {segment.value}
            {block.total > 0 && ` (${Math.round((segment.value / block.total) * 100)} %)`}
          </span>
        ))}
      </div>
      {block.caption && <p className="mt-1 text-xs text-brand-muted">{block.caption}</p>}
    </div>
  );
}

function Cell({ value, align }: { value: ReportCell; align?: "left" | "right" | "center" }) {
  const cell = typeof value === "string" ? { text: value } : value;
  return (
    <td
      className={cn(
        "px-3 py-2 align-top",
        align === "right" && "text-right",
        align === "center" && "text-center",
        cell.bold && "font-semibold text-slate-900",
        cell.tone && `font-semibold ${TONE_TEXT[cell.tone]}`,
      )}
    >
      {cell.tone && cell.tone !== "brand" && (
        <span className={cn("mr-1.5 inline-block h-2 w-2 rounded-full", TONE_DOT[cell.tone])} />
      )}
      {cell.text}
    </td>
  );
}

function Table(block: Extract<ReportBlock, { kind: "table" }>) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-brand-navy-light text-left text-xs font-semibold text-white">
            {block.columns.map((column) => (
              <th
                key={column.label}
                className={cn("px-3 py-2", column.align === "right" && "text-right")}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="text-slate-700">
          {block.rows.length === 0 ? (
            <tr>
              <td colSpan={block.columns.length} className="bg-slate-50 px-3 py-4 text-sm text-brand-muted">
                {block.empty ?? "—"}
              </td>
            </tr>
          ) : (
            block.rows.map((row, rowIndex) => (
              <tr key={rowIndex} className="border-t border-slate-100 even:bg-slate-50/70">
                {row.map((value, index) => (
                  <Cell key={index} value={value} align={block.columns[index]?.align} />
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function Alerts({ items }: Extract<ReportBlock, { kind: "alerts" }>) {
  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div
          key={item.text}
          className={cn("flex items-start gap-3 rounded-lg border px-4 py-3 text-sm", TONE_BG[item.tone], TONE_TEXT[item.tone])}
        >
          <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", TONE_DOT[item.tone])} />
          {item.text}
        </div>
      ))}
    </div>
  );
}

function Block({ block }: { block: ReportBlock }) {
  switch (block.kind) {
    case "kpis":
      return <Kpis {...block} />;
    case "keyValues":
      return <KeyValues {...block} />;
    case "weather":
      return <Weather {...block} />;
    case "progress":
      return <Progress {...block} />;
    case "bars":
      return <Bars {...block} />;
    case "stack":
      return <Stack {...block} />;
    case "table":
      return <Table {...block} />;
    case "alerts":
      return <Alerts {...block} />;
    case "paragraph":
      return <p className={cn("text-sm", block.muted ? "text-brand-muted" : "text-slate-700")}>{block.text}</p>;
  }
}

/** Aperçu à l'écran, fidèle à la mise en page du PDF (en-tête marine, dégradé de la marque). */
export function ReportPreview({ report }: { report: ReportDocument }) {
  return (
    <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <header className="bg-brand-navy-dark px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Logo size={30} />
          <div className="text-right">
            <p className="text-sm font-semibold text-white">{report.title}</p>
            <p className="text-xs text-brand-cyan">{report.scopeLabel}</p>
          </div>
        </div>
      </header>
      <div className="gradient-brand h-1" />
      <div className="space-y-8 p-6 sm:p-8">
        <div>
          <h2 className="text-2xl font-bold text-brand-navy">{report.title}</h2>
          <p className="mt-1 text-base text-slate-600">{report.subtitle}</p>
          <p className="mt-2 text-xs text-brand-muted">
            {report.labels.period}
            {report.locale === "fr" ? " : " : ": "}
            {report.periodLabel} · {report.generatedAtLabel}
          </p>
        </div>
        {report.sections.map((section) => (
          <section key={section.title} className="space-y-4">
            <div className="flex items-start gap-3">
              <span className="gradient-brand mt-1 h-5 w-1 rounded" />
              <div>
                <h3 className="text-lg font-semibold text-brand-navy">{section.title}</h3>
                {section.description && <p className="text-xs text-brand-muted">{section.description}</p>}
              </div>
            </div>
            {section.blocks.map((block, index) => (
              <Block key={index} block={block} />
            ))}
          </section>
        ))}
        <footer className="border-t border-slate-200 pt-3 text-xs text-brand-muted">
          {report.labels.confidential}
        </footer>
      </div>
    </article>
  );
}
