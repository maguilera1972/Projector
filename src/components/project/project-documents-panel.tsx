"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FileText, Loader2, PenLine } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getPhaseLabel } from "@/lib/hermes/phases";
import { formatDate } from "@/lib/utils";
import type { Project, ProjectDocument } from "@/types";

interface ProjectDocumentsPanelProps {
  project: Project;
  documents: ProjectDocument[];
  canManage: boolean;
}

function documentStatusLabel(document: ProjectDocument): string {
  if (document.status === "signed") {
    return document.type === "accord_budget_mandant"
      ? "Document archivé"
      : "PV signé";
  }
  return document.type === "accord_budget_mandant"
    ? "Accord à archiver"
    : "Signature PV requise";
}

function documentDateLabel(document: ProjectDocument): string {
  if (document.type === "accord_budget_mandant") {
    return `Validation du ${formatDate(document.sessionDate)}`;
  }
  return `Séance du ${formatDate(document.sessionDate)}`;
}

export function ProjectDocumentsPanel({
  project,
  documents,
  canManage,
}: ProjectDocumentsPanelProps) {
  const router = useRouter();
  const [signingId, setSigningId] = useState<string | null>(null);
  const [signatures, setSignatures] = useState<Record<string, string>>({});
  const [error, setError] = useState("");

  const pending = documents.filter((doc) => doc.status === "pending_signature");
  const pendingBudget = pending.filter(
    (doc) => doc.type === "accord_budget_mandant",
  );
  const pendingPv = pending.filter(
    (doc) => doc.type === "pv_validation_phase",
  );

  async function signDocument(document: ProjectDocument) {
    const pvSignatureText = signatures[document.id]?.trim();
    if (!pvSignatureText) return;

    setSigningId(document.id);
    setError("");

    try {
      const response = await fetch(
        `/api/project-documents/${document.id}/sign`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pvSignatureText }),
        },
      );

      const data = (await response.json()) as { error?: string };

      if (!response.ok) {
        setError(data.error ?? "Confirmation impossible.");
        return;
      }

      router.refresh();
    } catch {
      setError("Erreur réseau.");
    } finally {
      setSigningId(null);
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
            <FileText className="h-5 w-5 text-brand-indigo" />
            Documents projet
          </h2>
          <p className="mt-1 text-sm text-brand-muted">
            Accords budget mandant, PV de séance et validations HERMES archivés
            dans le dossier projet.
          </p>
        </div>
        {pending.length > 0 && (
          <Badge variant="warning">
            {pending.length} document{pending.length > 1 ? "s" : ""} en attente
          </Badge>
        )}
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {pendingBudget.length > 0 && canManage && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <h3 className="text-sm font-semibold text-amber-950">
            Rappel — accord budget mandant à archiver
          </h3>
          <p className="mt-1 text-sm text-amber-900">
            Le budget a été validé en initialisation. Déposez l&apos;accord
            budget signé du mandant dans le dossier projet, puis confirmez
            l&apos;archivage ci-dessous.
          </p>
        </div>
      )}

      {pendingPv.length > 0 && canManage && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <h3 className="text-sm font-semibold text-amber-950">
            Rappel — PV de séance à compléter
          </h3>
          <p className="mt-1 text-sm text-amber-900">
            Suite à une validation de phase en séance, ajoutez le PV signé au
            dossier en confirmant la signature ci-dessous.
          </p>
        </div>
      )}

      {documents.length === 0 ? (
        <p className="text-sm text-brand-muted">
          Aucun document pour ce projet. Les accords budget et PV sont créés
          lors de la validation du budget ou d&apos;une phase en séance.
        </p>
      ) : (
        <ul className="space-y-4">
          {documents.map((document) => (
            <li
              key={document.id}
              className="rounded-xl border border-slate-200 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-slate-900">{document.title}</p>
                  <p className="mt-1 text-xs text-brand-muted">
                    {documentDateLabel(document)}
                    {document.type === "pv_validation_phase" && (
                      <>
                        {" "}
                        · Phase{" "}
                        {getPhaseLabel(document.phase, project.approach)}
                      </>
                    )}
                  </p>
                </div>
                <Badge
                  variant={
                    document.status === "signed" ? "success" : "warning"
                  }
                >
                  {documentStatusLabel(document)}
                </Badge>
              </div>

              {document.sessionMandantSignature && (
                <p className="mt-3 text-sm text-brand-muted">
                  Signature mandant :{" "}
                  <span className="font-medium text-slate-800">
                    {document.sessionMandantSignature}
                  </span>
                </p>
              )}

              {document.status === "signed" && document.pvSignatureText && (
                <p className="mt-2 text-sm text-emerald-800">
                  Archivage confirmé par {document.pvSignatureText}
                  {document.signedAt && (
                    <> · {formatDate(document.signedAt.slice(0, 10))}</>
                  )}
                </p>
              )}

              {document.status === "pending_signature" && canManage && (
                <div className="mt-4 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3">
                  <label className="flex items-center gap-2 text-sm font-medium text-slate-900">
                    <PenLine className="h-4 w-4" />
                    {document.type === "accord_budget_mandant"
                      ? "Confirmer l'archivage de l'accord signé"
                      : "Signature sur le PV de séance"}
                  </label>
                  <input
                    value={signatures[document.id] ?? ""}
                    onChange={(e) =>
                      setSignatures((current) => ({
                        ...current,
                        [document.id]: e.target.value,
                      }))
                    }
                    placeholder={
                      document.type === "accord_budget_mandant"
                        ? "Votre nom (chef de projet)"
                        : "Nom du signataire du PV"
                    }
                    className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  />
                  <button
                    type="button"
                    disabled={
                      signingId === document.id ||
                      !signatures[document.id]?.trim()
                    }
                    onClick={() => void signDocument(document)}
                    className="mt-3 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                  >
                    {signingId === document.id ? (
                      <Loader2 className="inline h-4 w-4 animate-spin" />
                    ) : document.type === "accord_budget_mandant" ? (
                      "Confirmer l'accord archivé"
                    ) : (
                      "Confirmer le PV signé"
                    )}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <p className="mt-4 text-xs text-brand-muted">
        Les accords mandant et PV de séance sont distincts des documents HERMES
        générés automatiquement (section ci-dessus).{" "}
        <Link href="/documents" className="text-brand-indigo hover:underline">
          Voir tous les documents
        </Link>
      </p>
    </section>
  );
}
