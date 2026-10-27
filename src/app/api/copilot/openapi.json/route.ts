import { NextResponse } from "next/server";
import { absoluteUrl } from "@/lib/integrations/config";
import spec from "../../../../../teams-app/copilot/openapi.json";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Spécification OpenAPI publique (sans authentification) : plugin Copilot, ponts OpenAPI → MCP. */
export function GET() {
  return NextResponse.json(
    { ...spec, servers: [{ url: absoluteUrl("/api/copilot") }] },
    { headers: { "Cache-Control": "public, max-age=300", "Access-Control-Allow-Origin": "*" } },
  );
}
