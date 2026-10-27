import { NextResponse } from "next/server";
import type { SessionUser, User } from "@/lib/auth/permissions";
import { getSessionUser } from "@/lib/auth/session";
import { getPortfolioById, getProjectById, getUserById } from "@/lib/db/store";
import {
  canUserActAsChefDeProjet,
  canUserActAsMandant,
  isPlatformAdmin,
} from "@/lib/hermes/project-roles";
import { getRequestTranslator } from "@/lib/i18n/server";
import type { Translator } from "@/lib/i18n/translate";
import { getIntegrationTranslator, type IntegrationTranslator } from "./i18n";
import type { Project } from "@/types";
import { GraphError, NotConfiguredError } from "./graph";

export type Actor = SessionUser & Pick<User, "entraOid">;

export type Guard<T> = { ok: true; value: T } | { ok: false; response: NextResponse };

export function jsonError(error: string, status: number): NextResponse {
  return NextResponse.json({ error }, { status });
}

/** Utilisateur de session enrichi (identifiant Entra) et traducteur de la requête. */
interface ActorContext {
  actor: Actor;
  t: Translator;
  it: IntegrationTranslator;
}

export async function requireActor(): Promise<Guard<ActorContext>> {
  const { locale, t } = await getRequestTranslator();
  const user = await getSessionUser();
  if (!user) return { ok: false, response: jsonError(t("common.notAuthenticated"), 401) };
  const account = await getUserById(user.id);
  return {
    ok: true,
    value: { actor: { ...user, entraOid: account?.entraOid }, t, it: getIntegrationTranslator(locale) },
  };
}

export async function requireAdmin(): Promise<Guard<ActorContext>> {
  const guard = await requireActor();
  if (!guard.ok) return guard;
  if (!isPlatformAdmin(guard.value.actor)) {
    return { ok: false, response: jsonError(guard.value.t("common.accessDenied"), 403) };
  }
  return guard;
}

/** Projet sur lequel l'acteur peut piloter Teams : administrateur, chef de projet ou mandant. */
export async function requireProjectManager(
  projectId: string,
  options: { allowMandant?: boolean } = {},
): Promise<Guard<ActorContext & { project: Project }>> {
  const guard = await requireActor();
  if (!guard.ok) return guard;
  const { actor, t, it } = guard.value;
  const project = await getProjectById(projectId);
  if (!project) return { ok: false, response: jsonError(it("errors.projectNotFound"), 404) };
  const portfolio = project.portfolioId ? await getPortfolioById(project.portfolioId) : undefined;
  const allowed =
    isPlatformAdmin(actor) ||
    canUserActAsChefDeProjet(actor, project, portfolio) ||
    (options.allowMandant === true && canUserActAsMandant(actor, project));
  if (!allowed) return { ok: false, response: jsonError(t("common.accessDenied"), 403) };
  return { ok: true, value: { actor, t, it, project } };
}

/** Réponse d'erreur pour une exception Graph / configuration (sans détail sensible). */
export function graphFailure(error: unknown): NextResponse {
  if (error instanceof NotConfiguredError) return jsonError(error.message, 503);
  if (error instanceof GraphError) {
    return jsonError(error.message, error.status === 403 || error.status === 401 ? 403 : 502);
  }
  return jsonError(error instanceof Error ? error.message : String(error), 400);
}
