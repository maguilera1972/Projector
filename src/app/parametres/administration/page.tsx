import { redirect } from "next/navigation";
import { Header } from "@/components/layout/header";
import { Badge } from "@/components/ui/badge";
import { AdminCreateUserForm } from "@/components/admin/admin-create-user-form";
import { AdminUsersTable } from "@/components/admin/admin-users-table";
import { AdminProjectsTable } from "@/components/admin/admin-projects-table";
import { AdminPortfoliosTable } from "@/components/admin/admin-portfolios-table";
import { ProjectMandantAssignmentTable } from "@/components/admin/project-mandant-assignment-table";
import {
  listUsers,
  listAllUsers,
  listProjects,
  listPortfolios,
  listTasks,
  listActivities,
} from "@/lib/db/store";
import { getSessionUser } from "@/lib/auth/session";
import { ALL_PERMISSIONS, isUserActive } from "@/lib/auth/permissions";
import {
  canUserManageProjectMandant,
  isPlatformAdmin,
} from "@/lib/hermes/project-roles";
import { toAssigneeOptions } from "@/lib/users";
import { findUserActiveProjectLinks } from "@/lib/users/project-links";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdministrationPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const projects = await listProjects();
  const portfolios = await listPortfolios(true);
  const portfolioById = new Map(portfolios.map((p) => [p.id, p]));
  const isAdmin = isPlatformAdmin(user);

  const manageableProjects = isAdmin
    ? projects
    : projects.filter((project) => {
        const portfolio = project.portfolioId
          ? portfolioById.get(project.portfolioId)
          : undefined;
        return canUserManageProjectMandant(user, project, portfolio);
      });

  if (!isAdmin && manageableProjects.length === 0) {
    redirect("/parametres");
  }

  const activeUsers = await listUsers();
  const allUsers = isAdmin ? await listAllUsers() : activeUsers;
  const assigneeOptions = toAssigneeOptions(activeUsers);
  const tasks = isAdmin ? await listTasks() : [];
  const activities = isAdmin ? await listActivities() : [];

  const deletionBlockers = isAdmin
    ? Object.fromEntries(
        allUsers.map((account) => [
          account.id,
          findUserActiveProjectLinks(
            account.id,
            projects,
            tasks,
            activities,
          ),
        ]),
      )
    : {};

  const portfolioNames = Object.fromEntries(
    portfolios.map((p) => [p.id, p.name]),
  );
  const projectCounts = Object.fromEntries(
    portfolios.map((p) => [
      p.id,
      projects.filter((project) => project.portfolioId === p.id).length,
    ]),
  );

  return (
    <>
      <Header
        title="Administration"
        subtitle={
          isAdmin
            ? "Gestion des utilisateurs, mandants et permissions"
            : "Assignation des mandants pour vos projets"
        }
        user={user}
      />

      <main className="p-8">
        {isAdmin && (
          <>
            <div className="mb-8 grid gap-6 sm:grid-cols-3">
              <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                <p className="text-sm text-brand-muted">Utilisateurs actifs</p>
                <p className="mt-1 text-3xl font-bold text-slate-900">
                  {allUsers.filter(isUserActive).length}
                </p>
                <p className="mt-1 text-xs text-brand-muted">
                  {allUsers.filter((account) => account.status === "suspended").length}{" "}
                  suspendu(s)
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                <p className="text-sm text-brand-muted">Administrateurs</p>
                <p className="mt-1 text-3xl font-bold text-slate-900">
                  {allUsers.filter((account) => account.role === "admin").length}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                <p className="text-sm text-brand-muted">Permissions système</p>
                <p className="mt-1 text-3xl font-bold text-slate-900">
                  {ALL_PERMISSIONS.length}
                </p>
              </div>
            </div>

            <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 px-6 py-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">
                    Utilisateurs
                  </h2>
                  <p className="mt-1 max-w-2xl text-sm text-brand-muted">
                    Créez, modifiez ou supprimez des comptes. La suppression
                    n&apos;est possible que si l&apos;utilisateur n&apos;est rattaché
                    à aucun projet actif (mandant, chef de projet ou assignation
                    de tâche).
                  </p>
                </div>
                <AdminCreateUserForm />
              </div>

              <AdminUsersTable
                users={allUsers}
                currentUserId={user.id}
                currentUserIsAdmin={isAdmin}
                deletionBlockers={deletionBlockers}
              />
            </section>
          </>
        )}

        <section
          className={`rounded-xl border border-slate-200 bg-white shadow-sm ${isAdmin ? "mt-8" : ""}`}
        >
          <div className="border-b border-slate-100 px-6 py-4">
            <h2 className="text-lg font-semibold text-slate-900">
              Mandants de projet
            </h2>
            <p className="mt-1 text-sm text-brand-muted">
              Liez chaque projet à un <strong>utilisateur mandant</strong> du
              système. Seul cet utilisateur pourra valider le budget et
              confirmer les libérations de phase (signature HERMES). Sans
              compte lié, les demandes de validation ne pourront pas être
              traitées par le mandant dans l&apos;application.
            </p>
          </div>
          <ProjectMandantAssignmentTable
            projects={manageableProjects}
            users={assigneeOptions}
            portfolioNames={portfolioNames}
            canEdit
          />
        </section>

        {isAdmin && (
          <>
            <section className="mt-8 rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-6 py-4">
                <h2 className="text-lg font-semibold text-slate-900">
                  Gestion des portfolios
                </h2>
                <p className="mt-1 text-sm text-brand-muted">
                  Suppression définitive d&apos;un portfolio. Tous les projets
                  associés (et leurs tâches) seront également supprimés.
                </p>
              </div>
              <AdminPortfoliosTable
                portfolios={portfolios}
                projectCounts={projectCounts}
              />
            </section>

            <section className="mt-8 rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-6 py-4">
                <h2 className="text-lg font-semibold text-slate-900">
                  Gestion des projets
                </h2>
                <p className="mt-1 text-sm text-brand-muted">
                  Suppression définitive d&apos;un projet, quel que soit son
                  statut.
                </p>
              </div>
              <AdminProjectsTable
                projects={projects}
                portfolioNames={portfolioNames}
              />
            </section>

            <section className="mt-8 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">
                Permissions disponibles
              </h2>
              <div className="mt-4 flex flex-wrap gap-2">
                {ALL_PERMISSIONS.map((permission) => (
                  <Badge key={permission} variant="info">
                    {permission}
                  </Badge>
                ))}
              </div>
            </section>
          </>
        )}
      </main>
    </>
  );
}
