/**
 * @file scripts/populate-token-projects.ts
 * @description Utility to populate projects array for existing tokens
 *
 * Usage:
 *   pnpm tsx scripts/populate-token-projects.ts
 *   pnpm tsx scripts/populate-token-projects.ts --email user@example.com
 */

import { PREFIX, consoleError, consoleLog } from "@/lib/console";
import { discoverProjects } from "@/lib/gswarm/oauth";
import {
  getValidTokens,
  loadToken,
  updateTokenProjects,
} from "@/lib/gswarm/storage/tokens";

/**
 * Populate projects for a single token
 */
async function populateProjectsForToken(
  email: string,
): Promise<{ success: boolean; projectCount: number }> {
  consoleLog(PREFIX.INFO, `Processing token for ${email}`);

  // Load token
  const loadResult = await loadToken(email);
  if (!loadResult.success) {
    consoleError(PREFIX.ERROR, `Failed to load token: ${loadResult.error}`);
    return { success: false, projectCount: 0 };
  }

  const token = loadResult.data;

  // Skip if already has projects
  if (token.projects && token.projects.length > 0) {
    consoleLog(
      PREFIX.INFO,
      `Token already has ${token.projects.length} projects, skipping`,
    );
    return { success: true, projectCount: token.projects.length };
  }

  // Discover projects
  consoleLog(PREFIX.INFO, "Discovering GCP projects...");
  const projects = await discoverProjects(token.access_token);

  if (projects.length === 0) {
    consoleError(
      PREFIX.ERROR,
      "No projects discovered (token may be expired or invalid)",
    );
    return { success: false, projectCount: 0 };
  }

  // Update token with projects
  const updateResult = await updateTokenProjects(email, projects);
  if (!updateResult.success) {
    consoleError(PREFIX.ERROR, `Failed to update token: ${updateResult.error}`);
    return { success: false, projectCount: 0 };
  }

  consoleLog(
    PREFIX.SUCCESS,
    `Successfully populated ${projects.length} projects`,
  );
  return { success: true, projectCount: projects.length };
}

/**
 * Main entry point
 */
async function main() {
  const args = process.argv.slice(2);
  const emailArg = args.find((arg) => arg.startsWith("--email="));
  const targetEmail = emailArg?.split("=")[1];

  if (targetEmail) {
    // Process single token
    consoleLog(PREFIX.INFO, `Populating projects for ${targetEmail}`);
    const result = await populateProjectsForToken(targetEmail);
    process.exit(result.success ? 0 : 1);
  }

  // Process all valid tokens
  consoleLog(PREFIX.INFO, "Loading all valid tokens...");
  const validTokensResult = await getValidTokens();

  if (!validTokensResult.success) {
    consoleError(
      PREFIX.ERROR,
      `Failed to load tokens: ${validTokensResult.error}`,
    );
    process.exit(1);
  }

  const tokens = validTokensResult.data;
  consoleLog(PREFIX.INFO, `Found ${tokens.length} valid tokens to process`);

  const results = await Promise.allSettled(
    tokens.map((token) => populateProjectsForToken(token.email)),
  );

  // Count successes and failures
  const successes = results.filter(
    (r) => r.status === "fulfilled" && r.value.success,
  ).length;
  const failures = results.length - successes;

  // Calculate total projects
  const totalProjects = results.reduce((sum, r) => {
    if (r.status === "fulfilled") {
      return sum + r.value.projectCount;
    }
    return sum;
  }, 0);

  consoleLog(PREFIX.INFO, "\nSummary:");
  consoleLog(PREFIX.INFO, `  Processed: ${tokens.length} tokens`);
  consoleLog(PREFIX.SUCCESS, `  Succeeded: ${successes}`);
  if (failures > 0) {
    consoleError(PREFIX.ERROR, `  Failed: ${failures}`);
  }
  consoleLog(PREFIX.INFO, `  Total projects discovered: ${totalProjects}`);

  process.exit(failures > 0 ? 1 : 0);
}

main();
