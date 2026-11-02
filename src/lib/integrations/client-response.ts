/**
 * Lecture d'une réponse d'API côté navigateur sans perdre le message d'erreur : JSON `{ error }`,
 * ou statut HTTP + début du corps si un intermédiaire (proxy, Cloudflare) a remplacé la réponse.
 */
export async function readApiResponse<T extends Record<string, unknown>>(
  response: Response,
): Promise<{ ok: boolean; status: number; data: Partial<T>; error?: string }> {
  const text = await response.text().catch(() => "");
  let data: Partial<T> = {};
  let parsed = false;
  try {
    data = text ? (JSON.parse(text) as Partial<T>) : {};
    parsed = true;
  } catch {
    parsed = false;
  }
  if (response.ok) return { ok: true, status: response.status, data };

  const record = data as Record<string, unknown>;
  const message =
    typeof record.error === "string"
      ? record.error
      : record.error && typeof record.error === "object"
        ? JSON.stringify(record.error)
        : parsed
          ? JSON.stringify(record).slice(0, 300)
          : text.trim().slice(0, 300);
  const reason = typeof record.reason === "string" ? `${record.reason} — ` : "";
  return { ok: false, status: response.status, data, error: `${reason}${message || response.statusText}` };
}
