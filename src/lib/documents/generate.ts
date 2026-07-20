import { mergeDocumentTemplate } from "@/lib/documents/merge";
import { resolveTemplatesForPhaseValidation } from "@/lib/documents/templates";
import { getQualityGateForPhase } from "@/lib/hermes/referential";
import type {
  DocumentLocale,
  GeneratedDocument,
  PhaseValidation,
  Project,
  Task,
} from "@/types";

export function getProjectDocumentLocale(project: Project): DocumentLocale {
  return project.documentLocale ?? "fr";
}

export function generateDocumentsForValidation(
  project: Project,
  validation: PhaseValidation,
  tasks: Task[],
  existingDocuments: GeneratedDocument[],
  actorId: string,
  actorName: string,
): GeneratedDocument[] {
  const locale = getProjectDocumentLocale(project);
  const fromPhase = validation.fromPhase;
  const templates = resolveTemplatesForPhaseValidation(
    fromPhase,
    project.approach,
  );
  const now = new Date().toISOString();
  const gate = getQualityGateForPhase(fromPhase, project.approach);

  return templates.map((template) => {
    const priorVersions = existingDocuments.filter(
      (doc) => doc.projectId === project.id && doc.templateId === template.id,
    );
    const version =
      priorVersions.length > 0
        ? Math.max(...priorVersions.map((doc) => doc.version)) + 1
        : 1;

    const outcomeKey = template.outcomeKeysFr[0] ?? template.id;
    const { title, contentMarkdown } = mergeDocumentTemplate(
      template,
      locale,
      project,
      fromPhase,
      validation,
      tasks,
      version,
    );

    return {
      id: crypto.randomUUID(),
      projectId: project.id,
      templateId: template.id,
      outcomeKey,
      phase: fromPhase,
      validationId: validation.id,
      locale,
      version,
      title,
      contentMarkdown,
      milestone: gate?.milestoneFr,
      signatureText: validation.signatureText,
      generatedBy: actorId,
      generatedByName: actorName,
      generatedAt: now,
      wordTemplateFile: template.wordFile,
      hasDocx: Boolean(template.wordFile),
    };
  });
}
