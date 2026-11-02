import { NextResponse } from "next/server";
import { TASK_ERROR_STATUS, TaskError, taskError, type TaskErrorCode } from "./errors";

export function taskErrorResponse(code: TaskErrorCode): NextResponse {
  const error = taskError(code);
  return NextResponse.json({ error: error.message, code }, { status: TASK_ERROR_STATUS[code] ?? 400 });
}

/** Convertit une exception (TaskError, TimeTrackingError ou Error) en réponse JSON cohérente. */
export function taskExceptionResponse(error: unknown, fallback: string): NextResponse {
  if (error instanceof TaskError) {
    return NextResponse.json(
      { error: error.message, code: error.code, ...(error.details ?? {}) },
      { status: TASK_ERROR_STATUS[error.code] ?? 400 },
    );
  }
  const code = (error as { code?: unknown } | null)?.code;
  const message = error instanceof Error ? error.message : fallback;
  return NextResponse.json(
    { error: message, ...(typeof code === "string" ? { code } : {}) },
    { status: 400 },
  );
}
