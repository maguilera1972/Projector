import Link from "next/link";
import { Logo } from "@/components/ui/logo";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { getInvitationByToken } from "@/lib/db/store";
import { getRequestTranslator } from "@/lib/i18n/server";
import { tDynamic } from "@/lib/i18n/translate";
import { AcceptInvitationForm } from "./accept-form";

export const dynamic = "force-dynamic";

export default async function InvitationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const { t } = await getRequestTranslator();
  const invitation = await getInvitationByToken(decodeURIComponent(token));

  let blocker: string | null = null;
  if (!invitation) blocker = t("invitationAccept.invalid");
  else if (invitation.status === "expired") blocker = t("invitationAccept.expired");
  else if (invitation.status === "revoked") blocker = t("invitationAccept.revoked");
  else if (invitation.status === "accepted") blocker = t("invitationAccept.accepted");

  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-navy-dark px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <Logo size={48} />
        </div>

        <div className="rounded-2xl border border-white/10 bg-brand-navy p-8 shadow-2xl">
          <h1 className="text-center text-2xl font-semibold text-white">
            {t("invitationAccept.title")}
          </h1>

          {blocker || !invitation ? (
            <div className="mt-6 space-y-6 text-center">
              <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
                {blocker}
              </p>
              <Link
                href="/login"
                className="gradient-brand inline-block rounded-lg px-5 py-2.5 text-sm font-semibold text-white"
              >
                {t("invitationAccept.goLogin")}
              </Link>
            </div>
          ) : (
            <>
              <p className="mt-3 text-center text-sm text-slate-300">
                {t("invitationAccept.intro", {
                  inviter: invitation.invitedByName,
                  role: tDynamic(t, `enums.role.${invitation.role}`),
                })}
              </p>
              {invitation.message && (
                <blockquote className="mt-4 whitespace-pre-line rounded-lg border-l-2 border-brand-indigo bg-white/5 px-4 py-3 text-sm text-slate-300">
                  {invitation.message}
                </blockquote>
              )}
              <AcceptInvitationForm
                token={decodeURIComponent(token)}
                email={invitation.email}
                defaultName={invitation.name ?? ""}
                defaultLocale={invitation.locale}
              />
            </>
          )}
        </div>

        <LanguageSwitcher variant="sidebar" className="mx-auto mt-6 max-w-[14rem]" />
      </div>
    </div>
  );
}
