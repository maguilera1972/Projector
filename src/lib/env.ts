export function getPublicUrl(): string {
  return process.env.PROJECTOR_PUBLIC_URL ?? "http://localhost:3000";
}

export function getPublicHostname(): string | undefined {
  try {
    return new URL(getPublicUrl()).hostname;
  } catch {
    return undefined;
  }
}

export function useSecureCookies(): boolean {
  if (process.env.PROJECTOR_COOKIE_SECURE === "true") return true;
  if (process.env.PROJECTOR_COOKIE_SECURE === "false") return false;
  if (process.env.NODE_ENV === "production") return true;
  return getPublicUrl().startsWith("https://");
}
