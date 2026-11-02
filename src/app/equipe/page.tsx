import { redirect } from "next/navigation";
import { Header } from "@/components/layout/header";
import { TeamView } from "@/components/team/team-view";
import {
  listResourceGroups,
  listResourceProfiles,
  listUserSkills,
  listUsers,
} from "@/lib/db/store";
import { getSessionUser } from "@/lib/auth/session";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getRequestTranslator } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function EquipePage() {
  const { t } = await getRequestTranslator();
  const user = await getSessionUser();
  if (!user) redirect("/login");

  if (!hasPermission(user, PERMISSIONS.TEAM_READ)) {
    redirect("/");
  }

  const [users, groups, skills, profiles] = await Promise.all([
    listUsers(),
    listResourceGroups(),
    listUserSkills(),
    listResourceProfiles(),
  ]);

  const canEdit = hasPermission(user, PERMISSIONS.TEAM_WRITE);

  return (
    <>
      <Header
        title={t("pages.teamTitle")}
        subtitle={t("pages.teamSubtitle")}
        user={user}
      />
      <main className="p-8">
        <TeamView
          users={users}
          groups={groups}
          skills={skills}
          profiles={profiles}
          canEdit={canEdit}
        />
      </main>
    </>
  );
}
