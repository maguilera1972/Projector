"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Circle,
  AlertCircle,
  ShieldCheck,
  Wallet,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  formatPhaseTransition,
  getBlockedChecklistItems,
} from "@/lib/hermes/quality-gates";
import { getPhaseLabel } from "@/lib/hermes/phases";
import { formatDate } from "@/lib/utils";
import type {
  AuditLogEntry,
  BudgetRevision,
  PhaseValidation,
  Project,
  ProjectDocument,
  QualityGateCheckItem,
  QualityGateContext,
} from "@/types";

const BUDGET_STATUS_LABELS = {
  draft: "Brouillon",
  pending_mandant: "En attente mandant",
  approved: "Validé",
} as const;

interface PhaseGatePanelProps {
  project: Project;
  context: QualityGateContext;
  budgetRevisions: BudgetRevision[];
  validations: PhaseValidation[];
  auditLog: AuditLogEntry[];
  pendingBudgetDocument?: ProjectDocument;
  canSubmit: boolean;
  canApprove: boolean;
}

export function PhaseGatePanel({
  project,
  context,
  budgetRevisions,
  validations,
  auditLog,
  pendingBudgetDocument,
  canSubmit,
  canApprove,
}: PhaseGatePanelProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [submitComment, setSubmitComment] = useState("");
  const [signature, setSignature] = useState("");
  const [rejectComment, setRejectComment] = useState("");
  const [revisionAmount, setRevisionAmount] = useState(
    String(project.budget ?? ""),
  );
  const [revisionHours, setRevisionHours] = useState(
    String(project.budgetHours ?? ""),
  );
  const [revisionReason, setRevisionReason] = useState("");
  const [sessionDate, setSessionDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [sessionMandantSignature, setSessionMandantSignature] = useState("");
  const [sessionComment, setSessionComment] = useState("");
  const [revisionMandantSignature, setRevisionMandantSignature] = useState("");
  const [revisionConfirmDate, setRevisionConfirmDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [editingRevision, setEditingRevision] = useState(false);

  const pendingRevision = budgetRevisions.find(
    (rev) => rev.status === "pending_mandant",
  );
  const activeValidation = context.activeValidation;
  const blockedForOnline = getBlockedChecklistItems(context.checklist);
  const blockedForSession = getBlockedChecklistItems(context.checklist, true);

  function checklistErrorMessage(
    items: typeof blockedForOnline,
    forSession: boolean,
  ): string {
    if (items.length === 0) return "";
    const prefix = forSession
      ? "Validation en séance impossible"
      : "Soumission impossible";
    return `${prefix} — points bloquants :\n${items.map((item) => `• ${item.label}${item.detail ? ` (${item.detail})` : ""}`).join("\n")}`;
  }

  async function postJson(
    url: string,
    body: unknown,
    method: "POST" | "PATCH" = "POST",
  ) {
    setSaving(true);
    setError("");
    try {
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? "Action impossible.");
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setError("Erreur réseau.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function submitSessionValidation() {
    if (!sessionDate || !sessionMandantSignature.trim()) {
      setError("La date de séance et la signature mandant sont requises.");
      return;
    }
    if (!context.checklistReadyForSession) {
      setError(checklistErrorMessage(blockedForSession, true));
      return;
    }
    await postJson(`/api/projects/${project.id}/phase-gate/session-validate`, {
      sessionDate,
      mandantSignatureText: sessionMandantSignature,
      comment: sessionComment || undefined,
    });
  }

  async function submitOnlineValidation() {
    if (!context.checklistReady) {
      setError(checklistErrorMessage(blockedForOnline, false));
      return;
    }
    await postJson(`/api/projects/${project.id}/phase-gate/submit`, {
      comment: submitComment || undefined,
    });
  }

  return (
    <section id="quality-gate" className="scroll-mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
            <ShieldCheck className="h-5 w-5 text-brand-indigo" />
            Moteur HERMES — Quality gate
          </h2>
          <p className="mt-1 text-sm text-brand-muted">
            {context.gateLabel}
            {context.milestone && (
              <> · Jalon : {context.milestone}</>
            )}
          </p>
        </div>
        <Badge variant="info">
          {getPhaseLabel(project.currentPhase, project.approach)}
        </Badge>
      </div>

      {error && (
        <div className="mb-4 whitespace-pre-line rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <BudgetSection
          project={project}
          pendingRevision={pendingRevision}
          pendingBudgetDocument={pendingBudgetDocument}
          canSubmit={canSubmit}
          canApprove={canApprove}
          signature={signature}
          setSignature={setSignature}
          revisionAmount={revisionAmount}
          setRevisionAmount={setRevisionAmount}
          revisionHours={revisionHours}
          setRevisionHours={setRevisionHours}
          revisionReason={revisionReason}
          setRevisionReason={setRevisionReason}
          saving={saving}
          onApproveBudget={() =>
            void postJson(`/api/projects/${project.id}/budget/approve`, {
              signatureText: signature,
            })
          }
          onConfirmBudgetByChef={(payload) =>
            void postJson(`/api/projects/${project.id}/budget/confirm`, payload)
          }
          onRequestRevision={() =>
            void postJson(`/api/projects/${project.id}/budget-revisions`, {
              amountCHF: Number(revisionAmount),
              hoursForfait: revisionHours ? Number(revisionHours) : undefined,
              reason: revisionReason || undefined,
            })
          }
          onApproveRevision={() =>
            pendingRevision &&
            void postJson(
              `/api/budget-revisions/${pendingRevision.id}/approve`,
              { signatureText: revisionMandantSignature },
            )
          }
          onConfirmRevisionByChef={(payload) =>
            pendingRevision &&
            void postJson(
              `/api/budget-revisions/${pendingRevision.id}/confirm`,
              payload,
            )
          }
          onCancelRevision={() =>
            pendingRevision &&
            void postJson(
              `/api/budget-revisions/${pendingRevision.id}/cancel`,
              {},
            )
          }
          onUpdateRevision={(payload) =>
            pendingRevision &&
            void postJson(
              `/api/budget-revisions/${pendingRevision.id}`,
              payload,
              "PATCH",
            )
          }
          revisionMandantSignature={revisionMandantSignature}
          setRevisionMandantSignature={setRevisionMandantSignature}
          revisionConfirmDate={revisionConfirmDate}
          setRevisionConfirmDate={setRevisionConfirmDate}
          editingRevision={editingRevision}
          setEditingRevision={setEditingRevision}
        />

        <div className="rounded-xl border border-slate-200 p-4">
          <h3 className="text-sm font-semibold text-slate-900">
            Transition de phase
          </h3>
          {context.canAdvance && !context.isTerminal ? (
            <p className="mt-2 text-sm text-brand-muted">
              {formatPhaseTransition(
                context.currentPhase,
                context.nextPhase,
                context.approach,
              )}
            </p>
          ) : context.isTerminal ? (
            <p className="mt-2 text-sm text-brand-muted">
              Clôture du projet — validation finale par le mandant.
            </p>
          ) : (
            <p className="mt-2 text-sm text-brand-muted">
              Aucune transition disponible.
            </p>
          )}

          {activeValidation ? (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
              <p className="font-medium text-amber-900">
                Demande en attente de signature mandant
              </p>
              <p className="mt-1 text-amber-800">
                Soumise le {formatDate(activeValidation.submittedAt.slice(0, 10))}
              </p>
              {activeValidation.submitComment && (
                <p className="mt-2 text-amber-800">
                  {activeValidation.submitComment}
                </p>
              )}
            </div>
          ) : null}
        </div>
      </div>

      <div className="mb-6">
        <h3 className="mb-3 text-sm font-semibold text-slate-900">
          Liste de contrôle
        </h3>
        <ul className="space-y-2">
          {context.checklist.map((item) => (
            <ChecklistRow key={item.id} item={item} />
          ))}
        </ul>
      </div>

      {context.pendingPvDocuments > 0 && canSubmit && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <strong>{context.pendingPvDocuments}</strong> PV de séance en attente
          de signature dans les documents projet. Complétez-les dans la section
          Documents ci-dessous.
        </div>
      )}

      {!activeValidation && canSubmit && context.canAdvance && (
        <>
          {blockedForOnline.length > 0 && (
            <ChecklistBlockersBanner
              title="Prérequis pour la soumission en ligne"
              items={blockedForOnline}
            />
          )}

          <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Users className="h-4 w-4 text-emerald-700" />
              Validation en séance de phase
            </h3>
            <p className="mt-1 text-sm text-brand-muted">
              Le mandant valide la phase lors d&apos;une réunion. La phase est
              libérée immédiatement ; le budget ou la révision en attente est
              validé avec la même signature. Un rappel vous demandera
              d&apos;archiver le PV de séance signé dans les documents du
              projet.
            </p>
            {blockedForSession.length > 0 && (
              <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                <p className="font-medium">Points bloquants en séance :</p>
                <ul className="mt-1 list-inside list-disc">
                  {blockedForSession.map((item) => (
                    <li key={item.id}>
                      {item.label}
                      {item.detail ? ` — ${item.detail}` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-brand-muted">
                  Date de la séance
                </label>
                <input
                  type="date"
                  value={sessionDate}
                  onChange={(e) => setSessionDate(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-brand-muted">
                  Signature mandant (séance)
                </label>
                <input
                  value={sessionMandantSignature}
                  onChange={(e) => setSessionMandantSignature(e.target.value)}
                  placeholder="Nom complet du mandant"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
            </div>
            <textarea
              rows={2}
              value={sessionComment}
              onChange={(e) => setSessionComment(e.target.value)}
              placeholder="Compte-rendu ou décisions de la séance (optionnel)"
              className="mt-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
            <button
              type="button"
              disabled={
                saving || !sessionDate || !sessionMandantSignature.trim()
              }
              onClick={() => void submitSessionValidation()}
              className="mt-3 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "Validation…" : "Valider la phase (séance)"}
            </button>
          </div>

          <div className="mb-6 rounded-xl border border-dashed border-slate-300 p-4">
            <h3 className="text-sm font-semibold text-slate-900">
              Soumettre au mandant (validation en ligne)
            </h3>
            <p className="mt-1 text-sm text-brand-muted">
              Exige que toutes les tâches de la phase soient terminées et que le
              budget soit déjà validé par le mandant dans l&apos;application.
            </p>
            <textarea
              rows={2}
              value={submitComment}
              onChange={(e) => setSubmitComment(e.target.value)}
              placeholder="Commentaire pour le mandant (optionnel)"
              className="mt-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
            <button
              type="button"
              disabled={saving}
              onClick={() => void submitOnlineValidation()}
              className="mt-3 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "Envoi…" : "Soumettre la libération de phase"}
            </button>
          </div>
        </>
      )}

      {activeValidation && canApprove && (
        <div className="mb-6 rounded-xl border border-brand-indigo/30 bg-indigo-50/40 p-4">
          <h3 className="text-sm font-semibold text-slate-900">
            Validation mandant
          </h3>
          <label className="mt-3 block text-sm font-medium">
            Signature (nom complet)
          </label>
          <input
            value={signature}
            onChange={(e) => setSignature(e.target.value)}
            placeholder="Nom du mandant"
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              disabled={saving || !signature.trim()}
              onClick={() =>
                void postJson(
                  `/api/projects/${project.id}/phase-gate/approve`,
                  { signatureText: signature },
                )
              }
              className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              Phase confirmée
            </button>
          </div>
          <div className="mt-4">
            <label className="block text-sm font-medium text-red-700">
              Refuser (commentaire obligatoire)
            </label>
            <textarea
              rows={2}
              value={rejectComment}
              onChange={(e) => setRejectComment(e.target.value)}
              className="mt-1 w-full rounded-lg border border-red-200 px-3 py-2 text-sm"
            />
            <button
              type="button"
              disabled={saving || !rejectComment.trim()}
              onClick={() =>
                void postJson(
                  `/api/projects/${project.id}/phase-gate/reject`,
                  { comment: rejectComment },
                )
              }
              className="mt-2 rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              Refuser la demande
            </button>
          </div>
        </div>
      )}

      {validations.length > 0 && (
        <div className="mb-6">
          <h3 className="mb-2 text-sm font-semibold text-slate-900">
            Historique des validations
          </h3>
          <ul className="space-y-2 text-sm">
            {validations.slice(0, 5).map((validation) => (
              <li
                key={validation.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2"
              >
                <span>
                  {formatPhaseTransition(
                    validation.fromPhase,
                    validation.toPhase,
                    project.approach,
                  )}
                  {validation.mode === "session" && (
                    <Badge variant="muted" className="ml-2">
                      Séance
                    </Badge>
                  )}
                </span>
                <Badge
                  variant={
                    validation.status === "approved"
                      ? "success"
                      : validation.status === "rejected"
                        ? "warning"
                        : "info"
                  }
                >
                  {validation.status === "approved"
                    ? "Confirmée"
                    : validation.status === "rejected"
                      ? "Refusée"
                      : "Soumise"}
                </Badge>
              </li>
            ))}
          </ul>
        </div>
      )}

      {auditLog.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-slate-900">
            Journal d&apos;audit (extrait)
          </h3>
          <ul className="max-h-48 space-y-1 overflow-y-auto text-xs text-brand-muted">
            {auditLog.slice(0, 8).map((entry) => (
              <li key={entry.id} className="rounded bg-slate-50 px-2 py-1.5">
                <span className="font-medium text-slate-700">
                  {entry.actorName}
                </span>{" "}
                — {entry.action} —{" "}
                {new Date(entry.createdAt).toLocaleString("fr-CH")}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function ChecklistBlockersBanner({
  title,
  items,
}: {
  title: string;
  items: QualityGateCheckItem[];
}) {
  return (
    <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
      <p className="font-semibold">{title}</p>
      <ul className="mt-2 space-y-1">
        {items.map((item) => (
          <li key={item.id} className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              {item.label}
              {item.detail ? (
                <span className="text-amber-800"> — {item.detail}</span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ChecklistRow({ item }: { item: QualityGateCheckItem }) {
  const Icon =
    item.status === "ok"
      ? CheckCircle2
      : item.status === "blocked"
        ? AlertCircle
        : Circle;

  const color =
    item.status === "ok"
      ? "text-emerald-600"
      : item.status === "blocked"
        ? "text-red-500"
        : "text-amber-500";

  return (
    <li className="flex items-start gap-3 rounded-lg border border-slate-100 px-3 py-2 text-sm">
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${color}`} />
      <div>
        <p className="text-slate-800">{item.label}</p>
        {item.detail && (
          <p className="mt-0.5 text-xs text-brand-muted">{item.detail}</p>
        )}
      </div>
    </li>
  );
}

interface BudgetSectionProps {
  project: Project;
  pendingRevision?: BudgetRevision;
  pendingBudgetDocument?: ProjectDocument;
  canSubmit: boolean;
  canApprove: boolean;
  signature: string;
  setSignature: (value: string) => void;
  revisionAmount: string;
  setRevisionAmount: (value: string) => void;
  revisionHours: string;
  setRevisionHours: (value: string) => void;
  revisionReason: string;
  setRevisionReason: (value: string) => void;
  saving: boolean;
  onApproveBudget: () => void;
  onConfirmBudgetByChef: (payload: {
    validationDate: string;
    mandantSignatureText: string;
    comment?: string;
  }) => void;
  onRequestRevision: () => void;
  onApproveRevision: () => void;
  onConfirmRevisionByChef: (payload: {
    validationDate: string;
    mandantSignatureText: string;
    comment?: string;
  }) => void;
  onCancelRevision: () => void;
  onUpdateRevision: (payload: {
    amountCHF: number;
    hoursForfait?: number;
    reason?: string;
  }) => void;
  revisionMandantSignature: string;
  setRevisionMandantSignature: (value: string) => void;
  revisionConfirmDate: string;
  setRevisionConfirmDate: (value: string) => void;
  editingRevision: boolean;
  setEditingRevision: (value: boolean) => void;
}

function BudgetSection({
  project,
  pendingRevision,
  pendingBudgetDocument,
  canSubmit,
  canApprove,
  signature,
  setSignature,
  revisionAmount,
  setRevisionAmount,
  revisionHours,
  setRevisionHours,
  revisionReason,
  setRevisionReason,
  saving,
  onApproveBudget,
  onConfirmBudgetByChef,
  onRequestRevision,
  onApproveRevision,
  onConfirmRevisionByChef,
  onCancelRevision,
  onUpdateRevision,
  revisionMandantSignature,
  setRevisionMandantSignature,
  revisionConfirmDate,
  setRevisionConfirmDate,
  editingRevision,
  setEditingRevision,
}: BudgetSectionProps) {
  const [budgetValidationDate, setBudgetValidationDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [budgetMandantSignature, setBudgetMandantSignature] = useState("");
  const [budgetComment, setBudgetComment] = useState("");

  const [editAmount, setEditAmount] = useState("");
  const [editHours, setEditHours] = useState("");
  const [editReason, setEditReason] = useState("");
  const [revisionComment, setRevisionComment] = useState("");

  const showChefBudgetConfirm =
    canSubmit &&
    project.currentPhase === "initialisation" &&
    project.budgetStatus !== "approved" &&
    !pendingRevision;

  return (
    <div id="budget-section" className="rounded-xl border border-slate-200 p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
        <Wallet className="h-4 w-4" />
        Budget & forfait d&apos;heures
      </h3>
      <dl className="mt-3 space-y-2 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-brand-muted">Montant estimé</dt>
          <dd className="font-medium">
            {project.budget
              ? `${project.budget.toLocaleString("fr-CH")} CHF`
              : "—"}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-brand-muted">Carnet d&apos;heures</dt>
          <dd className="font-medium">
            {project.budgetHours ? `${project.budgetHours} h` : "—"}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-brand-muted">Statut</dt>
          <dd>
            <Badge
              variant={
                project.budgetStatus === "approved" ? "success" : "warning"
              }
            >
              {BUDGET_STATUS_LABELS[project.budgetStatus]}
            </Badge>
          </dd>
        </div>
      </dl>

      {pendingBudgetDocument && canSubmit && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="font-medium">Document mandant à archiver</p>
          <p className="mt-1">
            La validation du budget a été enregistrée. Ajoutez l&apos;accord
            budget signé du mandant aux documents du projet (section Documents
            ci-dessous) et confirmez l&apos;archivage.
          </p>
        </div>
      )}

      {showChefBudgetConfirm && (
        <div className="mt-4 border-t border-slate-100 pt-4">
          <h4 className="text-sm font-semibold text-slate-900">
            Validation du budget (initialisation)
          </h4>
          <div className="mt-2 rounded-lg border border-indigo-200 bg-indigo-50/60 p-3 text-sm text-indigo-950">
            <p className="font-medium">Rappel documentaire HERMES</p>
            <p className="mt-1">
              Cette action enregistre la validation du budget global par le
              mandant. Elle doit s&apos;appuyer sur un{" "}
              <strong>document signé du mandant</strong> (accord budget /
              mandat) que vous devrez{" "}
              <strong>ajouter aux documents du projet</strong> dans la section
              Documents.
            </p>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-brand-muted">
                Date de validation
              </label>
              <input
                type="date"
                value={budgetValidationDate}
                onChange={(e) => setBudgetValidationDate(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-brand-muted">
                Signature mandant (sur l&apos;accord)
              </label>
              <input
                value={budgetMandantSignature}
                onChange={(e) => setBudgetMandantSignature(e.target.value)}
                placeholder="Nom complet du mandant"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
          </div>
          <textarea
            rows={2}
            value={budgetComment}
            onChange={(e) => setBudgetComment(e.target.value)}
            placeholder="Référence du document ou commentaire (optionnel)"
            className="mt-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
          <button
            type="button"
            disabled={
              saving ||
              !budgetValidationDate ||
              !budgetMandantSignature.trim()
            }
            onClick={() =>
              onConfirmBudgetByChef({
                validationDate: budgetValidationDate,
                mandantSignatureText: budgetMandantSignature,
                comment: budgetComment || undefined,
              })
            }
            className="mt-3 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Enregistrement…" : "Confirmer la validation du budget"}
          </button>
        </div>
      )}

      {canApprove && project.budgetStatus !== "approved" && (
        <div className="mt-4 border-t border-slate-100 pt-4">
          <p className="text-xs font-medium text-brand-muted">
            Validation en ligne par le mandant
          </p>
          <label className="mt-2 block text-xs font-medium text-brand-muted">
            Signature mandant
          </label>
          <input
            value={signature}
            onChange={(e) => setSignature(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            placeholder="Nom du mandant"
          />
          <button
            type="button"
            disabled={saving || !signature.trim()}
            onClick={onApproveBudget}
            className="mt-2 rounded-lg bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            Valider le budget
          </button>
        </div>
      )}

      {pendingRevision && (
        <div
          id="budget-revision-pending"
          className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm"
        >
          <h4 className="font-semibold text-amber-900">
            Révision budgétaire en attente
          </h4>
          <p className="mt-1 text-xs text-amber-800">
            Motif : {pendingRevision.reason?.trim() || "sans motif"}
          </p>
          <dl className="mt-3 space-y-2">
            <div className="flex justify-between gap-4">
              <dt className="text-amber-800">Budget actuel</dt>
              <dd>
                {project.budget
                  ? `${project.budget.toLocaleString("fr-CH")} CHF`
                  : "—"}
                {project.budgetHours ? ` · ${project.budgetHours} h` : ""}
              </dd>
            </div>
            <div className="flex justify-between gap-4 font-medium text-amber-950">
              <dt>Montant proposé</dt>
              <dd>
                {pendingRevision.amountCHF.toLocaleString("fr-CH")} CHF
                {pendingRevision.hoursForfait
                  ? ` · ${pendingRevision.hoursForfait} h`
                  : ""}
              </dd>
            </div>
          </dl>

          {canApprove && !editingRevision && (
            <div className="mt-4 border-t border-amber-200 pt-4">
              <p className="text-xs font-medium text-amber-900">
                Validation en ligne (mandant)
              </p>
              <label className="mt-2 block text-xs font-medium text-amber-800">
                Signature mandant
              </label>
              <input
                value={revisionMandantSignature}
                onChange={(e) => setRevisionMandantSignature(e.target.value)}
                className="mt-1 w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm"
                placeholder="Nom complet du mandant"
              />
              <button
                type="button"
                disabled={saving || !revisionMandantSignature.trim()}
                onClick={onApproveRevision}
                className="mt-2 rounded-lg bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
              >
                Approuver la révision
              </button>
            </div>
          )}

          {canSubmit && !editingRevision && (
            <div className="mt-4 border-t border-amber-200 pt-4">
              <p className="text-xs font-medium text-amber-900">
                Confirmation en séance (chef de projet)
              </p>
              <p className="mt-1 text-xs text-amber-800">
                Enregistrez l&apos;accord du mandant lors d&apos;une réunion,
                ou validez la phase en séance ci-dessous pour approuver la
                révision avec la même signature.
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-amber-800">
                    Date de séance
                  </label>
                  <input
                    type="date"
                    value={revisionConfirmDate}
                    onChange={(e) => setRevisionConfirmDate(e.target.value)}
                    className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-amber-800">
                    Signature mandant
                  </label>
                  <input
                    value={revisionMandantSignature}
                    onChange={(e) =>
                      setRevisionMandantSignature(e.target.value)
                    }
                    placeholder="Nom complet du mandant"
                    className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <textarea
                rows={2}
                value={revisionComment}
                onChange={(e) => setRevisionComment(e.target.value)}
                placeholder="Référence PV ou commentaire (optionnel)"
                className="mt-3 w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm"
              />
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={
                    saving ||
                    !revisionConfirmDate ||
                    !revisionMandantSignature.trim()
                  }
                  onClick={() =>
                    onConfirmRevisionByChef({
                      validationDate: revisionConfirmDate,
                      mandantSignatureText: revisionMandantSignature,
                      comment: revisionComment || undefined,
                    })
                  }
                  className="rounded-lg bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                >
                  Confirmer la révision en séance
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => {
                    setEditAmount(String(pendingRevision.amountCHF));
                    setEditHours(
                      pendingRevision.hoursForfait
                        ? String(pendingRevision.hoursForfait)
                        : "",
                    );
                    setEditReason(pendingRevision.reason ?? "");
                    setEditingRevision(true);
                  }}
                  className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-sm font-medium text-amber-950 hover:bg-amber-100 disabled:opacity-50"
                >
                  Modifier la révision
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={onCancelRevision}
                  className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                >
                  Annuler la révision
                </button>
              </div>
            </div>
          )}

          {canSubmit && editingRevision && (
            <div className="mt-4 border-t border-amber-200 pt-4">
              <p className="text-xs font-medium text-amber-900">
                Modifier la révision en attente
              </p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <input
                  type="number"
                  min={1}
                  value={editAmount}
                  onChange={(e) => setEditAmount(e.target.value)}
                  placeholder="Montant CHF"
                  className="rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm"
                />
                <input
                  type="number"
                  min={1}
                  value={editHours}
                  onChange={(e) => setEditHours(e.target.value)}
                  placeholder="Heures forfait"
                  className="rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm"
                />
                <input
                  value={editReason}
                  onChange={(e) => setEditReason(e.target.value)}
                  placeholder="Motif"
                  className="rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm sm:col-span-2"
                />
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={saving || !editAmount}
                  onClick={() => {
                    onUpdateRevision({
                      amountCHF: Number(editAmount),
                      hoursForfait: editHours ? Number(editHours) : undefined,
                      reason: editReason || undefined,
                    });
                    setEditingRevision(false);
                  }}
                  className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                >
                  Enregistrer les modifications
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => setEditingRevision(false)}
                  className="rounded-lg border border-amber-300 px-3 py-1.5 text-sm font-medium hover:bg-amber-100"
                >
                  Annuler
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {canSubmit && !pendingRevision && project.budgetStatus === "approved" && (
        <div className="mt-4 border-t border-slate-100 pt-4">
          <p className="text-xs font-medium text-brand-muted">
            Demander une révision budgétaire
          </p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <input
              type="number"
              min={1}
              value={revisionAmount}
              onChange={(e) => setRevisionAmount(e.target.value)}
              placeholder="Montant CHF"
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
            <input
              type="number"
              min={1}
              value={revisionHours}
              onChange={(e) => setRevisionHours(e.target.value)}
              placeholder="Heures forfait"
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
            <input
              value={revisionReason}
              onChange={(e) => setRevisionReason(e.target.value)}
              placeholder="Motif"
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm sm:col-span-2"
            />
          </div>
          <button
            type="button"
            disabled={saving || !revisionAmount}
            onClick={onRequestRevision}
            className="mt-2 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
          >
            Soumettre la révision au mandant
          </button>
        </div>
      )}
    </div>
  );
}
