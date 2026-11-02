import { NextResponse } from "next/server";
import { getIntegrationSettings, listUsers, updateIntegrationSettings } from "@/lib/db/store";
import { getTeamsAppCatalogIdFromEnv } from "@/lib/integrations/config";
import { describeError } from "@/lib/integrations/graph";
import { graphFailure, HTTP_UPSTREAM_FAILED, jsonError, requireAdmin } from "@/lib/integrations/http";
import { discoverCatalogId, installForAllUsers, sendTeamsActivity } from "@/lib/teams/activity";
import { cancelTeamsMeeting, createTeamsMeeting } from "@/lib/teams/meetings";
import type { Project } from "@/types";

export const dynamic = "force-dynamic";

type TestAction = "activity" | "meeting" | "discoverCatalog" | "installAll";

function tomorrowAt(hour: number): string {
  const date = new Date(Date.now() + 24 * 3600_000);
  return `${date.toISOString().slice(0, 10)}T${String(hour).padStart(2, "0")}:00`;
}

export async function POST(request: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const { actor, it } = guard.value;
  const body = (await request.json().catch(() => null)) as { action?: TestAction } | null;
  const action = body?.action;
  if (action !== "activity" && action !== "meeting" && action !== "discoverCatalog" && action !== "installAll") {
    return jsonError(it("errors.invalidBody"), 400);
  }
  const settings = await getIntegrationSettings();

  switch (action) {
    case "activity": {
      if (!actor.entraOid) return jsonError(it("errors.notLinked"), 400);
      const result = await sendTeamsActivity(
        actor.entraOid,
        {
          title: "PROJECTOR — notification de test",
          message: `Bonjour ${actor.name}, les notifications Teams de PROJECTOR fonctionnent.`,
          href: "/parametres/administration",
        },
        settings,
      );
      if (!result.ok) {
        return NextResponse.json({ ok: false, reason: result.reason, error: result.error }, { status: HTTP_UPSTREAM_FAILED });
      }
      return NextResponse.json({ ok: true, installedNow: result.installedNow ?? false, message: it("admin.activitySent") });
    }
    case "meeting": {
      const probe = {
        id: "projector-test",
        name: "Test PROJECTOR",
        approach: "classic",
      } as Project;
      try {
        const meeting = await createTeamsMeeting(
          probe,
          {
            kind: "status",
            subject: "PROJECTOR — réunion de test (supprimée automatiquement)",
            start: tomorrowAt(7),
            durationMinutes: 15,
            agenda: "Test technique de l'intégration Teams : cet événement est supprimé immédiatement.",
            attendees: [],
          },
          actor,
        );
        let deleted = false;
        let deleteError: string | undefined;
        try {
          await cancelTeamsMeeting(meeting);
          deleted = true;
        } catch (error) {
          deleteError = describeError(error);
        }
        return NextResponse.json({
          ok: true,
          organizer: meeting.organizerUpn,
          eventCreated: Boolean(meeting.eventId),
          joinUrl: Boolean(meeting.joinUrl),
          deleted,
          deleteError,
        });
      } catch (error) {
        return graphFailure(error);
      }
    }
    case "discoverCatalog": {
      try {
        const found = await discoverCatalogId(actor.entraOid);
        if (!found) {
          return NextResponse.json({ ok: false, found: false, message: it("admin.catalogNotFound") });
        }
        await updateIntegrationSettings((current) => {
          current.teamsAppCatalogId = found.catalogId;
        });
        return NextResponse.json({
          ok: true,
          found: true,
          catalogId: found.catalogId,
          message: it("admin.catalogFound", { id: found.catalogId, source: found.source }),
        });
      } catch (error) {
        return graphFailure(error);
      }
    }
    case "installAll": {
      const catalogId = settings.teamsAppCatalogId ?? getTeamsAppCatalogIdFromEnv();
      if (!catalogId) return jsonError(it("admin.catalogUnknown"), 400);
      const report = await installForAllUsers(await listUsers(), catalogId);
      const failures = report.failed.map((item) => `${item.name} : ${item.error}`).join(" ; ");
      return NextResponse.json({
        ok: report.failed.length === 0,
        report,
        message:
          it("admin.installAllResult", {
            installed: report.installed.length,
            already: report.already.length,
            failed: report.failed.length,
          }) + (failures ? ` — ${failures}` : ""),
      });
    }
    default: {
      const exhaustive: never = action;
      return jsonError(String(exhaustive), 400);
    }
  }
}
