export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // Import dynamique imposé par Next.js : le module (base JSON, fs) ne doit pas entrer dans le bundle Edge.
  const { startJobsInterval } = await import("@/lib/integrations/jobs");
  startJobsInterval();
}
