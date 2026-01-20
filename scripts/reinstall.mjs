#!/usr/bin/env node

import { execSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";

const projectRoot = process.cwd();
const nodeModulesPath = join(projectRoot, "node_modules");
const lockFilePath = join(projectRoot, "pnpm-lock.yaml");

console.log("🔍 Checking for files to delete...\n");

// Check what exists
const nodeModulesExists = existsSync(nodeModulesPath);
const lockFileExists = existsSync(lockFilePath);

if (!nodeModulesExists && !lockFileExists) {
  console.log("✅ node_modules: GONE");
  console.log("✅ pnpm-lock.yaml: GONE");
  console.log("\n📦 Starting fresh install...\n");
} else {
  // Report what exists
  if (nodeModulesExists) {
    console.log("📁 node_modules: EXISTS - will be deleted");
  } else {
    console.log("✅ node_modules: GONE");
  }

  if (lockFileExists) {
    console.log("📄 pnpm-lock.yaml: EXISTS - will be deleted");
  } else {
    console.log("✅ pnpm-lock.yaml: GONE");
  }

  console.log("\n🗑️  Deleting...\n");

  // Delete node_modules
  if (nodeModulesExists) {
    try {
      rmSync(nodeModulesPath, { recursive: true, force: true });
      console.log("✅ node_modules: DELETED");
    } catch (error) {
      console.error(
        `❌ Failed to delete node_modules: ${error instanceof Error ? error.message : error}`,
      );
      process.exit(1);
    }
  }

  // Delete pnpm-lock.yaml
  if (lockFileExists) {
    try {
      rmSync(lockFilePath, { force: true });
      console.log("✅ pnpm-lock.yaml: DELETED");
    } catch (error) {
      console.error(
        `❌ Failed to delete pnpm-lock.yaml: ${error instanceof Error ? error.message : error}`,
      );
      process.exit(1);
    }
  }

  // Verify deletion
  console.log("\n🔍 Verifying deletion...\n");

  const nodeModulesStillExists = existsSync(nodeModulesPath);
  const lockFileStillExists = existsSync(lockFilePath);

  if (nodeModulesStillExists || lockFileStillExists) {
    if (nodeModulesStillExists) {
      console.error("❌ node_modules still exists!");
    }
    if (lockFileStillExists) {
      console.error("❌ pnpm-lock.yaml still exists!");
    }
    console.error(
      "\n⚠️  Deletion failed. Please delete manually and try again.",
    );
    process.exit(1);
  }

  console.log("✅ node_modules: CONFIRMED GONE");
  console.log("✅ pnpm-lock.yaml: CONFIRMED GONE");
  console.log("\n📦 Starting fresh install...\n");
}

// Run pnpm install
try {
  execSync("pnpm install", { stdio: "inherit" });
  console.log("\n✅ Installation complete!");
} catch (error) {
  console.error(
    `\n❌ Installation failed: ${error instanceof Error ? error.message : error}`,
  );
  process.exit(1);
}
