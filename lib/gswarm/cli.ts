#!/usr/bin/env tsx
/**
 * GSwarm CLI
 *
 * Command-line interface for managing GSwarm accounts, projects, and testing.
 * Run with: pnpm gswarm [command]
 *
 * Commands:
 *   (no args)   - Interactive dashboard
 *   status      - Show status summary
 *   projects    - List all projects
 *   test        - Test all enabled projects
 *   rotation    - Test project rotation
 *   help        - Show this help
 */

import * as readline from "node:readline";
import { PREFIX, consoleClear, consoleError, consoleLog } from "@/lib/console";
import { gswarmClient } from "./client";
import { GSWARM_CONFIG } from "./executor";
import {
  getAllGcpProjects,
  getEnabledGcpProjects,
  groupProjectsByOwner,
  invalidateProjectsCache,
} from "./projects";
import {
  deleteToken,
  invalidateTokenCache,
  isTokenExpired,
  loadAllTokens,
} from "./storage/tokens";
import type { GcpProjectInfo, StoredToken } from "./types";

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

function createInterface(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

function prompt(rl: readline.Interface, question: string): Promise<string> {
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
        `  ${DIM}[None] - Add account via dashboard: ${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}${RESET}`,
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
      `  ${DIM}Add accounts via dashboard: ${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}${RESET}`,
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
  consoleLog(PREFIX.GSWARM, "  (no args)   Interactive dashboard");
  consoleLog(PREFIX.GSWARM, "  status      Show status summary");
  consoleLog(PREFIX.GSWARM, "  projects    List all projects");
  consoleLog(PREFIX.GSWARM, "  test        Test all enabled projects");
  consoleLog(PREFIX.GSWARM, "  rotation    Test project rotation");
  consoleLog(PREFIX.GSWARM, "  help        Show this help");
  consoleLog(PREFIX.GSWARM, "");

  consoleLog(PREFIX.GSWARM, `${BOLD}Account Management:${RESET}`);
  consoleLog(
    PREFIX.GSWARM,
    `  Add accounts via the web dashboard: ${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}`,
  );
  consoleLog(
    PREFIX.GSWARM,
    "  Remove accounts via the interactive dashboard (option 1)",
  );
  consoleLog(PREFIX.GSWARM, "");

  consoleLog(PREFIX.GSWARM, `${BOLD}Configuration:${RESET}`);
  consoleLog(PREFIX.GSWARM, `  Model: ${GSWARM_CONFIG.model}`);
  consoleLog(
    PREFIX.GSWARM,
    `  Max Output Tokens: ${GSWARM_CONFIG.maxOutputTokens}`,
  );
  consoleLog(PREFIX.GSWARM, `  Temperature: ${GSWARM_CONFIG.temperature}`);
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
        await listProjects();
        break;

      case "test":
        await testAllProjects();
        break;

      case "rotation":
        await testRotation();
        break;

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
