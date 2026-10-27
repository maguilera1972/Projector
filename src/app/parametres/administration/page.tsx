import { redirect } from "next/navigation";
import { Header } from "@/components/layout/header";
import { Badge } from "@/components/ui/badge";
import { AdminCreateUserForm } from "@/components/admin/admin-create-user-form";
import { AdminUsersTable } from "@/components/admin/admin-users-table";
import { AdminProjectsTable } from "@/components/admin/admin-projects-table";
import { AdminPortfoliosTable } from "@/components/admin/admin-portfolios-table";
import { ProjectMandantAssignmentTable } from "@/components/admin/project-mandant-assignment-table";
import { AdminInvitationsPanel } from "@/components/admin/admin-invitations-panel";
import { AdminMailPanel } from "@/components/admin/admin-mail-panel";
import { AdminEntraPanel } from "@/components/admin/admin-entra-panel";
import { AdminTeamsPanel } from "@/components/admin/admin-teams-panel";
import { getEntraRedirectUri, isEntraLoginEnabled } from "@/lib/auth/entra";
import { getRequestTranslator } from "@/lib/i18n/server";
import { getMailSender } from "@/lib/mail/graph";
import {
  listUsers,
  listAllUsers,
  listProjects,
  listPortfolios,
  listTasks,
  listActivities,
  listInvitations,
  getEntraSettings,
  listPlatformAuditLog,
} from "@/lib/db/store";
import { getSessionUser } from "@/lib/auth/session";
import { ALL_PERMISSIONS, hasPermission, isUserActive, PERMISSIONS } from "@/lib/auth/permissions";
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
  const { t } = await getRequestTranslator();

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
  const canInvite = hasPermission(user, PERMISSIONS.USERS_WRITE);
  const invitations = canInvite ? await listInvitations() : [];
  const mailSender = getMailSender();
  const entraSettings = isAdmin ? await getEntraSettings() : null;
  const platformAudit = isAdmin ? await listPlatformAuditLog(40) : [];

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
        title={t("admin.title")}
        subtitle={isAdmin ? t("admin.subtitleAdmin") : t("admin.subtitleMandant")}
        user={user}
      />

      <main className="p-8">
        {isAdmin && (
          <>
            <div className="mb-8 grid gap-6 sm:grid-cols-3">
              <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                <p className="text-sm text-brand-muted">{t("admin.activeUsers")}</p>
                <p className="mt-1 text-3xl font-bold text-slate-900">
                  {allUsers.filter(isUserActive).length}
                </p>
                <p className="mt-1 text-xs text-brand-muted">
                  {t("admin.suspendedCount", {
                    count: allUsers.filter((account) => account.status === "suspended").length,
                  })}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                <p className="text-sm text-brand-muted">{t("admin.admins")}</p>
                <p className="mt-1 text-3xl font-bold text-slate-900">
                  {allUsers.filter((account) => account.role === "admin").length}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                <p className="text-sm text-brand-muted">{t("admin.systemPermissions")}</p>
                <p className="mt-1 text-3xl font-bold text-slate-900">
                  {ALL_PERMISSIONS.length}
                </p>
              </div>
            </div>

            <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 px-6 py-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">
                    {t("admin.usersTitle")}
                  </h2>
                  <p className="mt-1 max-w-2xl text-sm text-brand-muted">
                    {t("admin.usersDescription")}
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

        {canInvite && (
          <AdminInvitationsPanel
            invitations={invitations}
            currentUserIsAdmin={isAdmin}
            mailConfigured={mailSender !== null}
          />
        )}

        {isAdmin && entraSettings && (
          <AdminEntraPanel
            enabled={isEntraLoginEnabled()}
            redirectUri={getEntraRedirectUri()}
            settings={entraSettings}
            auditLog={platformAudit}
          />
        )}

        {isAdmin && <AdminMailPanel sender={mailSender} />}

        {isAdmin && <AdminTeamsPanel />}

        <section
          className={`rounded-xl border border-slate-200 bg-white shadow-sm ${isAdmin || canInvite ? "mt-8" : ""}`}
        >
          <div className="border-b border-slate-100 px-6 py-4">
            <h2 className="text-lg font-semibold text-slate-900">
              {t("admin.mandantsTitle")}
            </h2>
            <p className="mt-1 text-sm text-brand-muted">
              {t("admin.mandantsDescription")}
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
                  {t("admin.portfoliosTitle")}
                </h2>
                <p className="mt-1 text-sm text-brand-muted">
                  {t("admin.portfoliosDescription")}
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
                  {t("admin.projectsTitle")}
                </h2>
                <p className="mt-1 text-sm text-brand-muted">
                  {t("admin.projectsDescription")}
                </p>
              </div>
              <AdminProjectsTable
                projects={projects}
                portfolioNames={portfolioNames}
              />
            </section>

            <section className="mt-8 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">
                {t("admin.availablePermissions")}
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
