/**
 * Sync version from package.json to python/pyproject.toml
 * This ensures a single source of truth for versioning.
 * Runs automatically on build.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");

// Read version from package.json
const packageJson = JSON.parse(
  readFileSync(join(rootDir, "package.json"), "utf8"),
);
const version = packageJson.version;

// Update pyproject.toml
const pyprojectPath = join(rootDir, "python", "pyproject.toml");
let pyproject = readFileSync(pyprojectPath, "utf8");

// Replace version line
const versionRegex = /^version = "[^"]*"$/m;
const newVersionLine = `version = "${version}"`;

if (versionRegex.test(pyproject)) {
  pyproject = pyproject.replace(versionRegex, newVersionLine);
  writeFileSync(pyprojectPath, pyproject);
  console.log(`✓ Synced version ${version} to python/pyproject.toml`);
} else {
  console.error("✗ Could not find version line in pyproject.toml");
  process.exit(1);
}
