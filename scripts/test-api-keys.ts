#!/usr/bin/env node
/**
 * API Keys Testing Script
 * Test and interact with the API Keys CRUD endpoints
 */

import {
  CYAN,
  GRAY,
  GREEN,
  PREFIX,
  RESET,
  YELLOW,
  consoleError,
  consoleLog,
} from "../lib/console.ts";

const BASE_URL = process.env.API_URL || "http://localhost:3000";
const API_KEYS_URL = `${BASE_URL}/api/api-keys`;

type Command = "help" | "docs" | "list" | "create" | "delete" | "test";

interface ParsedArgs {
  command: Command;
  sessionId?: string;
  keyHash?: string;
  name?: string;
  rateLimit?: number;
  verbose?: boolean;
}

function parseArgs(): ParsedArgs {
  const args = process.argv.slice(2);
  const result: ParsedArgs = { command: "help" };

  if (args.length === 0) {
    return result;
  }

  const cmd = args[0].toLowerCase();
  if (["help", "docs", "list", "create", "delete", "test"].includes(cmd)) {
    result.command = cmd as Command;
  }

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];

    switch (arg) {
      case "-s":
      case "--session":
        result.sessionId = next;
        i++;
        break;
      case "-h":
      case "--hash":
        result.keyHash = next;
        i++;
        break;
      case "-n":
      case "--name":
        result.name = next;
        i++;
        break;
      case "-r":
      case "--rate-limit":
        result.rateLimit = Number.parseInt(next, 10);
        i++;
        break;
      case "-v":
      case "--verbose":
        result.verbose = true;
        break;
    }
  }

  return result;
}

function printHelp(): void {
  const lines = [
    "",
    `${CYAN}API Keys Testing Script${RESET}`,
    `${GRAY}${"=".repeat(23)}${RESET}`,
    "",
    "Usage: pnpm testkeys:<command> [options]",
    "",
    `${YELLOW}Commands:${RESET}`,
    "  pnpm testkeys           Show this help",
    "  pnpm testkeys:docs      Show API documentation and curl examples",
    "  pnpm testkeys:list      List all API keys (requires session)",
    "  pnpm testkeys:create    Create a new API key (requires session)",
    "  pnpm testkeys:delete    Delete an API key (requires session and hash)",
    "  pnpm testkeys:test      Test API connectivity",
    "",
    `${YELLOW}Options:${RESET}`,
    "  -s, --session <id>      Admin session ID (required for authenticated endpoints)",
    "  -h, --hash <hash>       API key hash (required for delete)",
    '  -n, --name <name>       API key name (for create, default: "Test Key")',
    "  -r, --rate-limit <num>  Rate limit per minute (for create, default: 100)",
    "  -v, --verbose           Show verbose output",
    "",
    `${YELLOW}Environment:${RESET}`,
    "  API_URL                 Base URL (default: http://localhost:3000)",
    "",
    `${YELLOW}Examples:${RESET}`,
    "  pnpm testkeys:list -- -s abc123",
    '  pnpm testkeys:create -- -s abc123 -n "My Key" -r 50',
    "  pnpm testkeys:delete -- -s abc123 -h def456",
    "",
  ];
  consoleLog(PREFIX.INFO, lines.join("\n"));
}

function printDocs(): void {
  const lines = [
    "",
    `${CYAN}=== API Keys CRUD Documentation ===${RESET}`,
    "",
    "Note: You need to be authenticated as an admin to use these endpoints.",
    "The endpoints require a valid admin session cookie.",
    "",
    `Base URL: ${GREEN}${API_KEYS_URL}${RESET}`,
    "",
    `${GRAY}${"━".repeat(80)}${RESET}`,
    "",
    `${YELLOW}1. GET /api/api-keys${RESET} - List all API keys (sanitized)`,
    "",
    `   curl -X GET ${API_KEYS_URL} \\`,
    "     --cookie 'admin_session=YOUR_SESSION_ID'",
    "",
    "   Response:",
    "   {",
    '     "keys": [',
    "       {",
    '         "key_hash": "abc123...",',
    '         "name": "My API Key",',
    '         "created_at": "2026-01-21T...",',
    '         "is_active": true,',
    '         "rate_limit": 100,',
    '         "allowed_endpoints": ["/api/gswarm/*"],',
    '         "allowed_ips": ["*"]',
    "       }",
    "     ]",
    "   }",
    "",
    `${GRAY}${"━".repeat(80)}${RESET}`,
    "",
    `${YELLOW}2. POST /api/api-keys${RESET} - Create new API key`,
    "",
    "   Request body:",
    "   {",
    '     "name": "My API Key",',
    '     "rate_limit": 100,',
    '     "allowed_endpoints": ["/api/gswarm/*"],',
    '     "allowed_ips": ["*"],',
    '     "expires_at": "2026-12-31T23:59:59Z"',
    "   }",
    "",
    `   curl -X POST ${API_KEYS_URL} \\`,
    "     --cookie 'admin_session=YOUR_SESSION_ID' \\",
    "     -H 'Content-Type: application/json' \\",
    `     -d '{"name":"My API Key","rate_limit":100}'`,
    "",
    "   Response:",
    "   {",
    '     "key_hash": "abc123...",',
    '     "name": "My API Key",',
    '     "created_at": "2026-01-21T...",',
    '     "is_active": true,',
    '     "rate_limit": 100,',
    '     "raw_key": "sk-gswarm-abc123def456...",',
    '     "masked_key": "sk-gswarm...xyz"',
    "   }",
    "",
    `${GRAY}${"━".repeat(80)}${RESET}`,
    "",
    `${YELLOW}3. DELETE /api/api-keys/[hash]${RESET} - Delete API key by hash`,
    "",
    `   curl -X DELETE ${API_KEYS_URL}/KEY_HASH_HERE \\`,
    "     --cookie 'admin_session=YOUR_SESSION_ID'",
    "",
    "   Response:",
    "   {",
    '     "success": true,',
    '     "message": "API key deleted successfully"',
    "   }",
    "",
    `${GRAY}${"━".repeat(80)}${RESET}`,
    "",
  ];
  consoleLog(PREFIX.INFO, lines.join("\n"));
}

async function testConnection(): Promise<void> {
  consoleLog(PREFIX.INFO, `Testing connection to ${BASE_URL}...`);
  try {
    const response = await fetch(BASE_URL);
    consoleLog(
      PREFIX.SUCCESS,
      `Server responding (status: ${response.status})`,
    );
  } catch (error) {
    consoleError(PREFIX.ERROR, `Connection failed: ${error}`);
    process.exit(1);
  }
}

async function listKeys(sessionId: string, verbose: boolean): Promise<void> {
  consoleLog(PREFIX.INFO, "Fetching API keys...");

  try {
    const response = await fetch(API_KEYS_URL, {
      headers: {
        Cookie: `admin_session=${sessionId}`,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      consoleError(
        PREFIX.ERROR,
        `Error ${response.status}: ${JSON.stringify(data)}`,
      );
      process.exit(1);
    }

    if (verbose) {
      consoleLog(PREFIX.INFO, JSON.stringify(data, null, 2));
    } else {
      const keys = data.keys || [];
      if (keys.length === 0) {
        consoleLog(PREFIX.INFO, "No API keys found.");
      } else {
        consoleLog(PREFIX.SUCCESS, `Found ${keys.length} API key(s):`);
        for (const key of keys) {
          const info = [
            "",
            `  ${CYAN}Hash:${RESET} ${key.key_hash}`,
            `  ${CYAN}Name:${RESET} ${key.name}`,
            `  ${CYAN}Active:${RESET} ${key.is_active}`,
            `  ${CYAN}Rate Limit:${RESET} ${key.rate_limit}/min`,
          ];
          consoleLog(PREFIX.INFO, info.join("\n"));
        }
      }
    }
  } catch (error) {
    consoleError(PREFIX.ERROR, `Request failed: ${error}`);
    process.exit(1);
  }
}

async function createKey(
  sessionId: string,
  name: string,
  rateLimit: number,
  verbose: boolean,
): Promise<void> {
  consoleLog(
    PREFIX.INFO,
    `Creating API key "${name}" with rate limit ${rateLimit}...`,
  );

  try {
    const response = await fetch(API_KEYS_URL, {
      method: "POST",
      headers: {
        Cookie: `admin_session=${sessionId}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name,
        rate_limit: rateLimit,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      consoleError(
        PREFIX.ERROR,
        `Error ${response.status}: ${JSON.stringify(data)}`,
      );
      process.exit(1);
    }

    if (verbose) {
      consoleLog(PREFIX.INFO, JSON.stringify(data, null, 2));
    } else {
      consoleLog(PREFIX.SUCCESS, "API key created successfully!");
      const info = [
        `  ${CYAN}Hash:${RESET} ${data.key_hash}`,
        `  ${CYAN}Name:${RESET} ${data.name}`,
        `  ${GREEN}Raw Key:${RESET} ${data.raw_key}`,
        `  ${CYAN}Masked:${RESET} ${data.masked_key}`,
        "",
        `${YELLOW}Save the raw key now - it won't be shown again!${RESET}`,
      ];
      consoleLog(PREFIX.WARNING, info.join("\n"));
    }
  } catch (error) {
    consoleError(PREFIX.ERROR, `Request failed: ${error}`);
    process.exit(1);
  }
}

async function deleteKey(
  sessionId: string,
  keyHash: string,
  verbose: boolean,
): Promise<void> {
  consoleLog(PREFIX.INFO, `Deleting API key ${keyHash}...`);

  try {
    const response = await fetch(`${API_KEYS_URL}/${keyHash}`, {
      method: "DELETE",
      headers: {
        Cookie: `admin_session=${sessionId}`,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      consoleError(
        PREFIX.ERROR,
        `Error ${response.status}: ${JSON.stringify(data)}`,
      );
      process.exit(1);
    }

    if (verbose) {
      consoleLog(PREFIX.INFO, JSON.stringify(data, null, 2));
    } else {
      consoleLog(PREFIX.SUCCESS, "API key deleted successfully!");
    }
  } catch (error) {
    consoleError(PREFIX.ERROR, `Request failed: ${error}`);
    process.exit(1);
  }
}

async function main(): Promise<void> {
  const args = parseArgs();

  switch (args.command) {
    case "help":
      printHelp();
      break;

    case "docs":
      printDocs();
      break;

    case "test":
      await testConnection();
      break;

    case "list":
      if (!args.sessionId) {
        consoleError(PREFIX.ERROR, "Session ID required. Use -s or --session");
        process.exit(1);
      }
      await listKeys(args.sessionId, args.verbose || false);
      break;

    case "create":
      if (!args.sessionId) {
        consoleError(PREFIX.ERROR, "Session ID required. Use -s or --session");
        process.exit(1);
      }
      await createKey(
        args.sessionId,
        args.name || "Test Key",
        args.rateLimit || 100,
        args.verbose || false,
      );
      break;

    case "delete":
      if (!args.sessionId) {
        consoleError(PREFIX.ERROR, "Session ID required. Use -s or --session");
        process.exit(1);
      }
      if (!args.keyHash) {
        consoleError(PREFIX.ERROR, "Key hash required. Use -h or --hash");
        process.exit(1);
      }
      await deleteKey(args.sessionId, args.keyHash, args.verbose || false);
      break;
  }
}

main();
