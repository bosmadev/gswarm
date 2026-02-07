#!/usr/bin/env node
/**
 * GSwarm CLI
 *
 * Command-line interface for managing GSwarm accounts, projects, and testing.
 * Run with: pnpm gswarm [command] (dev) or node lib/cli.ts [command] (VM)
 *
 * Commands:
 *   (no args)            - Interactive dashboard
 *   status               - Show status summary
 *   projects             - List all projects
 *   projects list        - List all projects across all accounts
 *   test                 - Test all enabled projects
 *   test <email>         - Test specific account's projects
 *   rotation             - Test project rotation
 *   auth add <email>     - Add single account via OAuth
 *   auth batch <emails>  - Add multiple accounts sequentially
 *   auth verify <email>  - Get verification URL for account
 *   auth list            - List all authenticated accounts
 *   auth test <email>    - Test API access for account
 *   help                 - Show this help
 */

import {
  type Interface,
  createInterface as createReadlineInterface,
} from "node:readline";
import { PREFIX, consoleClear, consoleError, consoleLog } from "../console.ts";
import { gswarmClient } from "./client.ts";
import { GSWARM_CONFIG } from "./executor.ts";
import {
  getAllGcpProjects,
  getEnabledGcpProjects,
  groupProjectsByOwner,
  invalidateProjectsCache,
} from "./projects.ts";
import {
  deleteToken,
  invalidateTokenCache,
  isTokenExpired,
  loadAllTokens,
} from "./storage/tokens.ts";
import type { GcpProjectInfo, StoredToken, TokenData } from "./types.ts";
import { createServer } from "node:http";
import type { Server } from "node:http";
import {
  generateAuthUrl,
  exchangeCodeForTokens,
  getTokenEmailFromData,
  discoverProjects,
  isValidationRequired,
  extractValidationUrl,
  refreshAccessToken,
  OAUTH_CONFIG,
} from "./oauth.ts";
import {
  saveToken as saveTokenStorage,
  invalidateTokenCache as invalidateTokenCacheStorage,
} from "./storage/tokens.ts";

// =============================================================================
// ANSI Colors
// =============================================================================

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const ORANGE = "\x1b[38;5;208m";

// =============================================================================
// UI Helpers
// =============================================================================

function printHeader(title: string): void {
  const width = 60;
  const border = "═".repeat(width);
  const padding = Math.max(0, Math.floor((width - title.length - 2) / 2));
  const paddedTitle = " ".repeat(padding) + title;

  consoleLog(PREFIX.GSWARM, "");
  consoleLog(PREFIX.GSWARM, `${ORANGE}╔${border}╗${RESET}`);
  consoleLog(
    PREFIX.GSWARM,
    `${ORANGE}║${RESET}${BOLD}${paddedTitle.padEnd(width)}${RESET}${ORANGE}║${RESET}`,
  );
  consoleLog(PREFIX.GSWARM, `${ORANGE}╚${border}╝${RESET}`);
  consoleLog(PREFIX.GSWARM, "");
}

function printSeparator(): void {
  consoleLog(PREFIX.GSWARM, `${DIM}${"─".repeat(60)}${RESET}`);
}

function createInterface(): Interface {
  return createReadlineInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

function prompt(rl: Interface, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(`${PREFIX.GSWARM} ${question}`, (answer) => {
      resolve(answer.trim());
    });
  });
}

// =============================================================================
// Account Status
// =============================================================================

interface AccountInfo {
  email: string;
  valid: boolean;
  projectCount: number;
  enabledCount: number;
  expiresAt?: number;
}

interface StatusSummary {
  accounts: AccountInfo[];
  totalProjects: number;
  totalEnabled: number;
}

async function getAccountStatus(): Promise<StatusSummary> {
  const tokensResult = await loadAllTokens();
  const tokens = tokensResult.success
    ? Array.from(tokensResult.data.values())
    : [];

  const projects = await getAllGcpProjects();
  const byOwner = groupProjectsByOwner(projects);

  const accounts: AccountInfo[] = [];

  for (const token of tokens) {
    const ownerProjects = byOwner[token.email] || [];
    const enabledProjects = ownerProjects.filter((p) => p.api_enabled);

    accounts.push({
      email: token.email,
      valid: !token.is_invalid && !isTokenExpired(token),
      projectCount: ownerProjects.length,
      enabledCount: enabledProjects.length,
      expiresAt: token.expiry_timestamp,
    });
  }

  const totalProjects = projects.length;
  const totalEnabled = projects.filter((p) => p.api_enabled).length;

  return { accounts, totalProjects, totalEnabled };
}

// =============================================================================
// Account Management
// =============================================================================

// =============================================================================
// OAuth Flow Helpers
// =============================================================================

/**
 * Start a temporary HTTP server for OAuth callback
 * Returns the server instance and the dynamically assigned port
 */
function startOAuthServer(): Promise<{
  server: Server;
  port: number;
  codePromise: Promise<string>;
}> {
  return new Promise((resolve, reject) => {
    let resolveCode: (code: string) => void;
    const codePromise = new Promise<string>((res) => {
      resolveCode = res;
    });

    const server = createServer((req, res) => {
      const url = new URL(req.url || "", `http://localhost`);

      if (url.pathname === "/callback") {
        const code = url.searchParams.get("code");
        const error = url.searchParams.get("error");

        if (error) {
          res.writeHead(400, { "Content-Type": "text/html" });
          res.end(
            `<html><body><h1>Authentication Failed</h1><p>${error}</p><p>You can close this window.</p></body></html>`,
          );
          reject(new Error(`OAuth error: ${error}`));
          return;
        }

        if (code) {
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(
            '<html><body><h1>Authentication Successful!</h1><p>You can close this window and return to the CLI.</p></body></html>',
          );
          resolveCode(code);
        } else {
          res.writeHead(400, { "Content-Type": "text/html" });
          res.end(
            "<html><body><h1>Invalid Request</h1><p>No authorization code received.</p></body></html>",
          );
          reject(new Error("No authorization code received"));
        }
      } else {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Not Found");
      }
    });

    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address && typeof address === "object") {
        resolve({ server, port: address.port, codePromise });
      } else {
        reject(new Error("Failed to get server port"));
      }
    });

    server.on("error", reject);
  });
}

/**
 * Test API access and handle VALIDATION_REQUIRED
 */
async function testApiAccess(
  token: TokenData,
  projectId: string,
): Promise<{
  success: boolean;
  validationUrl?: string;
  error?: string;
}> {
  try {
    const response = await fetch(
      "https://cloudcode-pa.googleapis.com/v1internal:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token.access_token}`,
        },
        body: JSON.stringify({
          model: "models/gemini-2.0-flash",
          request: {
            contents: [{ role: "user", parts: [{ text: "hi" }] }],
            generationConfig: {
              maxOutputTokens: 10,
              temperature: 0,
            },
          },
          project: projectId,
        }),
      },
    );

    if (response.ok) {
      return { success: true };
    }

    const errorData = await response.json();
    if (isValidationRequired(errorData)) {
      const validationUrl = extractValidationUrl(errorData);
      return { success: false, validationUrl: validationUrl ?? undefined };
    }

    return {
      success: false,
      error: `HTTP ${response.status}: ${JSON.stringify(errorData)}`,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Authenticate a single account via OAuth
 */
async function authenticateAccount(
  email: string,
): Promise<{ success: boolean; error?: string }> {
  consoleLog(PREFIX.GSWARM, `\n${BOLD}Authenticating ${email}...${RESET}\n`);

  try {
    // Start OAuth server on dynamic port
    consoleLog(PREFIX.GSWARM, "Starting OAuth server...");
    const { server, port, codePromise } = await startOAuthServer();
    const redirectUri = `http://127.0.0.1:${port}/callback`;

    // Generate auth URL with login_hint
    const authUrl = generateAuthUrl(redirectUri);
    const authUrlWithHint = new URL(authUrl);
    authUrlWithHint.searchParams.set("login_hint", email);

    consoleLog(PREFIX.GSWARM, `${DIM}OAuth server running on port ${port}${RESET}`);
    consoleLog(PREFIX.GSWARM, "");
    consoleLog(
      PREFIX.GSWARM,
      `${ORANGE}${BOLD}Please visit this URL in an incognito browser:${RESET}`,
    );
    consoleLog(PREFIX.GSWARM, "");
    consoleLog(PREFIX.GSWARM, `  ${CYAN}${authUrlWithHint.toString()}${RESET}`);
    consoleLog(PREFIX.GSWARM, "");
    consoleLog(PREFIX.GSWARM, "Waiting for authentication...");

    // Wait for callback with timeout
    const code = await Promise.race([
      codePromise,
      new Promise<string>((_, reject) =>
        setTimeout(() => reject(new Error("Authentication timeout")), 300000),
      ),
    ]);

    server.close();
    consoleLog(PREFIX.GSWARM, `${GREEN}✓${RESET} Authorization code received`);

    // Exchange code for tokens
    consoleLog(PREFIX.GSWARM, "Exchanging code for tokens...");
    const tokenData = await exchangeCodeForTokens(code, redirectUri);
    if (!tokenData) {
      return { success: false, error: "Failed to exchange code for tokens" };
    }
    consoleLog(PREFIX.GSWARM, `${GREEN}✓${RESET} Tokens obtained`);

    // Get email from token
    consoleLog(PREFIX.GSWARM, "Verifying email...");
    const tokenEmail = await getTokenEmailFromData(tokenData);
    if (!tokenEmail) {
      return { success: false, error: "Failed to get email from token" };
    }

    if (tokenEmail.toLowerCase() !== email.toLowerCase()) {
      return {
        success: false,
        error: `Email mismatch: expected ${email}, got ${tokenEmail}`,
      };
    }
    consoleLog(PREFIX.GSWARM, `${GREEN}✓${RESET} Email verified: ${tokenEmail}`);

    // Discover projects
    consoleLog(PREFIX.GSWARM, "Discovering GCP projects...");
    const projects = await discoverProjects(tokenData.access_token);
    consoleLog(
      PREFIX.GSWARM,
      `${GREEN}✓${RESET} Found ${projects.length} projects`,
    );

    // Test API access with first project
    if (projects.length > 0) {
      consoleLog(PREFIX.GSWARM, "Testing API access...");
      const testResult = await testApiAccess(tokenData, projects[0]);

      if (!testResult.success && testResult.validationUrl) {
        consoleLog(PREFIX.GSWARM, "");
        consoleLog(
          PREFIX.GSWARM,
          `${YELLOW}${BOLD}⚠ VALIDATION REQUIRED${RESET}`,
        );
        consoleLog(PREFIX.GSWARM, "");
        consoleLog(
          PREFIX.GSWARM,
          "This account needs one-time verification. Please visit:",
        );
        consoleLog(PREFIX.GSWARM, "");
        consoleLog(PREFIX.GSWARM, `  ${CYAN}${testResult.validationUrl}${RESET}`);
        consoleLog(PREFIX.GSWARM, "");
        consoleLog(
          PREFIX.GSWARM,
          "After verification, use 'pnpm gswarm auth verify <email>' to re-test.",
        );
      } else if (testResult.success) {
        consoleLog(PREFIX.GSWARM, `${GREEN}✓${RESET} API access verified`);
      } else {
        consoleLog(
          PREFIX.GSWARM,
          `${YELLOW}⚠${RESET} API test failed: ${testResult.error}`,
        );
      }
    }

    // Save token
    consoleLog(PREFIX.GSWARM, "Saving token...");
    const storedToken: StoredToken = {
      ...tokenData,
      email: tokenEmail,
      created_at: Math.floor(Date.now() / 1000),
      projects,
      client: "gswarm-cli",
    };

    const saveResult = await saveTokenStorage(tokenEmail, storedToken, false);
    if (!saveResult.success) {
      return { success: false, error: `Failed to save token: ${saveResult.error}` };
    }

    invalidateTokenCacheStorage();
    invalidateProjectsCache();
    consoleLog(PREFIX.GSWARM, `${GREEN}✓${RESET} Token saved`);
    consoleLog(PREFIX.GSWARM, "");
    consoleLog(
      PREFIX.GSWARM,
      `${GREEN}${BOLD}✓ Successfully authenticated ${email}${RESET}`,
    );

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function removeAccount(email: string): Promise<boolean> {
  const result = await deleteToken(email);
  if (result.success) {
    invalidateTokenCache();
    invalidateProjectsCache();
    return true;
  }
  return false;
}

// =============================================================================
// Project Listing
// =============================================================================

async function listProjects(): Promise<void> {
  printHeader("GSWARM PROJECTS");

  const projects = await getAllGcpProjects(true);
  const byOwner = groupProjectsByOwner(projects);

  if (projects.length === 0) {
    consoleLog(
      PREFIX.GSWARM,
      "No projects found. Please add an account first.",
    );
    consoleLog(PREFIX.GSWARM, "");
    return;
  }

  for (const [owner, ownerProjects] of Object.entries(byOwner)) {
    const enabledCount = ownerProjects.filter((p) => p.api_enabled).length;
    consoleLog(
      PREFIX.GSWARM,
      `${CYAN}${owner}${RESET} (${enabledCount}/${ownerProjects.length} enabled)`,
    );

    for (const project of ownerProjects) {
      const status = project.api_enabled
        ? `${GREEN}[OK]${RESET}`
        : `${RED}[X]${RESET}`;
      consoleLog(PREFIX.GSWARM, `  ${status} ${project.project_id}`);
    }
    consoleLog(PREFIX.GSWARM, "");
  }

  const enabled = projects.filter((p) => p.api_enabled).length;
  printSeparator();
  consoleLog(
    PREFIX.GSWARM,
    `Total: ${projects.length} projects | ${GREEN}${enabled} API enabled${RESET}`,
  );
  consoleLog(PREFIX.GSWARM, "");
}

// =============================================================================
// Status Display
// =============================================================================

async function showStatus(): Promise<void> {
  printHeader("GSWARM STATUS");

  const status = await getAccountStatus();
  const clientStatus = await gswarmClient.getStatus();

  // Account status
  consoleLog(
    PREFIX.GSWARM,
    `${BOLD}Accounts (${status.accounts.length}):${RESET}`,
  );

  if (status.accounts.length === 0) {
    consoleLog(PREFIX.GSWARM, `  ${DIM}No accounts configured${RESET}`);
  } else {
    for (const account of status.accounts) {
      const validStr = account.valid
        ? `${GREEN}Valid${RESET}`
        : `${RED}Expired${RESET}`;
      consoleLog(
        PREFIX.GSWARM,
        `  ${account.email} [${validStr}] - ${account.enabledCount}/${account.projectCount} projects`,
      );
    }
  }

  consoleLog(PREFIX.GSWARM, "");

  // Service status
  consoleLog(PREFIX.GSWARM, `${BOLD}Service Status:${RESET}`);
  const statusColor =
    clientStatus.status === "connected"
      ? GREEN
      : clientStatus.status === "disconnected"
        ? RED
        : YELLOW;
  consoleLog(
    PREFIX.GSWARM,
    `  Status: ${statusColor}${clientStatus.status}${RESET}`,
  );
  consoleLog(PREFIX.GSWARM, `  Model: ${clientStatus.model}`);
  consoleLog(
    PREFIX.GSWARM,
    `  Available: ${clientStatus.availableProjects}/${clientStatus.totalProjects}`,
  );

  if (clientStatus.cooldownProjects > 0) {
    consoleLog(
      PREFIX.GSWARM,
      `  ${YELLOW}Cooldown: ${clientStatus.cooldownProjects} projects${RESET}`,
    );
  }

  consoleLog(PREFIX.GSWARM, "");
}

// =============================================================================
// Project Testing
// =============================================================================

async function testProject(
  _project: GcpProjectInfo,
  token: StoredToken,
): Promise<{ success: boolean; latencyMs: number; error?: string }> {
  const startTime = Date.now();

  try {
    const response = await fetch(
      "https://cloudcode-pa.googleapis.com/v1internal:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token.access_token}`,
        },
        body: JSON.stringify({
          model: GSWARM_CONFIG.model,
          contents: [{ role: "user", parts: [{ text: "Say hi" }] }],
          generationConfig: {
            maxOutputTokens: 10,
            temperature: 0,
          },
        }),
      },
    );

    const latencyMs = Date.now() - startTime;

    if (response.ok) {
      return { success: true, latencyMs };
    }

    const errorText = await response.text();
    return {
      success: false,
      latencyMs,
      error: `HTTP ${response.status}: ${errorText.slice(0, 100)}`,
    };
  } catch (error) {
    return {
      success: false,
      latencyMs: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function testAllProjects(): Promise<void> {
  printHeader("GSWARM PROJECT TESTS");

  const projects = await getEnabledGcpProjects();
  const tokensResult = await loadAllTokens();
  const tokens = tokensResult.success ? tokensResult.data : new Map();

  if (projects.length === 0) {
    consoleLog(PREFIX.GSWARM, "No enabled projects to test.");
    consoleLog(PREFIX.GSWARM, "");
    return;
  }

  consoleLog(PREFIX.GSWARM, `Testing ${projects.length} enabled projects...\n`);

  let successCount = 0;
  let failCount = 0;
  let totalLatency = 0;

  for (const project of projects) {
    const token = tokens.get(project.owner_email);
    if (!token) {
      consoleLog(
        PREFIX.GSWARM,
        `  ${RED}[X]${RESET} ${project.project_id} - No token for ${project.owner_email}`,
      );
      failCount++;
      continue;
    }

    const result = await testProject(project, token);

    if (result.success) {
      consoleLog(
        PREFIX.GSWARM,
        `  ${GREEN}[OK]${RESET} ${project.project_id} (${result.latencyMs}ms)`,
      );
      successCount++;
      totalLatency += result.latencyMs;
    } else {
      consoleLog(
        PREFIX.GSWARM,
        `  ${RED}[X]${RESET} ${project.project_id} - ${result.error}`,
      );
      failCount++;
    }

    // Brief delay between tests
    await new Promise((r) => setTimeout(r, 200));
  }

  consoleLog(PREFIX.GSWARM, "");
  printSeparator();

  const avgLatency =
    successCount > 0 ? Math.round(totalLatency / successCount) : 0;
  consoleLog(
    PREFIX.GSWARM,
    `Results: ${GREEN}${successCount} passed${RESET}, ${RED}${failCount} failed${RESET}`,
  );
  if (successCount > 0) {
    consoleLog(PREFIX.GSWARM, `Average latency: ${avgLatency}ms`);
  }
  consoleLog(PREFIX.GSWARM, "");
}

// =============================================================================
// Rotation Test
// =============================================================================

async function testRotation(): Promise<void> {
  printHeader("GSWARM ROTATION TEST");

  const projects = await getEnabledGcpProjects();

  if (projects.length === 0) {
    consoleLog(PREFIX.GSWARM, "No enabled projects to test rotation.");
    consoleLog(PREFIX.GSWARM, "");
    return;
  }

  const rotationCount = Math.min(projects.length, 5);
  consoleLog(
    PREFIX.GSWARM,
    `Testing rotation across ${rotationCount} requests...\n`,
  );

  const usedProjects = new Set<string>();

  for (let i = 0; i < rotationCount; i++) {
    try {
      const result = await gswarmClient.generateContent(
        `Test request ${i + 1}`,
        {
          maxOutputTokens: 10,
          temperature: 0,
        },
      );

      usedProjects.add(result.projectId);
      consoleLog(
        PREFIX.GSWARM,
        `  Request ${i + 1}: ${GREEN}OK${RESET} (${result.projectId}, ${result.latencyMs}ms)`,
      );
    } catch (error) {
      consoleLog(
        PREFIX.GSWARM,
        `  Request ${i + 1}: ${RED}FAIL${RESET} (${error instanceof Error ? error.message : String(error)})`,
      );
    }

    await new Promise((r) => setTimeout(r, 300));
  }

  consoleLog(PREFIX.GSWARM, "");
  printSeparator();
  consoleLog(PREFIX.GSWARM, `Unique projects used: ${usedProjects.size}`);
  consoleLog(PREFIX.GSWARM, `Projects: ${Array.from(usedProjects).join(", ")}`);
  consoleLog(PREFIX.GSWARM, "");
}

// =============================================================================
// Auth Commands
// =============================================================================

async function authAdd(email: string): Promise<void> {
  if (!email) {
    consoleError(PREFIX.ERROR, "Email is required");
    consoleLog(PREFIX.GSWARM, "Usage: pnpm gswarm auth add <email>");
    process.exit(1);
  }

  const result = await authenticateAccount(email);
  if (!result.success) {
    consoleError(PREFIX.ERROR, `Authentication failed: ${result.error}`);
    process.exit(1);
  }
}

async function authBatch(emails: string[]): Promise<void> {
  if (emails.length === 0) {
    consoleError(PREFIX.ERROR, "At least one email is required");
    consoleLog(
      PREFIX.GSWARM,
      "Usage: pnpm gswarm auth batch <email1,email2,...>",
    );
    process.exit(1);
  }

  printHeader("BATCH ACCOUNT ONBOARDING");

  consoleLog(PREFIX.GSWARM, `Authenticating ${emails.length} accounts...\n`);
  printSeparator();

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < emails.length; i++) {
    const email = emails[i].trim();
    consoleLog(
      PREFIX.GSWARM,
      `\n${BOLD}[${i + 1}/${emails.length}] Processing ${email}...${RESET}`,
    );

    const result = await authenticateAccount(email);
    if (result.success) {
      successCount++;
    } else {
      failCount++;
      consoleError(PREFIX.ERROR, `Failed: ${result.error}`);
    }

    // Brief delay between accounts
    if (i < emails.length - 1) {
      consoleLog(PREFIX.GSWARM, "\nWaiting before next account...");
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  consoleLog(PREFIX.GSWARM, "");
  printSeparator();
  consoleLog(
    PREFIX.GSWARM,
    `\n${BOLD}Batch Complete:${RESET} ${GREEN}${successCount} succeeded${RESET}, ${RED}${failCount} failed${RESET}\n`,
  );
}

async function authVerify(email: string): Promise<void> {
  if (!email) {
    consoleError(PREFIX.ERROR, "Email is required");
    consoleLog(PREFIX.GSWARM, "Usage: pnpm gswarm auth verify <email>");
    process.exit(1);
  }

  printHeader("VERIFY ACCOUNT");

  const tokensResult = await loadAllTokens();
  if (!tokensResult.success) {
    consoleError(PREFIX.ERROR, "Failed to load tokens");
    process.exit(1);
  }

  const token = tokensResult.data.get(email.toLowerCase());
  if (!token) {
    consoleError(PREFIX.ERROR, `No token found for ${email}`);
    consoleLog(PREFIX.GSWARM, "Use 'pnpm gswarm auth add <email>' to authenticate first.");
    process.exit(1);
  }

  // Refresh token if needed
  let currentToken = token;
  if (!currentToken.access_token || !currentToken.expiry_timestamp || Date.now() / 1000 >= currentToken.expiry_timestamp - 60) {
    consoleLog(PREFIX.GSWARM, "Refreshing access token...");
    const refreshed = await refreshAccessToken(currentToken);
    if (!refreshed) {
      consoleError(PREFIX.ERROR, "Failed to refresh token");
      process.exit(1);
    }
    currentToken = { ...token, ...refreshed };
    await saveTokenStorage(email.toLowerCase(), currentToken, true);
    consoleLog(PREFIX.GSWARM, `${GREEN}✓${RESET} Token refreshed`);
  }

  if (!token.projects || token.projects.length === 0) {
    consoleError(PREFIX.ERROR, "No projects found for this account");
    process.exit(1);
  }

  consoleLog(PREFIX.GSWARM, `Testing API access for ${email}...`);
  consoleLog(PREFIX.GSWARM, `Projects: ${token.projects.length}`);
  consoleLog(PREFIX.GSWARM, "");

  const testResult = await testApiAccess(currentToken, token.projects[0]);

  if (testResult.success) {
    consoleLog(PREFIX.GSWARM, `${GREEN}${BOLD}✓ API Access Verified${RESET}`);
    consoleLog(PREFIX.GSWARM, "Account is ready to use.");
  } else if (testResult.validationUrl) {
    consoleLog(PREFIX.GSWARM, `${YELLOW}${BOLD}⚠ VALIDATION REQUIRED${RESET}`);
    consoleLog(PREFIX.GSWARM, "");
    consoleLog(PREFIX.GSWARM, "Please visit this URL to verify your account:");
    consoleLog(PREFIX.GSWARM, "");
    consoleLog(PREFIX.GSWARM, `  ${CYAN}${testResult.validationUrl}${RESET}`);
    consoleLog(PREFIX.GSWARM, "");
    consoleLog(
      PREFIX.GSWARM,
      "After verification, run this command again to confirm.",
    );
  } else {
    consoleError(PREFIX.ERROR, `API test failed: ${testResult.error}`);
    process.exit(1);
  }

  consoleLog(PREFIX.GSWARM, "");
}

async function authList(): Promise<void> {
  printHeader("AUTHENTICATED ACCOUNTS");

  const tokensResult = await loadAllTokens();
  if (!tokensResult.success) {
    consoleError(PREFIX.ERROR, "Failed to load tokens");
    process.exit(1);
  }

  const tokens = Array.from(tokensResult.data.values());

  if (tokens.length === 0) {
    consoleLog(PREFIX.GSWARM, "No authenticated accounts.");
    consoleLog(PREFIX.GSWARM, "");
    consoleLog(PREFIX.GSWARM, "Use 'pnpm gswarm auth add <email>' to add an account.");
    consoleLog(PREFIX.GSWARM, "");
    return;
  }

  for (const token of tokens) {
    const isExpired = !token.expiry_timestamp || Date.now() / 1000 >= token.expiry_timestamp - 60;
    const status = isExpired ? `${RED}Expired${RESET}` : `${GREEN}Valid${RESET}`;
    const projectCount = token.projects?.length || 0;

    consoleLog(PREFIX.GSWARM, `${CYAN}${token.email}${RESET}`);
    consoleLog(PREFIX.GSWARM, `  Status: ${status}`);
    consoleLog(PREFIX.GSWARM, `  Projects: ${projectCount}`);
    consoleLog(PREFIX.GSWARM, `  Client: ${token.client || "unknown"}`);

    if (token.expiry_timestamp) {
      const expiresAt = new Date(token.expiry_timestamp * 1000);
      consoleLog(
        PREFIX.GSWARM,
        `  Expires: ${expiresAt.toLocaleString()}`,
      );
    }

    if (token.is_invalid) {
      consoleLog(
        PREFIX.GSWARM,
        `  ${RED}Invalid: ${token.invalid_reason || "unknown"}${RESET}`,
      );
    }

    consoleLog(PREFIX.GSWARM, "");
  }

  printSeparator();
  consoleLog(PREFIX.GSWARM, `Total: ${tokens.length} accounts`);
  consoleLog(PREFIX.GSWARM, "");
}

async function authTest(email: string): Promise<void> {
  if (!email) {
    consoleError(PREFIX.ERROR, "Email is required");
    consoleLog(PREFIX.GSWARM, "Usage: pnpm gswarm auth test <email>");
    process.exit(1);
  }

  printHeader(`TEST ACCOUNT: ${email}`);

  const tokensResult = await loadAllTokens();
  if (!tokensResult.success) {
    consoleError(PREFIX.ERROR, "Failed to load tokens");
    process.exit(1);
  }

  const token = tokensResult.data.get(email.toLowerCase());
  if (!token) {
    consoleError(PREFIX.ERROR, `No token found for ${email}`);
    process.exit(1);
  }

  if (!token.projects || token.projects.length === 0) {
    consoleError(PREFIX.ERROR, "No projects found for this account");
    process.exit(1);
  }

  consoleLog(
    PREFIX.GSWARM,
    `Testing ${token.projects.length} projects for ${email}...\n`,
  );

  let successCount = 0;
  let failCount = 0;

  for (const projectId of token.projects) {
    const result = await testApiAccess(token, projectId);

    if (result.success) {
      consoleLog(PREFIX.GSWARM, `  ${GREEN}[OK]${RESET} ${projectId}`);
      successCount++;
    } else if (result.validationUrl) {
      consoleLog(
        PREFIX.GSWARM,
        `  ${YELLOW}[VERIFY]${RESET} ${projectId} - Validation required`,
      );
      failCount++;
    } else {
      consoleLog(
        PREFIX.GSWARM,
        `  ${RED}[X]${RESET} ${projectId} - ${result.error}`,
      );
      failCount++;
    }

    await new Promise((r) => setTimeout(r, 200));
  }

  consoleLog(PREFIX.GSWARM, "");
  printSeparator();
  consoleLog(
    PREFIX.GSWARM,
    `Results: ${GREEN}${successCount} passed${RESET}, ${RED}${failCount} failed${RESET}`,
  );
  consoleLog(PREFIX.GSWARM, "");
}

async function projectsList(): Promise<void> {
  printHeader("ALL PROJECTS");

  const tokensResult = await loadAllTokens();
  if (!tokensResult.success) {
    consoleError(PREFIX.ERROR, "Failed to load tokens");
    process.exit(1);
  }

  const tokens = Array.from(tokensResult.data.values());
  let totalProjects = 0;

  for (const token of tokens) {
    if (!token.projects || token.projects.length === 0) {
      continue;
    }

    consoleLog(
      PREFIX.GSWARM,
      `${CYAN}${token.email}${RESET} (${token.projects.length} projects)`,
    );

    for (const projectId of token.projects) {
      consoleLog(PREFIX.GSWARM, `  ${projectId}`);
      totalProjects++;
    }

    consoleLog(PREFIX.GSWARM, "");
  }

  printSeparator();
  consoleLog(
    PREFIX.GSWARM,
    `Total: ${totalProjects} projects across ${tokens.length} accounts`,
  );
  consoleLog(PREFIX.GSWARM, "");
}

// =============================================================================
// Interactive Dashboard
// =============================================================================

async function interactiveDashboard(): Promise<void> {
  let rl = createInterface();

  while (true) {
    rl.close();
    rl = createInterface();

    consoleClear();
    printHeader("GSWARM DASHBOARD");

    const status = await getAccountStatus();

    // Account summary
    consoleLog(
      PREFIX.GSWARM,
      `${BOLD}Authenticated Accounts (${status.accounts.length}):${RESET}`,
    );

    if (status.accounts.length === 0) {
      consoleLog(
        PREFIX.GSWARM,
        `  ${DIM}[None] - Add account via dashboard: ${process.env.GLOBAL_URL || "http://localhost:3001"}${RESET}`,
      );
    } else {
      for (const account of status.accounts) {
        const statusStr = account.valid
          ? `${GREEN}Valid${RESET}`
          : `${RED}Expired${RESET}`;
        consoleLog(PREFIX.GSWARM, `  • ${account.email} [${statusStr}]`);
        consoleLog(
          PREFIX.GSWARM,
          `      Projects: ${account.projectCount} | API Enabled: ${account.enabledCount}`,
        );
      }
    }

    printSeparator();
    consoleLog(
      PREFIX.GSWARM,
      `Total Combined Pool: ${status.totalProjects} Projects | ${GREEN}${status.totalEnabled} Ready${RESET}`,
    );
    printSeparator();

    consoleLog(PREFIX.GSWARM, "");
    consoleLog(PREFIX.GSWARM, `${BOLD}Options:${RESET}`);
    consoleLog(PREFIX.GSWARM, "  [1] Remove Google Account");
    consoleLog(PREFIX.GSWARM, "  [2] List All Projects");
    consoleLog(PREFIX.GSWARM, "  [3] Test All Projects");
    consoleLog(PREFIX.GSWARM, "  [4] Refresh Projects Cache");
    consoleLog(PREFIX.GSWARM, "  [5] Test Rotation");
    consoleLog(PREFIX.GSWARM, "  [6] Show Status Summary");
    consoleLog(PREFIX.GSWARM, "");
    consoleLog(
      PREFIX.GSWARM,
      `  ${DIM}Add accounts via dashboard: ${process.env.GLOBAL_URL || "http://localhost:3001"}${RESET}`,
    );
    consoleLog(PREFIX.GSWARM, "");
    consoleLog(PREFIX.GSWARM, "  [0] Exit");

    const choice = await prompt(rl, "\nSelect > ");

    switch (choice) {
      case "1": {
        // Remove account
        if (status.accounts.length === 0) {
          consoleLog(PREFIX.GSWARM, "\nNo accounts to remove.");
        } else {
          consoleLog(PREFIX.GSWARM, "\nSelect account to remove:");
          for (let i = 0; i < status.accounts.length; i++) {
            consoleLog(
              PREFIX.GSWARM,
              `  [${i + 1}] ${status.accounts[i].email}`,
            );
          }
          const idx =
            Number.parseInt(
              await prompt(rl, `\nSelect [1-${status.accounts.length}]: `),
              10,
            ) - 1;

          if (idx >= 0 && idx < status.accounts.length) {
            const email = status.accounts[idx].email;
            const confirm = await prompt(rl, `Remove ${email}? (y/n): `);
            if (confirm.toLowerCase() === "y") {
              const success = await removeAccount(email);
              consoleLog(
                PREFIX.GSWARM,
                success
                  ? `\n${GREEN}✓${RESET} Removed ${email}`
                  : `\n${RED}✗${RESET} Failed to remove`,
              );
            }
          }
        }
        await prompt(rl, "\nPress Enter to continue...");
        break;
      }

      case "2":
        await listProjects();
        await prompt(rl, "Press Enter to continue...");
        break;

      case "3":
        await testAllProjects();
        await prompt(rl, "Press Enter to continue...");
        break;

      case "4":
        consoleLog(PREFIX.GSWARM, "\nRefreshing projects cache...");
        invalidateProjectsCache();
        invalidateTokenCache();
        await getAllGcpProjects(true);
        consoleLog(PREFIX.GSWARM, `${GREEN}✓${RESET} Cache refreshed`);
        await prompt(rl, "\nPress Enter to continue...");
        break;

      case "5":
        await testRotation();
        await prompt(rl, "Press Enter to continue...");
        break;

      case "6":
        await showStatus();
        await prompt(rl, "Press Enter to continue...");
        break;

      case "0":
      case "q":
      case "exit":
        rl.close();
        consoleLog(PREFIX.GSWARM, "\nGoodbye!\n");
        return process.exit(0);

      default:
        // Invalid option, just loop
        break;
    }
  }
}

// =============================================================================
// Help
// =============================================================================

function printHelp(): void {
  printHeader("GSWARM CLI HELP");

  consoleLog(PREFIX.GSWARM, `${BOLD}Usage:${RESET} pnpm gswarm [command]\n`);

  consoleLog(PREFIX.GSWARM, `${BOLD}Commands:${RESET}`);
  consoleLog(PREFIX.GSWARM, "  (no args)      Interactive dashboard");
  consoleLog(PREFIX.GSWARM, "  status         Show status summary");
  consoleLog(PREFIX.GSWARM, "  projects       List all projects");
  consoleLog(PREFIX.GSWARM, "  test           Test all enabled projects");
  consoleLog(PREFIX.GSWARM, "  test <email>   Test specific account's projects");
  consoleLog(PREFIX.GSWARM, "  rotation       Test project rotation");
  consoleLog(PREFIX.GSWARM, "  help           Show this help");
  consoleLog(PREFIX.GSWARM, "");

  consoleLog(PREFIX.GSWARM, `${BOLD}Auth Commands:${RESET}`);
  consoleLog(PREFIX.GSWARM, "  auth add <email>                Add single account via OAuth");
  consoleLog(PREFIX.GSWARM, "  auth batch <email1,email2,...>  Add multiple accounts sequentially");
  consoleLog(PREFIX.GSWARM, "  auth verify <email>             Get verification URL for account");
  consoleLog(PREFIX.GSWARM, "  auth list                       List all authenticated accounts");
  consoleLog(PREFIX.GSWARM, "  auth test <email>               Test API access for account");
  consoleLog(PREFIX.GSWARM, "");

  consoleLog(PREFIX.GSWARM, `${BOLD}Project Commands:${RESET}`);
  consoleLog(PREFIX.GSWARM, "  projects list                   List all projects across all accounts");
  consoleLog(PREFIX.GSWARM, "");

  consoleLog(PREFIX.GSWARM, `${BOLD}OAuth Flow:${RESET}`);
  consoleLog(PREFIX.GSWARM, "  1. Run 'auth add <email>' or 'auth batch <emails>'");
  consoleLog(PREFIX.GSWARM, "  2. Visit the OAuth URL in an incognito browser");
  consoleLog(PREFIX.GSWARM, "  3. If VALIDATION_REQUIRED, visit the verification URL");
  consoleLog(PREFIX.GSWARM, "  4. Run 'auth verify <email>' to confirm");
  consoleLog(PREFIX.GSWARM, "");

  consoleLog(PREFIX.GSWARM, `${BOLD}Examples:${RESET}`);
  consoleLog(PREFIX.GSWARM, "  pnpm gswarm auth add user@example.com");
  consoleLog(PREFIX.GSWARM, "  pnpm gswarm auth batch user1@example.com,user2@example.com");
  consoleLog(PREFIX.GSWARM, "  pnpm gswarm auth verify user@example.com");
  consoleLog(PREFIX.GSWARM, "  pnpm gswarm test user@example.com");
  consoleLog(PREFIX.GSWARM, "  pnpm gswarm projects list");
  consoleLog(PREFIX.GSWARM, "");

  consoleLog(PREFIX.GSWARM, `${BOLD}Configuration:${RESET}`);
  consoleLog(PREFIX.GSWARM, `  Model: ${GSWARM_CONFIG.model}`);
  consoleLog(
    PREFIX.GSWARM,
    `  Max Output Tokens: ${GSWARM_CONFIG.maxOutputTokens}`,
  );
  consoleLog(PREFIX.GSWARM, `  Temperature: ${GSWARM_CONFIG.temperature}`);
  consoleLog(PREFIX.GSWARM, `  Client ID: ${OAUTH_CONFIG.CLIENT_ID.slice(0, 20)}...`);
  consoleLog(PREFIX.GSWARM, `  Scopes: ${OAUTH_CONFIG.SCOPE}`);
  consoleLog(PREFIX.GSWARM, "");
}

// =============================================================================
// Main Entry Point
// =============================================================================

async function main(): Promise<void> {
  // CLI guard - only run when invoked via gswarm script
  if (!process.env.GSWARM_CLI) {
    return;
  }

  const command = process.argv[2];
  const subCommand = process.argv[3];
  const arg1 = process.argv[4];

  // Handle help flag
  if (command === "-h" || command === "--help" || command === "help") {
    printHelp();
    process.exit(0);
  }

  try {
    switch (command) {
      case "status":
        await showStatus();
        break;

      case "projects":
        if (subCommand === "list") {
          await projectsList();
        } else {
          await listProjects();
        }
        break;

      case "test":
        if (subCommand) {
          await authTest(subCommand);
        } else {
          await testAllProjects();
        }
        break;

      case "rotation":
        await testRotation();
        break;

      case "auth": {
        switch (subCommand) {
          case "add":
            if (!arg1) {
              consoleError(PREFIX.ERROR, "Email is required");
              consoleLog(PREFIX.GSWARM, "Usage: pnpm gswarm auth add <email>");
              process.exit(1);
            }
            await authAdd(arg1);
            break;

          case "batch":
            if (!arg1) {
              consoleError(PREFIX.ERROR, "Emails are required");
              consoleLog(
                PREFIX.GSWARM,
                "Usage: pnpm gswarm auth batch <email1,email2,...>",
              );
              process.exit(1);
            }
            await authBatch(arg1.split(","));
            break;

          case "verify":
            await authVerify(arg1);
            break;

          case "list":
            await authList();
            break;

          case "test":
            await authTest(arg1);
            break;

          default:
            consoleError(PREFIX.ERROR, `Unknown auth subcommand: ${subCommand}`);
            consoleLog(PREFIX.GSWARM, "Available: add, batch, verify, list, test");
            process.exit(1);
        }
        break;
      }

      default:
        await interactiveDashboard();
        break;
    }

    // Exit after CLI command completes
    if (command !== undefined) {
      process.exit(0);
    }
  } catch (error) {
    consoleError(PREFIX.ERROR, "Error:", error);
    process.exit(1);
  }
}

// Run CLI
main();
