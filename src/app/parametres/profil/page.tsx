import { redirect } from "next/navigation";
import { Header } from "@/components/layout/header";
import { ProfileForm } from "@/components/user/profile-form";
import { getUserById } from "@/lib/db/store";
import { getSessionUser } from "@/lib/auth/session";
import { getRequestTranslator } from "@/lib/i18n/server";

export default async function ProfilPage() {
  const session = await getSessionUser();
  if (!session) redirect("/login");

  const user = await getUserById(session.id);
  if (!user) redirect("/login");
  const { t } = await getRequestTranslator();

  return (
    <>
      <Header
        title={t("profile.title")}
        subtitle={t("profile.subtitle")}
        user={session}
      />

      <main className="mx-auto max-w-3xl p-8">
        <ProfileForm user={user} />
      </main>
    </>
  );
}
