import { NextResponse } from "next/server";
import { bearerToken } from "@/lib/integrations/jwt";
import { authenticateBotRequest, BotAuthError } from "@/lib/teams/bot/auth";
import { handleActivity } from "@/lib/teams/bot/handler";
import type { IncomingActivity } from "@/lib/teams/bot/types";

/** Point de terminaison de messagerie Bot Framework (bot Teams PROJECTOR). */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 256 * 1024;

function isActivity(value: unknown): value is IncomingActivity {
  if (!value || typeof value !== "object") return false;
  const activity = value as Partial<IncomingActivity>;
  return (
    typeof activity.type === "string" &&
    typeof activity.channelId === "string" &&
    typeof activity.serviceUrl === "string" &&
    typeof activity.conversation?.id === "string" &&
    typeof activity.from?.id === "string" &&
    typeof activity.recipient?.id === "string"
  );
}

export async function POST(request: Request) {
  const token = bearerToken(request);
  if (!token) {
    return NextResponse.json({ error: "Authentification requise." }, { status: 401 });
  }

  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (declaredLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Activité trop volumineuse." }, { status: 413 });
  }
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Activité trop volumineuse." }, { status: 413 });
  }
  let activity: unknown;
  try {
    activity = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Activité illisible." }, { status: 400 });
  }
  if (!isActivity(activity)) {
    return NextResponse.json({ error: "Activité invalide." }, { status: 400 });
  }

  let auth;
  try {
    auth = await authenticateBotRequest(token, activity);
  } catch (error) {
    if (error instanceof BotAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Authentification impossible." }, { status: 401 });
  }

  const result = await handleActivity(activity, auth);
  if (result.body === undefined) return new NextResponse(null, { status: result.status });
  return NextResponse.json(result.body, { status: result.status });
}

export function GET() {
  return NextResponse.json({ error: "Méthode non autorisée." }, { status: 405, headers: { Allow: "POST" } });
}
