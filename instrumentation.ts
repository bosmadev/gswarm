/**
 * Next.js Instrumentation
 *
 * This file runs once when the server starts.
 * Used to initialize services like the token refresh scheduler.
 *
 * @see https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register() {
  // Only run on server
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startRefreshService } = await import(
      "@/lib/gswarm/token-refresh-service"
    );

    // Start the token auto-refresh service
    startRefreshService();
  }
}
