/**
 * Sync metadata from package.json → python/pyproject.toml
 * Single source of truth: package.json owns name, version, description.
 * Runs automatically on build via `pnpm version:sync`.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const pythonDir = import.meta.dirname;
const rootDir = join(pythonDir, "..");

// Read package.json as source of truth
const packageJson = JSON.parse(
  readFileSync(join(rootDir, "package.json"), "utf8"),
) as { name: string; description: string; version: string };

const pyprojectPath = join(pythonDir, "pyproject.toml");
let pyproject = readFileSync(pyprojectPath, "utf8");

// Fields to sync: [regex, replacement, label]
const syncs: Array<[RegExp, string, string]> = [
  [/^name = "[^"]*"$/m, `name = "${packageJson.name}"`, "name"],
  [/^version = "[^"]*"$/m, `version = "${packageJson.version}"`, "version"],
  [
    /^description = "[^"]*"$/m,
    `description = "${packageJson.description}"`,
    "description",
  ],
];

let changed = 0;
for (const [regex, replacement, label] of syncs) {
  if (regex.test(pyproject)) {
    const before = pyproject;
    pyproject = pyproject.replace(regex, replacement);
    if (before !== pyproject) {
      changed++;
      console.log(`✓ Synced ${label}: ${replacement}`);
    }
  } else {
    console.error(`✗ Could not find ${label} line in pyproject.toml`);
    process.exit(1);
  }
}

if (changed > 0) {
  writeFileSync(pyprojectPath, pyproject);
  console.log(`✓ ${changed} field(s) updated in pyproject.toml`);
} else {
  console.log("✓ pyproject.toml already in sync");
}
