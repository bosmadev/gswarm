#!/usr/bin/env node --experimental-transform-types

/**
 * Integration Test Runner
 * Runs all gswarm integration tests with proper setup and reporting
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const TOKEN_FILES_PATH = resolve(process.cwd(), "../cwchat/main/gswarm-tokens");

const REQUIRED_TOKEN_FILES = [
  "bosmadev1@gmail.com.json",
  "bosmadev2@gmail.com.json",
  "bosmadev3@gmail.com.json",
];

interface TestSuite {
  name: string;
  file: string;
  description: string;
  duration: string;
}

const TEST_SUITES: TestSuite[] = [
  {
    name: "Token Loading",
    file: "token-loading.test.ts",
    description: "Verify token file structure and integrity",
    duration: "~1s",
  },
  {
    name: "Token Refresh",
    file: "token-refresh.test.ts",
    description: "Validate OAuth token refresh flow",
    duration: "~10-15s",
  },
  {
    name: "API Calls",
    file: "api-call.test.ts",
    description: "Test CloudCode PA API integration",
    duration: "~30s",
  },
  {
    name: "LRU Rotation",
    file: "lru-rotation.test.ts",
    description: "Verify project rotation logic",
    duration: "~60s",
  },
  {
    name: "Model Support",
    file: "model-support.test.ts",
    description: "Confirm all 5 Gemini models work",
    duration: "~30s",
  },
  {
    name: "Error Handling",
    file: "error-handling.test.ts",
    description: "Test error recovery and fallback",
    duration: "~2-3min",
  },
];

function printHeader() {
  console.log("\n=".repeat(70));
  console.log("  GSwarm Integration Test Suite");
  console.log("=".repeat(70));
  console.log();
}

function checkPrerequisites(): boolean {
  console.log("Checking prerequisites...\n");

  // Check token files
  let allFound = true;
  for (const file of REQUIRED_TOKEN_FILES) {
    const filePath = resolve(TOKEN_FILES_PATH, file);
    const exists = existsSync(filePath);
    const status = exists ? "✅" : "❌";
    console.log(`  ${status} ${file}`);

    if (!exists) {
      allFound = false;
    }
  }

  if (!allFound) {
    console.error(`\n❌ Missing token files in: ${TOKEN_FILES_PATH}\n`);
    return false;
  }

  console.log(`\n✅ All prerequisites met\n`);
  return true;
}

function printTestPlan() {
  console.log("Test Plan:\n");

  for (let i = 0; i < TEST_SUITES.length; i++) {
    const suite = TEST_SUITES[i]!;
    console.log(`  ${i + 1}. ${suite.name} (${suite.duration})`);
    console.log(`     ${suite.description}`);
  }

  console.log();
}

function runTests(pattern?: string): Promise<number> {
  return new Promise((resolve) => {
    const testPath = pattern
      ? `lib/gswarm/__tests__/integration/${pattern}`
      : "lib/gswarm/__tests__/integration";

    console.log(`Running: pnpm vitest:run ${testPath}\n`);
    console.log("=".repeat(70));
    console.log();

    const proc = spawn("pnpm", ["vitest:run", testPath], {
      stdio: "inherit",
      shell: true,
    });

    proc.on("close", (code) => {
      resolve(code ?? 1);
    });

    proc.on("error", (err) => {
      console.error("Failed to run tests:", err);
      resolve(1);
    });
  });
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  printHeader();

  // Check prerequisites first
  if (!checkPrerequisites()) {
    process.exit(1);
  }

  // Handle commands
  switch (command) {
    case "list": {
      printTestPlan();
      process.exit(0);
      break;
    }

    case "run": {
      const testIndex = Number.parseInt(args[1] ?? "", 10);

      if (testIndex >= 1 && testIndex <= TEST_SUITES.length) {
        const suite = TEST_SUITES[testIndex - 1]!;
        console.log(`Running: ${suite.name}\n`);
        const exitCode = await runTests(suite.file);
        process.exit(exitCode);
      }

      if (args[1]) {
        // Run specific file pattern
        const exitCode = await runTests(args[1]);
        process.exit(exitCode);
      }

      // Run all tests
      console.log("Running ALL integration tests...\n");
      printTestPlan();
      const exitCode = await runTests();
      process.exit(exitCode);
      break;
    }

    case "help":
    case undefined: {
      console.log("Usage:");
      console.log("  node scripts/run-integration-tests.ts [command] [args]\n");
      console.log("Commands:");
      console.log("  list              List all test suites");
      console.log("  run               Run all integration tests");
      console.log("  run <1-6>         Run specific test suite by number");
      console.log("  run <pattern>     Run tests matching pattern");
      console.log("  help              Show this help\n");
      console.log("Examples:");
      console.log("  node scripts/run-integration-tests.ts list");
      console.log("  node scripts/run-integration-tests.ts run");
      console.log("  node scripts/run-integration-tests.ts run 1");
      console.log(
        "  node scripts/run-integration-tests.ts run token-loading.test.ts\n",
      );
      process.exit(0);
      break;
    }

    default: {
      console.error(`Unknown command: ${command}\n`);
      console.log(
        'Run "node scripts/run-integration-tests.ts help" for usage\n',
      );
      process.exit(1);
    }
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
