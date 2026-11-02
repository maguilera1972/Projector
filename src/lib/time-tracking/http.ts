import { NextResponse } from "next/server";
import { TimeTrackingError, timeTrackingError, type TimeTrackingErrorCode } from "./rules";

const STATUS_BY_CODE: Partial<Record<TimeTrackingErrorCode, number>> = {
  unauthenticated: 401,
  forbidden: 403,
  taskNotFound: 404,
  entryNotFound: 404,
  entryDeleted: 409,
};

export function timeError(code: TimeTrackingErrorCode): NextResponse {
  const error = timeTrackingError(code);
  return NextResponse.json({ error: error.message, code }, { status: STATUS_BY_CODE[code] ?? 400 });
}

export function timeErrorFromException(error: unknown, fallback = "Opération impossible."): NextResponse {
  if (error instanceof TimeTrackingError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: STATUS_BY_CODE[error.code] ?? 400 },
    );
  }
  const message = error instanceof Error ? error.message : fallback;
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function readJsonObject(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = (await request.json()) as unknown;
    if (body && typeof body === "object" && !Array.isArray(body)) return body as Record<string, unknown>;
  } catch {
    /* corps invalide */
  }
  throw timeTrackingError("invalidRequest");
}

export function optionalString(body: Record<string, unknown>, key: string): string | undefined {
  const value = body[key];
  return typeof value === "string" ? value : undefined;
}
