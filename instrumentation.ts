/**
 * Next.js Instrumentation
 *
 * This file runs once when the server starts.
 * Used to initialize services like the token refresh scheduler.
 *
 * Note: Log cleanup is handled by launch.ts (runs every 6 hours in background).
 *
 * @see https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register() {
  // Only run on server
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Validate environment variables at startup (skip during build and test)
    if (
      process.env.NODE_ENV !== "test" &&
      process.env.NEXT_PHASE !== "phase-production-build"
    ) {
      const { envValidator } = await import("@/lib/env-validator");
      envValidator.validateAndPrint();
    }

    // Ensure data directory structure exists (oauth-tokens, metrics, errors)
    const { ensureDataStructure } = await import("@/lib/gswarm/storage/base");
    await ensureDataStructure();

    const { startRefreshService } = await import(
      "@/lib/gswarm/token-refresh-service"
    );

    // Start the token auto-refresh service
    startRefreshService();
  }
}
