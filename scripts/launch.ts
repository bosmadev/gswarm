/**
 * Launch Script - Unified Server Entry Point
 *
 * TTY terminal  → Interactive TUI menu (dev/debug/production/tunnel)
 * Non-TTY       → Auto-starts production server (systemd, etc.)
 * CLI argument  → Daemon control (start/stop/restart/status/logs/fg)
 *
 * Usage:
 *   pnpm launch                 # TUI menu
 *   node scripts/launch.ts start|stop|restart|status|logs|fg
 *
 * cPanel (Passenger):
 *   Startup file field expects .js — use a wrapper:
 *     // app.js
 *     require("child_process").execSync(
 *       "node --experimental-transform-types scripts/launch.ts",
 *       { stdio: "inherit" }
 *     );
 *   cPanel GUI fields:
 *     Application root:         /home/user/gswarm-api
 *     Application startup file: app.js
 *     Node.js version:          23+
 *
 * Logs: error.log — auto-rotated >10MB, cleaned >14 days, cleanup every 6h.
 *   Configure via ERROR_LOG_MAX_SIZE_MB / ERROR_LOG_MAX_AGE_DAYS in .env.
 */

import type { ChildProcess } from "node:child_process";
import { execSync, spawn } from "node:child_process";
import * as fs from "node:fs";
import * as net from "node:net";
import * as os from "node:os";
import * as path from "node:path";
import {
  BOLD,
  CHARS,
  CYAN,
  DIM,
  GREEN,
  MAGENTA,
  RED,
  RESET,
  YELLOW,
} from "../lib/console.ts";

// =============================================================================
// LOG CLEANUP FUNCTIONS (inlined for standalone Node.js execution)
// =============================================================================

/**
 * Synchronous log rotation. Rotates error.log if it exceeds maxSizeBytes.
 */
function rotateLogSync(
  logPath: string,
  maxSizeBytes = 10 * 1024 * 1024,
): boolean {
  try {
    if (!fs.existsSync(logPath)) return false;
    const stats = fs.statSync(logPath);
    if (stats.size > maxSizeBytes) {
      const backup = `${logPath}.1`;
      if (fs.existsSync(backup)) fs.unlinkSync(backup);
      fs.renameSync(logPath, backup);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Synchronous cleanup of old log backups (error.log.* files).
 */
function cleanOldLogsSync(logDir: string, retentionDays = 14): number {
  try {
    const files = fs.readdirSync(logDir);
    const now = Date.now();
    const maxAge = retentionDays * 24 * 60 * 60 * 1000;
    let removed = 0;
    for (const file of files) {
      if (!file.startsWith("error.log.")) continue;
      const filePath = path.join(logDir, file);
      const stat = fs.statSync(filePath);
      if (now - stat.mtimeMs > maxAge) {
        fs.unlinkSync(filePath);
        removed++;
      }
    }
    return removed;
  } catch {
    return 0;
  }
}

/**
 * Synchronous cleanup of error logs based on age and size.
 */
function cleanupErrorLogsSync(
  projectRoot: string,
  maxAgeDays = 14,
  maxSizeBytes = 10 * 1024 * 1024,
): { rotated: string[]; deleted: string[]; truncated: string[] } {
  const result = {
    rotated: [] as string[],
    deleted: [] as string[],
    truncated: [] as string[],
  };
  const logPaths = [
    path.join(projectRoot, "error.log"),
    path.join(projectRoot, ".next", "standalone", "error.log"),
  ];
  for (const logPath of logPaths) {
    if (!fs.existsSync(logPath)) continue;
    try {
      const stats = fs.statSync(logPath);
      const ageDays = (Date.now() - stats.mtimeMs) / 86_400_000;
      if (ageDays > maxAgeDays) {
        fs.unlinkSync(logPath);
        result.deleted.push(logPath);
        continue;
      }
      if (stats.size > maxSizeBytes) {
        const content = fs.readFileSync(logPath, "utf-8");
        const cut = content.indexOf("\n", Math.floor(content.length / 2));
        if (cut !== -1) {
          fs.writeFileSync(logPath, content.slice(cut + 1));
          result.truncated.push(logPath);
        }
      }
    } catch {
      /* Skip on error */
    }
  }
  if (rotateLogSync(path.join(projectRoot, "error.log"), maxSizeBytes)) {
    result.rotated.push(path.join(projectRoot, "error.log"));
  }
  cleanOldLogsSync(projectRoot, maxAgeDays);
  return result;
}

/**
 * Clean old JSON files from a data directory (metrics, errors).
 */
function cleanDataFolder(dataDir: string, retentionDays = 14): number {
  try {
    if (!fs.existsSync(dataDir)) return 0;
    const files = fs.readdirSync(dataDir);
    const now = Date.now();
    const maxAge = retentionDays * 24 * 60 * 60 * 1000;
    let removed = 0;
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      const filePath = path.join(dataDir, file);
      try {
        const stat = fs.statSync(filePath);
        if (now - stat.mtimeMs > maxAge) {
          fs.unlinkSync(filePath);
          removed++;
        }
      } catch {
        /* Skip individual file errors */
      }
    }
    return removed;
  } catch {
    return 0;
  }
}

/**
 * Clean stale temp files (.tmp.*) older than 1 hour.
 */
function cleanStaleTempFiles(dataDir: string): number {
  try {
    if (!fs.existsSync(dataDir)) return 0;
    const files = fs.readdirSync(dataDir);
    const now = Date.now();
    const maxAge = 60 * 60 * 1000; // 1 hour
    let removed = 0;
    for (const file of files) {
      if (!/\.tmp\.\d+$/.test(file)) continue;
      const filePath = path.join(dataDir, file);
      try {
        const stat = fs.statSync(filePath);
        if (now - stat.mtimeMs > maxAge) {
          fs.unlinkSync(filePath);
          removed++;
        }
      } catch {
        /* Skip individual file errors */
      }
    }
    return removed;
  } catch {
    return 0;
  }
}

/** Background cleanup interval handle */
let cleanupInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Run full cleanup cycle (error.log + data folders).
 */
function runCleanupCycle(): void {
  const projectRoot = path.join(import.meta.dirname, "..");
  const dataDir = path.join(projectRoot, "data");
  const retentionDays = Number(dotenvVars.ERROR_LOG_MAX_AGE_DAYS) || 14;
  const maxSizeBytes =
    (Number(dotenvVars.ERROR_LOG_MAX_SIZE_MB) || 10) * 1024 * 1024;

  // Clean error.log files
  cleanupErrorLogsSync(projectRoot, retentionDays, maxSizeBytes);

  // Clean data folders
  cleanDataFolder(path.join(dataDir, "errors"), retentionDays);
  cleanDataFolder(path.join(dataDir, "metrics"), retentionDays);

  // Clean stale temp files
  cleanStaleTempFiles(dataDir);
  cleanStaleTempFiles(path.join(dataDir, "errors"));
  cleanStaleTempFiles(path.join(dataDir, "metrics"));
}

/**
 * Start background cleanup interval (every 6 hours).
 */
function startBackgroundCleanup(): void {
  if (cleanupInterval) return;
  const intervalMs = 6 * 60 * 60 * 1000; // 6 hours
  cleanupInterval = setInterval(runCleanupCycle, intervalMs);
  // Run initial cleanup after 10 seconds
  setTimeout(runCleanupCycle, 10_000);
}

/**
 * Stop background cleanup interval.
 */
function stopBackgroundCleanup(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
}

// =============================================================================
// CONFIGURATION
// =============================================================================

// Read version from package.json (single source of truth)
const packageJsonPath = path.join(import.meta.dirname, "..", "package.json");
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
const SYSTEM_VERSION: string = packageJson.version;
const DISPLAY_NAME: string = packageJson.displayName;
const DESCRIPTION: string = packageJson.description;

// .env parser - tsx runs outside Next.js runtime, so we need our own
function loadDotenv(): Record<string, string> {
  const envPath = path.join(import.meta.dirname, "..", ".env");
  const result: Record<string, string> = {};
  if (!fs.existsSync(envPath)) return result;
  const content = fs.readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (value.startsWith("encrypted:")) continue;
    result[key] = value;
  }
  return result;
}
const dotenvVars = loadDotenv();

/** Running in standalone/bundled mode (no interactive terminal) */
const STANDALONE_MODE =
  process.env.STANDALONE === "true" || !process.stdin.isTTY;

/** Graphics enabled only in interactive terminal mode */
const GRAPHICS_ENABLED = !STANDALONE_MODE && process.stdout.isTTY;

// Server port - centralized from .env, with fallback chain:
// 1. PORT from .env file
// 2. GLOBAL_PORT from environment variable
// 3. Extracted from package.json scripts
// 4. Default: 3000
function getServerPort(): number {
  // Priority 1: .env GLOBAL_PORT variable
  if (dotenvVars.GLOBAL_PORT) {
    const port = Number.parseInt(dotenvVars.GLOBAL_PORT, 10);
    if (!Number.isNaN(port) && port > 0) return port;
  }
  // Priority 2: Environment variable (GLOBAL_PORT or legacy PORT)
  const envPort = process.env.GLOBAL_PORT || process.env.PORT;
  if (envPort) {
    const port = Number.parseInt(envPort, 10);
    if (!Number.isNaN(port) && port > 0) return port;
  }
  // Priority 3: Extract from package.json scripts (legacy fallback)
  const scripts = packageJson.scripts || {};
  for (const name of ["dev", "start"]) {
    const script = scripts[name];
    if (!script) continue;
    const match = script.match(/--port\s+(\d+)/);
    if (match) return Number.parseInt(match[1], 10);
  }
  return 3000;
}
const SERVER_PORT = getServerPort();

// Cloudflare Tunnel Configuration (customize per project)
const TUNNEL_NAME = packageJson.name;
const TUNNEL_ORIGIN = `http://127.0.0.1:${SERVER_PORT}`;
// GLOBAL_URL (no port) + GLOBAL_PORT = full URL
// Production HTTPS domains don't need port (443 is implicit)
const TUNNEL_PUBLIC_URL = (() => {
  const url = (dotenvVars.GLOBAL_URL || "http://localhost").replace(/\/$/, "");
  // HTTPS production domains don't need explicit port
  if (url.startsWith("https://")) return url;
  return `${url}:${SERVER_PORT}`;
})();

// =============================================================================
// INTERFACES
// =============================================================================

interface SystemStats {
  cpu: number;
  ram: number;
  ramUsed: string;
  ramTotal: string;
  nodeRss: string;
  nodeHeap: string;
  uptime: string;
  processUptime: string;
}

// =============================================================================
// GLOBAL STATE
// =============================================================================

const PID_FILE = path.join(import.meta.dirname, "..", ".server.pid");

let childProcess: ChildProcess | null = null;
let agentServerProcess: ChildProcess | null = null;
let isInMenu = false;
let isReturningToMenu = false;
let isServerLaunching = false;
let stdinListenerActive = false;
let hieroglyphAnimationInterval: NodeJS.Timeout | null = null;
let currentAnimationFrame = 0;

// =============================================================================
// LOG MANAGEMENT (startup cleanup)
// =============================================================================

const LOG_FILE = path.join(import.meta.dirname, "..", "error.log");
const PROJECT_ROOT = path.join(import.meta.dirname, "..");
const ERROR_LOG_MAX_AGE_DAYS = Number(dotenvVars.ERROR_LOG_MAX_AGE_DAYS) || 14;
const ERROR_LOG_MAX_SIZE_BYTES =
  (Number(dotenvVars.ERROR_LOG_MAX_SIZE_MB) || 10) * 1024 * 1024;

/**
 * Rotate error.log if it exceeds max size.
 */
function rotateLogIfNeeded(): void {
  if (rotateLogSync(LOG_FILE, ERROR_LOG_MAX_SIZE_BYTES)) {
    const stats = fs.statSync(`${LOG_FILE}.1`);
    process.stdout.write(
      `  ${GREEN}✔${RESET} Log rotated (was ${formatBytes(stats.size)})\n`,
    );
  }
}

/**
 * Clean up log files older than retention period.
 */
function cleanOldLogs(): void {
  cleanOldLogsSync(PROJECT_ROOT, ERROR_LOG_MAX_AGE_DAYS);
}

/**
 * Cleanup error logs based on age and size thresholds from .env.
 */
function cleanupErrorLogs(): void {
  cleanupErrorLogsSync(
    PROJECT_ROOT,
    ERROR_LOG_MAX_AGE_DAYS,
    ERROR_LOG_MAX_SIZE_BYTES,
  );
}

// Parse CLI args (for daemon commands: start, stop, restart, status, etc.)
const args = process.argv.slice(2);

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Format bytes to human readable string
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${Number.parseFloat((bytes / k ** i).toFixed(1))}${sizes[i]}`;
}

/**
 * Format seconds to human readable duration
 */
function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${(seconds / 3600).toFixed(1)}h`;
  return `${(seconds / 86400).toFixed(1)}d`;
}

/**
 * Get CPU usage percentage
 */
function getCpuUsage(): number {
  const cpus = os.cpus();
  let totalIdle = 0;
  let totalTick = 0;

  for (const cpu of cpus) {
    for (const type in cpu.times) {
      totalTick += cpu.times[type as keyof typeof cpu.times];
    }
    totalIdle += cpu.times.idle;
  }

  return (1 - totalIdle / totalTick) * 100;
}

/**
 * Get system statistics
 */
function getSystemStats(): SystemStats {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const processMemory = process.memoryUsage();

  return {
    cpu: getCpuUsage(),
    ram: (usedMem / totalMem) * 100,
    ramUsed: formatBytes(usedMem),
    ramTotal: formatBytes(totalMem),
    nodeRss: formatBytes(processMemory.rss),
    nodeHeap: formatBytes(processMemory.heapUsed),
    uptime: formatDuration(os.uptime()),
    processUptime: formatDuration(process.uptime()),
  };
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Check if a TCP port is available by attempting to listen on it.
 * Returns true if available, false if in use.
 */
function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port);
  });
}

/**
 * Wait for a port to become available, with retries.
 * Returns true if available within timeout, false otherwise.
 */
async function waitForPort(
  port: number,
  maxRetries = 10,
  intervalMs = 500,
): Promise<boolean> {
  for (let i = 0; i < maxRetries; i++) {
    if (await isPortAvailable(port)) return true;
    if (i < maxRetries - 1) {
      process.stdout.write(
        `  ${DIM}Waiting for port ${port} to be released... (${i + 1}/${maxRetries})${RESET}\n`,
      );
      await sleep(intervalMs);
    }
  }
  return false;
}

/**
 * Clear screen and move cursor to top
 */
function clearScreen(): void {
  process.stdout.write("\x1Bc");
}

// =============================================================================
// TRUE COLOR (24-BIT RGB) SUPPORT
// =============================================================================

/**
 * Generate true color (24-bit RGB) ANSI escape code
 * Better color support than 256-color mode
 */
function rgb(r: number, g: number, b: number): string {
  return `\x1b[38;2;${r};${g};${b}m`;
}

/**
 * Interpolate between two RGB colors
 */
function lerpColor(
  c1: [number, number, number],
  c2: [number, number, number],
  t: number,
): [number, number, number] {
  return [
    Math.round(c1[0] + (c2[0] - c1[0]) * t),
    Math.round(c1[1] + (c2[1] - c1[1]) * t),
    Math.round(c1[2] + (c2[2] - c1[2]) * t),
  ];
}

// =============================================================================
// DISPLAY FUNCTIONS
// =============================================================================

// Crush-style character set for animation (exact match from Crush source)
const DECORATIVE_CHARS = "0123456789abcdefABCDEF~!@#$£€%^&*()+=_";

// Pre-rendered frames for smooth animation (Crush-style)
const TOTAL_FRAMES = 20;
let prerenderedFrames: string[] = [];
let prerenderedHeaderFrames: string[] = [];
let prerenderedNameFrames: string[] = [];

/**
 * Pre-render all animation frames for smooth playback
 * Header: solid lines (━) with flowing color gradient
 * Name: displayName with flowing color gradient
 * Footer: Crush-style random character cycling with color gradient
 */
function prerenderAnimationFrames(): void {
  if (!GRAPHICS_ENABLED) return;

  const decorative = DECORATIVE_CHARS.split("");
  const headerWidth = 62;
  const footerWidth = 30; // Short footer
  const nameChars = DISPLAY_NAME.split("");

  // 3-shade DARK orange gradient (no white)
  const light: [number, number, number] = [255, 160, 80]; // Light orange
  const dark: [number, number, number] = [220, 110, 50]; // Dark orange
  const darker: [number, number, number] = [180, 70, 30]; // Darker orange

  prerenderedFrames = [];
  prerenderedHeaderFrames = [];
  prerenderedNameFrames = [];

  // Seeded random for reproducible but varied animation
  let seed = 12345;
  const seededRandom = (): number => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };

  for (let frame = 0; frame < TOTAL_FRAMES; frame++) {
    let footerLine = "";
    let headerLine = "";
    let nameLine = "";
    const colorOffset = frame * (headerWidth / TOTAL_FRAMES);

    // Header: SOLID LINES (━) with flowing color gradient only
    for (let i = 0; i < headerWidth; i++) {
      const wavePos = (i + colorOffset) / headerWidth;
      const t = (Math.sin(wavePos * Math.PI * 2) + 1) / 2;

      // Interpolate: light → dark → darker (no white)
      let color: [number, number, number];
      if (t < 0.5) {
        color = lerpColor(light, dark, t * 2);
      } else {
        color = lerpColor(dark, darker, (t - 0.5) * 2);
      }
      const colorCode = rgb(color[0], color[1], color[2]);

      // Solid line character - no movement, only color changes
      headerLine += colorCode + CHARS.HEAVY_HORIZONTAL;
    }

    // DisplayName: flowing color gradient on text
    const nameColorOffset = frame * (nameChars.length / TOTAL_FRAMES);
    for (let i = 0; i < nameChars.length; i++) {
      const wavePos = (i + nameColorOffset) / nameChars.length;
      const t = (Math.sin(wavePos * Math.PI * 2) + 1) / 2;

      let color: [number, number, number];
      if (t < 0.5) {
        color = lerpColor(light, dark, t * 2);
      } else {
        color = lerpColor(dark, darker, (t - 0.5) * 2);
      }
      const colorCode = rgb(color[0], color[1], color[2]);

      nameLine += colorCode + nameChars[i];
    }

    // Footer: Crush-style RANDOM character selection each frame
    const footerColorOffset = frame * (footerWidth / TOTAL_FRAMES);
    for (let i = 0; i < footerWidth; i++) {
      const wavePos = (i + footerColorOffset) / footerWidth;
      const t = (Math.sin(wavePos * Math.PI * 2) + 1) / 2;

      // Same dark orange gradient
      let color: [number, number, number];
      if (t < 0.5) {
        color = lerpColor(light, dark, t * 2);
      } else {
        color = lerpColor(dark, darker, (t - 0.5) * 2);
      }
      const colorCode = rgb(color[0], color[1], color[2]);

      // RANDOM character selection (Crush-style) - every char changes each frame
      const charIndex = Math.floor(seededRandom() * decorative.length);
      const char = decorative[charIndex];

      footerLine += colorCode + char;
    }

    prerenderedFrames.push(footerLine + RESET);
    prerenderedHeaderFrames.push(headerLine + RESET);
    prerenderedNameFrames.push(nameLine + RESET);
  }
}

// Track menu line count for cursor positioning
let menuLineCount = 0;

/**
 * Start animation loop for header, name, and footer (30 FPS)
 */
function startAnimation(): void {
  if (!GRAPHICS_ENABLED) return;
  if (hieroglyphAnimationInterval) return;

  // Pre-render frames if not done yet
  if (prerenderedFrames.length === 0) {
    prerenderAnimationFrames();
  }

  currentAnimationFrame = 0;

  // Static parts of title line
  const orangeVersion = `${rgb(220, 110, 50)}${SYSTEM_VERSION}${RESET}`;

  // Hide cursor to prevent highlighting artifacts
  process.stdout.write("\x1b[?25l");

  // 33ms = 30 FPS for faster animation
  hieroglyphAnimationInterval = setInterval(() => {
    if (!isInMenu) return;

    // Save cursor position
    process.stdout.write("\x1b[s");

    // Move to top header line (line 1) and update
    process.stdout.write("\x1b[1;1H\x1b[2K");
    process.stdout.write(prerenderedHeaderFrames[currentAnimationFrame]);

    // Move to title line (line 2) and update with animated name
    process.stdout.write("\x1b[2;1H\x1b[2K");
    process.stdout.write(
      `  ${prerenderedNameFrames[currentAnimationFrame]} (${orangeVersion}) ${DIM}|${RESET} ${DESCRIPTION}`,
    );

    // Move to bottom header line (line 3) and update
    process.stdout.write("\x1b[3;1H\x1b[2K");
    process.stdout.write(prerenderedHeaderFrames[currentAnimationFrame]);

    // Move to footer line and update
    process.stdout.write(`\x1b[${menuLineCount};1H\x1b[2K`);
    process.stdout.write(prerenderedFrames[currentAnimationFrame]);

    // Restore cursor position
    process.stdout.write("\x1b[u");

    currentAnimationFrame = (currentAnimationFrame + 1) % TOTAL_FRAMES;
  }, 33);
}

/**
 * Stop animation
 */
function stopAnimation(): void {
  if (hieroglyphAnimationInterval) {
    clearInterval(hieroglyphAnimationInterval);
    hieroglyphAnimationInterval = null;
  }
  // Show cursor again
  process.stdout.write("\x1b[?25h");
}

/**
 * Print decorative footer with flowing orange gradient (initial render)
 */
function printAnimatedFooter(): void {
  if (!GRAPHICS_ENABLED) return;

  // Pre-render frames if not done
  if (prerenderedFrames.length === 0) {
    prerenderAnimationFrames();
  }

  // Print initial frame
  process.stdout.write(`${prerenderedFrames[0]}\n`);
}

/**
 * Print thin gradient header (Claude Code style) with orange gradient
 */
function printBanner(): void {
  if (!GRAPHICS_ENABLED) {
    console.log(`${DISPLAY_NAME} (${SYSTEM_VERSION}) | ${DESCRIPTION}`);
    return;
  }

  clearScreen();

  // Pre-render frames for animation
  if (prerenderedHeaderFrames.length === 0) {
    prerenderAnimationFrames();
  }

  // Use first frame for initial render
  const gradientLine = prerenderedHeaderFrames[0];
  const gradientName = prerenderedNameFrames[0];

  // Version in orange, description in white
  const orangeVersion = `${rgb(220, 110, 50)}${SYSTEM_VERSION}${RESET}`;

  // Format: {displayName animated} ({version in orange}) | {description in white}
  // NO leading newline - start content at line 1
  process.stdout.write(`${gradientLine}
  ${gradientName} (${orangeVersion}) ${DIM}|${RESET} ${DESCRIPTION}
${gradientLine}
`);
}

/**
 * Build system info header
 */
function buildSystemInfo(stats: SystemStats): string {
  const now = new Date().toLocaleTimeString();
  const cpuColor = stats.cpu > 80 ? RED : stats.cpu > 60 ? YELLOW : GREEN;
  const ramColor = stats.ram > 80 ? RED : stats.ram > 60 ? YELLOW : GREEN;

  return `${DIM}System:${RESET} ${CYAN}${now}${RESET} ${DIM}|${RESET} CPU:${cpuColor}${stats.cpu.toFixed(0)}%${RESET} ${DIM}|${RESET} RAM:${ramColor}${stats.ram.toFixed(0)}%${RESET}(${stats.ramUsed}) ${DIM}|${RESET} Node:${MAGENTA}${stats.nodeRss}${RESET}`;
}

/**
 * Display the main menu
 */
function displayMenu(): void {
  printBanner();

  const stats = getSystemStats();
  process.stdout.write(`${buildSystemInfo(stats)}\n\n`);

  process.stdout.write(`${BOLD}Select Deployment Mode:${RESET}\n\n`);
  process.stdout.write(
    `  ${CYAN}[1]${RESET} ${BOLD}Development Server (Debug)${RESET}\n`,
  );
  process.stdout.write(
    `      ${DIM}Hot reload, DEBUG=true, React Grab + Agent Server, port ${SERVER_PORT}${RESET}\n\n`,
  );
  process.stdout.write(
    `  ${YELLOW}[2]${RESET} ${BOLD}Development Server${RESET}\n`,
  );
  process.stdout.write(
    `      ${DIM}Hot reload, standard logging, port ${SERVER_PORT}${RESET}\n\n`,
  );
  process.stdout.write(
    `  ${GREEN}[3]${RESET} ${BOLD}Production Server${RESET}\n`,
  );
  process.stdout.write(
    `      ${DIM}Optimized build (pnpm build → start), port ${SERVER_PORT}${RESET}\n\n`,
  );
  process.stdout.write(
    `  ${MAGENTA}[4]${RESET} ${BOLD}Cloudflare Tunnel (Production)${RESET}\n`,
  );
  process.stdout.write(
    `      ${DIM}Production build + tunnel to ${TUNNEL_PUBLIC_URL}${RESET}\n\n`,
  );
  process.stdout.write(`  ${RED}[0]${RESET} ${BOLD}Exit${RESET}\n\n`);

  // Decorative footer with flowing orange gradient (animated)
  printAnimatedFooter();

  // Track line count for animation cursor positioning
  menuLineCount = 22;

  // Start animation loop after menu is displayed
  startAnimation();
}

// =============================================================================
// PROCESS MANAGEMENT
// =============================================================================

/**
 * Kill processes blocking port
 */
async function killBlockingProcesses(): Promise<void> {
  process.stdout.write(`\n${BOLD}[CLEANUP] Process Termination${RESET}\n`);

  // Rotate logs if needed
  rotateLogIfNeeded();
  cleanOldLogs();

  const currentPid = process.pid;
  const isWindows = os.platform() === "win32";
  let totalKilled = 0;

  process.stdout.write(`  ${DIM}Terminating blocking processes...${RESET}\n`);

  if (isWindows) {
    // Windows: use tasklist + taskkill
    try {
      const processOutput = execSync(
        'tasklist /FI "IMAGENAME eq node.exe" /FO CSV /NH 2>NUL',
        { encoding: "utf-8" },
      );
      const lines = processOutput.trim().split("\n").filter(Boolean);
      for (const line of lines) {
        const match = line.match(/"node\.exe","(\d+)"/);
        if (match) {
          const pid = Number.parseInt(match[1], 10);
          if (pid === currentPid) continue;
          try {
            // Check if this node process is running next/pnpm
            const cmdLine = execSync(
              `wmic process where "ProcessId=${pid}" get CommandLine /FORMAT:LIST 2>NUL`,
              { encoding: "utf-8" },
            );
            if (/next|pnpm|turbopack/i.test(cmdLine)) {
              execSync(`taskkill /F /PID ${pid} 2>NUL`);
              totalKilled++;
            }
          } catch {
            // Ignore individual process errors
          }
        }
      }
    } catch {
      // No processes found
    }

    process.stdout.write(`  ${DIM}Releasing port ${SERVER_PORT}...${RESET}\n`);

    try {
      const netstatOutput = execSync(
        `netstat -ano | findstr ":${SERVER_PORT}" | findstr "LISTENING"`,
        { encoding: "utf-8" },
      );
      const portLines = netstatOutput.trim().split("\n").filter(Boolean);
      for (const line of portLines) {
        const parts = line.trim().split(/\s+/);
        const pid = Number.parseInt(parts[parts.length - 1], 10);
        if (pid && pid !== currentPid) {
          try {
            execSync(`taskkill /F /PID ${pid} 2>NUL`);
            totalKilled++;
          } catch {
            // Ignore errors
          }
        }
      }
    } catch {
      // No processes on port
    }
  } else {
    // Unix/macOS: use pgrep, lsof, kill
    try {
      const processOutput = execSync(
        "pgrep -f 'next dev|next start|pnpm dev|pnpm start' 2>/dev/null || true",
        { encoding: "utf-8" },
      );
      const processPids = processOutput
        .trim()
        .split("\n")
        .filter((pid) => pid && Number.parseInt(pid, 10) !== currentPid);

      for (const pid of processPids) {
        try {
          execSync(`kill -9 ${pid} 2>/dev/null || true`);
          totalKilled++;
        } catch {
          // Ignore errors
        }
      }
    } catch {
      // No processes found
    }

    process.stdout.write(`  ${DIM}Releasing port ${SERVER_PORT}...${RESET}\n`);

    try {
      const portOutput = execSync(
        `lsof -t -i:${SERVER_PORT} 2>/dev/null || true`,
        { encoding: "utf-8" },
      );
      const portPids = portOutput
        .trim()
        .split("\n")
        .filter((pid) => pid && Number.parseInt(pid, 10) !== currentPid);

      for (const pid of portPids) {
        try {
          execSync(`kill -9 ${pid} 2>/dev/null || true`);
          totalKilled++;
        } catch {
          // Ignore errors
        }
      }
    } catch {
      // No processes on port
    }
  }

  if (totalKilled > 0) {
    process.stdout.write(
      `  ${GREEN}✔${RESET} Cleanup completed (${totalKilled} processes)\n`,
    );
    // Wait for port to actually be released (Windows is slow to free ports)
    const portReady = await waitForPort(SERVER_PORT, 10, 500);
    if (!portReady) {
      process.stdout.write(
        `  ${YELLOW}⚠${RESET} Port ${SERVER_PORT} still in use after cleanup\n`,
      );
    }
  } else {
    process.stdout.write(`  ${DIM}○${RESET} No conflicting processes found\n`);
  }
}

/**
 * Clear the .next build cache
 */
function clearNextCache(): void {
  process.stdout.write(`\n${BOLD}[CLEANUP] Build Cache${RESET}\n`);
  process.stdout.write(`  ${DIM}Clearing .next cache...${RESET}\n`);

  const nextCachePath = path.join(import.meta.dirname, "..", ".next");

  try {
    if (fs.existsSync(nextCachePath)) {
      fs.rmSync(nextCachePath, { recursive: true, force: true });
      process.stdout.write(`  ${GREEN}✔${RESET} Cache cleared\n`);
    } else {
      process.stdout.write(`  ${DIM}○${RESET} No cache to clear\n`);
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    process.stdout.write(
      `  ${YELLOW}⚠${RESET} Could not clear cache: ${errorMessage}\n`,
    );
  }
}

/**
 * Resolve @react-grab/claude-code server.cjs from the npx cache.
 * Ensures the package is cached first, then scans the npx cache directory.
 */
function resolveReactGrabServer(): string | null {
  try {
    // Ensure package is cached (npx --yes installs if missing)
    execSync("npx --yes @react-grab/claude-code@latest --help", {
      stdio: "ignore",
      timeout: 30000,
    });
  } catch {
    // Package may already be cached, continue
  }

  try {
    const npmCache = execSync("npm config get cache", {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "ignore"],
      timeout: 5000,
    }).trim();
    const npxCacheDir = path.join(npmCache, "_npx");

    if (!fs.existsSync(npxCacheDir)) return null;

    for (const entry of fs.readdirSync(npxCacheDir)) {
      const serverPath = path.join(
        npxCacheDir,
        entry,
        "node_modules",
        "@react-grab",
        "claude-code",
        "dist",
        "server.cjs",
      );
      if (fs.existsSync(serverPath)) {
        return serverPath;
      }
    }
  } catch {
    // Cache scan failed
  }

  return null;
}

// =============================================================================
// SERVER LAUNCHERS
// =============================================================================

/**
 * Start development server
 */
async function startDevServer(): Promise<void> {
  if (isServerLaunching) return;
  isServerLaunching = true;

  printBanner();
  process.stdout.write(`${YELLOW}${BOLD}▶ DEVELOPMENT MODE${RESET}\n`);

  await killBlockingProcesses();
  clearNextCache();

  process.stdout.write(`\n${BOLD}[START] Development Server${RESET}\n`);
  process.stdout.write(
    `  ${DIM}Hot reload enabled, port ${SERVER_PORT}${RESET}\n\n`,
  );

  // Start React Grab agent provider server in background
  process.stdout.write(`${BOLD}[REACT GRAB] Agent Provider${RESET}\n`);
  process.stdout.write(
    `  ${DIM}Starting @react-grab/claude-code agent server...${RESET}\n`,
  );

  // Use forward slashes — NODE_OPTIONS parses backslashes as escape chars
  const windowsHidePatch = path
    .resolve(import.meta.dirname, "reactgrab-patch.cjs")
    .replaceAll("\\", "/");

  const reactGrabServerPath = resolveReactGrabServer();

  if (reactGrabServerPath) {
    agentServerProcess = spawn(
      process.execPath,
      [
        "--require",
        windowsHidePatch,
        "--no-deprecation",
        "--disable-warning=SourceMapWarning",
        reactGrabServerPath,
      ],
      {
        stdio: "ignore",
        env: {
          ...process.env,
          REACT_GRAB_CWD: path.resolve(import.meta.dirname, ".."),
        },
        windowsHide: true,
      },
    );
  } else {
    process.stdout.write(
      `  ${YELLOW}⚠${RESET} Using npx fallback (windowsHide patch may not apply)\n`,
    );
    agentServerProcess = spawn("npx", ["@react-grab/claude-code@latest"], {
      stdio: "ignore",
      env: {
        ...process.env,
        NODE_OPTIONS: `--require "${windowsHidePatch}" --no-deprecation --disable-warning=SourceMapWarning`,
        REACT_GRAB_CWD: path.resolve(import.meta.dirname, ".."),
      },
      shell: true,
      windowsHide: true,
    });
  }

  agentServerProcess.on("error", (err) => {
    process.stdout.write(
      `  ${YELLOW}⚠${RESET} React Grab agent server failed: ${err.message}\n`,
    );
    process.stdout.write(
      `  ${DIM}Copy mode still works. Prompt mode requires the agent server.${RESET}\n`,
    );
  });

  process.stdout.write(
    `  ${GREEN}✔${RESET} Agent server started (background)\n`,
  );

  process.stdout.write(
    `\n${DIM}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}\n\n`,
  );

  childProcess = spawn("pnpm", ["dev"], {
    stdio: "inherit",
    shell: true,
    env: {
      ...process.env,
      NODE_OPTIONS: "--no-deprecation --disable-warning=SourceMapWarning",
      PORT: String(SERVER_PORT),
    },
  });

  childProcess.on("close", (code) => {
    isServerLaunching = false;
    if (agentServerProcess) {
      try {
        agentServerProcess.kill("SIGTERM");
      } catch {
        /* already dead */
      }
      agentServerProcess = null;
    }
    process.stdout.write(
      `\n${YELLOW}Dev server exited with code ${code}${RESET}\n`,
    );
    returnToMenu();
  });

  childProcess.on("error", (err) => {
    isServerLaunching = false;
    if (agentServerProcess) {
      try {
        agentServerProcess.kill("SIGTERM");
      } catch {
        /* already dead */
      }
      agentServerProcess = null;
    }
    process.stdout.write(
      `\n${RED}Error starting dev server: ${err.message}${RESET}\n`,
    );
    returnToMenu();
  });
}

/**
 * Start development server with debug logging
 */
async function startDevServerDebug(): Promise<void> {
  if (isServerLaunching) return;
  isServerLaunching = true;

  printBanner();
  process.stdout.write(`${CYAN}${BOLD}▶ DEVELOPMENT MODE (DEBUG)${RESET}\n`);

  await killBlockingProcesses();
  clearNextCache();

  process.stdout.write(`\n${BOLD}[START] Development Server (Debug)${RESET}\n`);
  process.stdout.write(
    `  ${DIM}Hot reload enabled, DEBUG=true, port ${SERVER_PORT}${RESET}\n\n`,
  );

  // Start React Grab agent provider server in background
  process.stdout.write(`\n${BOLD}[REACT GRAB] Agent Provider${RESET}\n`);
  process.stdout.write(
    `  ${DIM}Starting @react-grab/claude-code agent server...${RESET}\n`,
  );

  // Use forward slashes — NODE_OPTIONS parses backslashes as escape chars
  const windowsHidePatch = path
    .resolve(import.meta.dirname, "reactgrab-patch.cjs")
    .replaceAll("\\", "/");

  // Resolve server.cjs from npx cache — npx strips --require from
  // NODE_OPTIONS, so we bypass npx and run server.cjs directly
  const reactGrabServerPath = resolveReactGrabServer();

  if (reactGrabServerPath) {
    // Run server.cjs directly with --require for windowsHide patch
    agentServerProcess = spawn(
      process.execPath,
      [
        "--require",
        windowsHidePatch,
        "--no-deprecation",
        "--disable-warning=SourceMapWarning",
        reactGrabServerPath,
      ],
      {
        stdio: "ignore",
        env: {
          ...process.env,
          REACT_GRAB_CWD: path.resolve(import.meta.dirname, ".."),
        },
        windowsHide: true,
      },
    );
  } else {
    // Fallback: use npx (patch won't fully propagate but server still works)
    process.stdout.write(
      `  ${YELLOW}⚠${RESET} Using npx fallback (windowsHide patch may not apply)\n`,
    );
    agentServerProcess = spawn("npx", ["@react-grab/claude-code@latest"], {
      stdio: "ignore",
      env: {
        ...process.env,
        NODE_OPTIONS: `--require "${windowsHidePatch}" --no-deprecation --disable-warning=SourceMapWarning`,
        REACT_GRAB_CWD: path.resolve(import.meta.dirname, ".."),
      },
      shell: true,
      windowsHide: true,
    });
  }

  agentServerProcess.on("error", (err) => {
    process.stdout.write(
      `  ${YELLOW}⚠${RESET} React Grab agent server failed: ${err.message}\n`,
    );
    process.stdout.write(
      `  ${DIM}Copy mode still works. Prompt mode requires the agent server.${RESET}\n`,
    );
  });

  process.stdout.write(
    `  ${GREEN}✔${RESET} Agent server started (background)\n`,
  );

  process.stdout.write(
    `\n${DIM}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}\n\n`,
  );

  childProcess = spawn("pnpm", ["dev"], {
    stdio: "inherit",
    shell: true,
    env: {
      ...process.env,
      NODE_OPTIONS: "--no-deprecation --disable-warning=SourceMapWarning",
      DEBUG: "true",
      PORT: String(SERVER_PORT),
    },
  });

  childProcess.on("close", (code) => {
    isServerLaunching = false;
    // Kill agent server when dev server exits
    if (agentServerProcess) {
      try {
        agentServerProcess.kill("SIGTERM");
      } catch {
        // Process may already be dead
      }
      agentServerProcess = null;
    }
    process.stdout.write(
      `\n${YELLOW}Dev server (debug) exited with code ${code}${RESET}\n`,
    );
    returnToMenu();
  });

  childProcess.on("error", (err) => {
    isServerLaunching = false;
    // Kill agent server on error
    if (agentServerProcess) {
      try {
        agentServerProcess.kill("SIGTERM");
      } catch {
        // Process may already be dead
      }
      agentServerProcess = null;
    }
    process.stdout.write(
      `\n${RED}Error starting dev server (debug): ${err.message}${RESET}\n`,
    );
    returnToMenu();
  });
}

/**
 * Start production server with build
 */
async function startLiveServer(): Promise<void> {
  if (isServerLaunching) return;
  isServerLaunching = true;

  printBanner();
  process.stdout.write(`${GREEN}${BOLD}▶ PRODUCTION MODE${RESET}\n`);

  await killBlockingProcesses();
  clearNextCache();

  process.stdout.write(`\n${BOLD}[BUILD] Production Build${RESET}\n`);
  process.stdout.write(
    `  ${DIM}Building optimized production bundle...${RESET}\n\n`,
  );

  try {
    const buildProcess = spawn("pnpm", ["build"], {
      stdio: "inherit",
      shell: true,
      env: {
        ...process.env,
        NODE_OPTIONS: "--no-deprecation --disable-warning=SourceMapWarning",
      },
    });

    await new Promise<void>((resolve, reject) => {
      buildProcess.on("close", (code) => {
        if (code === 0) {
          process.stdout.write(
            `\n  ${GREEN}✔${RESET} Build completed successfully\n`,
          );
          resolve();
        } else {
          reject(new Error(`Build failed with code ${code}`));
        }
      });

      buildProcess.on("error", (err) => {
        reject(err);
      });
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    process.stdout.write(`\n  ${RED}✖${RESET} Build failed: ${errorMessage}\n`);
    process.stdout.write(`\n${YELLOW}Returning to menu...${RESET}\n`);
    isServerLaunching = false;
    await sleep(2000);
    returnToMenu();
    return;
  }

  process.stdout.write(`\n${BOLD}[START] Production Server${RESET}\n`);
  process.stdout.write(
    `  ${DIM}Starting optimized production server, port ${SERVER_PORT}...${RESET}\n\n`,
  );

  process.stdout.write(
    `${DIM}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}\n\n`,
  );

  // Production: errors-only logging (stdout suppressed, stderr to error.log)
  const logStream = fs.createWriteStream(LOG_FILE, { flags: "a" });
  childProcess = spawn("pnpm", ["start"], {
    stdio: ["ignore", "ignore", logStream],
    shell: true,
    env: {
      ...process.env,
      NODE_OPTIONS: "--no-deprecation --disable-warning=SourceMapWarning",
    },
  });

  process.stdout.write(`  ${DIM}Errors logging to: error.log${RESET}\n`);

  childProcess.on("close", (code) => {
    isServerLaunching = false;
    process.stdout.write(
      `\n${YELLOW}Production server exited with code ${code}${RESET}\n`,
    );
    returnToMenu();
  });

  childProcess.on("error", (err) => {
    isServerLaunching = false;
    process.stdout.write(
      `\n${RED}Error starting production server: ${err.message}${RESET}\n`,
    );
    returnToMenu();
  });
}

/**
 * Start Cloudflare tunnel (Production mode)
 * Runs: pnpm build → pnpm start → cloudflared tunnel
 * Edit SERVER_PORT in this file to change the port for multiple apps
 */
async function startTunnel(): Promise<void> {
  if (isServerLaunching) return;
  isServerLaunching = true;

  printBanner();
  process.stdout.write(
    `${MAGENTA}${BOLD}▶ CLOUDFLARE TUNNEL (PRODUCTION)${RESET}\n\n`,
  );

  process.stdout.write(`${BOLD}Tunnel Configuration:${RESET}\n`);
  process.stdout.write(`  ${DIM}Name:${RESET}   ${TUNNEL_NAME}\n`);
  process.stdout.write(`  ${DIM}Origin:${RESET} ${TUNNEL_ORIGIN}\n`);
  process.stdout.write(`  ${DIM}Public:${RESET} ${TUNNEL_PUBLIC_URL}\n`);
  process.stdout.write(`  ${DIM}Port:${RESET}   ${SERVER_PORT}\n\n`);

  // Check cloudflared is installed
  try {
    execSync("which cloudflared", { encoding: "utf-8" });
  } catch {
    process.stdout.write(
      `${RED}✖ cloudflared not found. Install it first:${RESET}\n`,
    );
    process.stdout.write(
      `  ${DIM}https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation${RESET}\n\n`,
    );
    await sleep(3000);
    returnToMenu();
    return;
  }

  await killBlockingProcesses();
  clearNextCache();

  // Step 1: Build production bundle
  process.stdout.write(`\n${BOLD}[BUILD] Production Build${RESET}\n`);
  process.stdout.write(
    `  ${DIM}Building optimized production bundle...${RESET}\n\n`,
  );

  try {
    const buildProcess = spawn("pnpm", ["build"], {
      stdio: "inherit",
      shell: true,
      env: {
        ...process.env,
        NODE_OPTIONS: "--no-deprecation --disable-warning=SourceMapWarning",
      },
    });

    await new Promise<void>((resolve, reject) => {
      buildProcess.on("close", (code) => {
        if (code === 0) {
          process.stdout.write(
            `\n  ${GREEN}✔${RESET} Build completed successfully\n`,
          );
          resolve();
        } else {
          reject(new Error(`Build failed with code ${code}`));
        }
      });

      buildProcess.on("error", (err) => {
        reject(err);
      });
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    process.stdout.write(`\n  ${RED}✖${RESET} Build failed: ${errorMessage}\n`);
    process.stdout.write(`\n${YELLOW}Returning to menu...${RESET}\n`);
    isServerLaunching = false;
    await sleep(2000);
    returnToMenu();
    return;
  }

  // Step 2: Start production server in background
  process.stdout.write(`\n${BOLD}[START] Production Server${RESET}\n`);
  process.stdout.write(
    `  ${DIM}Starting production server on port ${SERVER_PORT}...${RESET}\n`,
  );

  const tunnelLogStream = fs.createWriteStream(LOG_FILE, { flags: "a" });
  const serverProcess = spawn("pnpm", ["start"], {
    stdio: ["ignore", "ignore", tunnelLogStream],
    detached: true,
    shell: true,
    env: {
      ...process.env,
      NODE_OPTIONS: "--no-deprecation --disable-warning=SourceMapWarning",
    },
  });

  // Wait for server to be ready
  await sleep(2000);
  process.stdout.write(`  ${GREEN}✔${RESET} Production server started\n`);

  // Step 3: Start cloudflared tunnel
  process.stdout.write(`\n${BOLD}[TUNNEL] Cloudflare Tunnel${RESET}\n`);
  process.stdout.write(
    `  ${DIM}Exposing via ${TUNNEL_PUBLIC_URL}...${RESET}\n`,
  );

  process.stdout.write(
    `\n${DIM}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}\n\n`,
  );

  childProcess = spawn(
    "cloudflared",
    ["tunnel", "--url", TUNNEL_ORIGIN, "run", TUNNEL_NAME],
    {
      stdio: "inherit",
    },
  );

  childProcess.on("close", (code) => {
    isServerLaunching = false;
    // Kill the server process when tunnel closes
    if (serverProcess.pid) {
      try {
        process.kill(-serverProcess.pid);
      } catch {
        // Process may already be dead
      }
    }
    process.stdout.write(
      `\n${YELLOW}Tunnel exited with code ${code}${RESET}\n`,
    );
    returnToMenu();
  });

  childProcess.on("error", (err) => {
    isServerLaunching = false;
    // Kill the server process on error
    if (serverProcess.pid) {
      try {
        process.kill(-serverProcess.pid);
      } catch {
        // Process may already be dead
      }
    }
    process.stdout.write(
      `\n${RED}Error starting tunnel: ${err.message}${RESET}\n`,
    );
    returnToMenu();
  });
}

// =============================================================================
// DAEMON MODE COMMANDS
// =============================================================================

/**
 * Start server in background (daemon mode)
 */
async function daemonStart(): Promise<void> {
  // Check if already running
  if (fs.existsSync(PID_FILE)) {
    const existingPid = fs.readFileSync(PID_FILE, "utf-8").trim();
    process.stdout.write(
      `Server may already be running (PID: ${existingPid}). Use 'status' to check.\n`,
    );
    return;
  }

  // Start in background (--experimental-transform-types for Node native TS)
  const child = spawn(
    "node",
    ["--experimental-transform-types", process.argv[1], "foreground"],
    {
      detached: true,
      stdio: "ignore",
      env: { ...process.env, PORT: String(SERVER_PORT) },
    },
  );

  if (child.pid) {
    fs.writeFileSync(PID_FILE, String(child.pid));
    child.unref();
    process.stdout.write(`Server started in background (PID: ${child.pid})\n`);
  }
}

/**
 * Stop background server
 */
async function daemonStop(): Promise<void> {
  if (!fs.existsSync(PID_FILE)) {
    process.stdout.write("No PID file found. Server may not be running.\n");
    return;
  }

  const pid = Number(fs.readFileSync(PID_FILE, "utf-8").trim());
  try {
    process.kill(pid, "SIGTERM");
    fs.unlinkSync(PID_FILE);
    process.stdout.write(`Server stopped (PID: ${pid})\n`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    process.stdout.write(`Failed to stop server: ${errorMessage}\n`);
    fs.unlinkSync(PID_FILE);
  }
}

/**
 * Restart background server
 */
async function daemonRestart(): Promise<void> {
  await daemonStop();
  await new Promise((resolve) => setTimeout(resolve, 1000));
  await daemonStart();
}

/**
 * Check server status
 */
async function daemonStatus(): Promise<void> {
  if (!fs.existsSync(PID_FILE)) {
    process.stdout.write("Server is not running (no PID file)\n");
    return;
  }

  const pid = Number(fs.readFileSync(PID_FILE, "utf-8").trim());
  try {
    process.kill(pid, 0); // Check if process exists
    process.stdout.write(`Server is running (PID: ${pid})\n`);
  } catch {
    process.stdout.write(`Server is not running (stale PID: ${pid})\n`);
    fs.unlinkSync(PID_FILE);
  }
}

/**
 * Tail error logs
 */
async function daemonLogs(): Promise<void> {
  const logPath = path.join(import.meta.dirname, "..", "error.log");
  if (!fs.existsSync(logPath)) {
    process.stdout.write("No error.log found\n");
    return;
  }

  const child = spawn("tail", ["-f", logPath], { stdio: "inherit" });
  process.on("SIGINT", () => child.kill());
}

/**
 * Run server in foreground (used by daemonStart)
 */
async function daemonForeground(): Promise<void> {
  await startServer("production");
}

/**
 * Start production server (helper for foreground mode)
 */
async function startServer(_mode: "production"): Promise<void> {
  printBanner();
  process.stdout.write(
    `${GREEN}${BOLD}▶ PRODUCTION MODE (FOREGROUND)${RESET}\n`,
  );

  await killBlockingProcesses();

  process.stdout.write(`\n${BOLD}[START] Production Server${RESET}\n`);
  process.stdout.write(
    `  ${DIM}Starting production server, port ${SERVER_PORT}${RESET}\n\n`,
  );

  process.stdout.write(
    `${DIM}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}\n\n`,
  );

  childProcess = spawn("pnpm", ["start"], {
    stdio: "inherit",
    shell: true,
    env: {
      ...process.env,
      NODE_OPTIONS: "--no-deprecation --disable-warning=SourceMapWarning",
      PORT: String(SERVER_PORT),
    },
  });

  // Start background cleanup (every 6 hours)
  startBackgroundCleanup();

  childProcess.on("close", (code) => {
    stopBackgroundCleanup();
    process.stdout.write(
      `\n${YELLOW}Server exited with code ${code}${RESET}\n`,
    );
    process.exit(code || 0);
  });

  childProcess.on("error", (err) => {
    stopBackgroundCleanup();
    process.stdout.write(
      `\n${RED}Error starting server: ${err.message}${RESET}\n`,
    );
    process.exit(1);
  });
}

// =============================================================================
// MENU HANDLING
// =============================================================================

/**
 * Return to main menu
 */
async function returnToMenu(): Promise<void> {
  if (isReturningToMenu) return;
  isReturningToMenu = true;
  isServerLaunching = false;

  childProcess = null;
  await sleep(500);

  process.stdout.write(
    `\n${YELLOW}Press any key to return to menu...${RESET}\n`,
  );

  await waitForKeypress();
  isReturningToMenu = false;
  main();
}

/**
 * Wait for a single keypress
 */
function waitForKeypress(): Promise<void> {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }
    process.stdin.resume();

    const onData = (): void => {
      process.stdin.removeListener("data", onData);
      resolve();
    };

    process.stdin.once("data", onData);
  });
}

/**
 * Handle menu keypress
 */
function handleMenuKeypress(key: Buffer): void {
  const keyStr = key.toString();

  if (key[0] === 3) {
    stopAnimation();
    process.stdout.write(`\n\n${CYAN}Goodbye!${RESET}\n\n`);
    cleanupAndExit(0);
    return;
  }

  if (key[0] === 27) {
    stopAnimation();
    process.stdout.write(`\n\n${CYAN}Goodbye!${RESET}\n\n`);
    cleanupAndExit(0);
    return;
  }

  switch (keyStr) {
    case "1":
      isInMenu = false;
      stopAnimation();
      stopListeningForMenuInput();
      startDevServerDebug();
      break;
    case "2":
      isInMenu = false;
      stopAnimation();
      stopListeningForMenuInput();
      startDevServer();
      break;
    case "3":
      isInMenu = false;
      stopAnimation();
      stopListeningForMenuInput();
      startLiveServer();
      break;
    case "4":
      isInMenu = false;
      stopAnimation();
      stopListeningForMenuInput();
      startTunnel();
      break;
    case "0":
    case "q":
    case "Q":
      stopAnimation();
      process.stdout.write(`\n\n${CYAN}Goodbye!${RESET}\n\n`);
      cleanupAndExit(0);
      break;
    default:
      process.stdout.write(
        `\r${RED}Invalid option '${keyStr.replace(/[^\x20-\x7E]/g, "")}'. Press 1, 2, 3, 4, or 0.${RESET}                    \r`,
      );
      process.stdout.write(`${CYAN}Enter your choice: ${RESET}`);
  }
}

/**
 * Start listening for menu input
 */
function startListeningForMenuInput(): void {
  if (stdinListenerActive) return;

  stdinListenerActive = true;

  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
  }
  process.stdin.resume();
  process.stdin.setEncoding("utf8");

  process.stdin.on("data", onMenuData);
}

/**
 * Stop listening for menu input
 */
function stopListeningForMenuInput(): void {
  if (!stdinListenerActive) return;

  stdinListenerActive = false;
  process.stdin.removeListener("data", onMenuData);

  if (process.stdin.isTTY) {
    process.stdin.setRawMode(false);
  }
  process.stdin.pause();
}

/**
 * Menu data handler
 */
function onMenuData(key: Buffer | string): void {
  if (!isInMenu) return;

  const keyBuffer = Buffer.isBuffer(key) ? key : Buffer.from(key);
  handleMenuKeypress(keyBuffer);
}

/**
 * Cleanup and exit
 */
function cleanupAndExit(code: number): void {
  stopAnimation();
  stopListeningForMenuInput();
  stopBackgroundCleanup();

  if (childProcess) {
    childProcess.kill("SIGTERM");
    childProcess = null;
  }

  if (agentServerProcess) {
    agentServerProcess.kill("SIGTERM");
    agentServerProcess = null;
  }

  if (process.stdin.isTTY) {
    process.stdin.setRawMode(false);
  }

  process.exit(code);
}

/**
 * Setup global signal handlers
 */
function setupSignalHandlers(): void {
  process.on("SIGTERM", () => {
    cleanupAndExit(0);
  });

  process.on("uncaughtException", (err) => {
    process.stdout.write(
      `\n${RED}Uncaught exception: ${err.message}${RESET}\n`,
    );
    cleanupAndExit(1);
  });
}

// =============================================================================
// MAIN ENTRY POINT
// =============================================================================

/**
 * Reinstall - Delete node_modules, pnpm-lock.yaml, .next/ and reinstall
 */
async function reinstall(): Promise<void> {
  const projectRoot = process.cwd();
  const nodeModulesPath = path.join(projectRoot, "node_modules");
  const lockFilePath = path.join(projectRoot, "pnpm-lock.yaml");
  const nextCachePath = path.join(projectRoot, ".next");

  process.stdout.write(
    `\n${YELLOW}${BOLD}🔍 Checking for files to delete...${RESET}\n\n`,
  );

  // Check what exists
  const nodeModulesExists = fs.existsSync(nodeModulesPath);
  const lockFileExists = fs.existsSync(lockFilePath);
  const nextCacheExists = fs.existsSync(nextCachePath);

  if (!nodeModulesExists && !lockFileExists && !nextCacheExists) {
    process.stdout.write(`${GREEN}✅ node_modules: GONE${RESET}\n`);
    process.stdout.write(`${GREEN}✅ pnpm-lock.yaml: GONE${RESET}\n`);
    process.stdout.write(`${GREEN}✅ .next/: GONE${RESET}\n`);
    process.stdout.write(`\n${CYAN}📦 Starting fresh install...${RESET}\n\n`);
  } else {
    // Report what exists
    if (nodeModulesExists) {
      process.stdout.write(
        `${YELLOW}📁 node_modules: EXISTS - will be deleted${RESET}\n`,
      );
    } else {
      process.stdout.write(`${GREEN}✅ node_modules: GONE${RESET}\n`);
    }

    if (lockFileExists) {
      process.stdout.write(
        `${YELLOW}📄 pnpm-lock.yaml: EXISTS - will be deleted${RESET}\n`,
      );
    } else {
      process.stdout.write(`${GREEN}✅ pnpm-lock.yaml: GONE${RESET}\n`);
    }

    if (nextCacheExists) {
      process.stdout.write(
        `${YELLOW}📁 .next/: EXISTS - will be deleted${RESET}\n`,
      );
    } else {
      process.stdout.write(`${GREEN}✅ .next/: GONE${RESET}\n`);
    }

    process.stdout.write(`\n${RED}🗑️  Deleting...${RESET}\n\n`);

    // Delete node_modules
    if (nodeModulesExists) {
      try {
        fs.rmSync(nodeModulesPath, { recursive: true, force: true });
        process.stdout.write(`${GREEN}✅ node_modules: DELETED${RESET}\n`);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        process.stdout.write(
          `${RED}❌ Failed to delete node_modules: ${errorMessage}${RESET}\n`,
        );
        process.exit(1);
      }
    }

    // Delete pnpm-lock.yaml
    if (lockFileExists) {
      try {
        fs.rmSync(lockFilePath, { force: true });
        process.stdout.write(`${GREEN}✅ pnpm-lock.yaml: DELETED${RESET}\n`);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        process.stdout.write(
          `${RED}❌ Failed to delete pnpm-lock.yaml: ${errorMessage}${RESET}\n`,
        );
        process.exit(1);
      }
    }

    // Delete .next/
    if (nextCacheExists) {
      try {
        fs.rmSync(nextCachePath, { recursive: true, force: true });
        process.stdout.write(`${GREEN}✅ .next/: DELETED${RESET}\n`);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        process.stdout.write(
          `${RED}❌ Failed to delete .next/: ${errorMessage}${RESET}\n`,
        );
        process.exit(1);
      }
    }

    // Verify deletion
    process.stdout.write(`\n${YELLOW}🔍 Verifying deletion...${RESET}\n\n`);

    const nodeModulesStillExists = fs.existsSync(nodeModulesPath);
    const lockFileStillExists = fs.existsSync(lockFilePath);
    const nextCacheStillExists = fs.existsSync(nextCachePath);

    if (nodeModulesStillExists || lockFileStillExists || nextCacheStillExists) {
      if (nodeModulesStillExists) {
        process.stdout.write(`${RED}❌ node_modules still exists!${RESET}\n`);
      }
      if (lockFileStillExists) {
        process.stdout.write(`${RED}❌ pnpm-lock.yaml still exists!${RESET}\n`);
      }
      if (nextCacheStillExists) {
        process.stdout.write(`${RED}❌ .next/ still exists!${RESET}\n`);
      }
      process.stdout.write(
        `\n${RED}⚠️  Deletion failed. Please delete manually and try again.${RESET}\n`,
      );
      process.exit(1);
    }

    process.stdout.write(`${GREEN}✅ node_modules: CONFIRMED GONE${RESET}\n`);
    process.stdout.write(`${GREEN}✅ pnpm-lock.yaml: CONFIRMED GONE${RESET}\n`);
    process.stdout.write(`${GREEN}✅ .next/: CONFIRMED GONE${RESET}\n`);
    process.stdout.write(`\n${CYAN}📦 Starting fresh install...${RESET}\n\n`);
  }

  // Run pnpm install
  try {
    execSync("pnpm install", { stdio: "inherit" });
    process.stdout.write(`\n${GREEN}✅ Installation complete!${RESET}\n`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    process.stdout.write(
      `\n${RED}❌ Installation failed: ${errorMessage}${RESET}\n`,
    );
    process.exit(1);
  }
}

/**
 * Post-build: Copy required files to Next.js standalone build directory
 */
function postbuild(): void {
  const standaloneDir = path.join(PROJECT_ROOT, ".next", "standalone");

  if (!fs.existsSync(standaloneDir)) {
    process.stdout.write(
      `${YELLOW}⚠${RESET} No standalone build found. Run ${CYAN}next build${RESET} first.\n`,
    );
    process.exit(0);
  }

  process.stdout.write(`${BOLD}Copying files to standalone build...${RESET}\n`);

  // Individual files to copy
  const filesToCopy: string[] = [
    "scripts/launch.ts",
    "scripts/reactgrab-patch.cjs",
    "lib/console.ts",
    ".env",
  ];

  // Directories to copy (all .ts files)
  const dirsToCopy: string[] = ["lib/gswarm", "lib/gswarm/storage"];

  // Copy individual files
  for (const src of filesToCopy) {
    const srcPath = path.join(PROJECT_ROOT, src);
    const destPath = path.join(standaloneDir, src);

    if (!fs.existsSync(srcPath)) {
      process.stdout.write(`${YELLOW}⚠${RESET} Skipped ${src} (not found)\n`);
      continue;
    }

    const destDir = path.dirname(destPath);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    fs.copyFileSync(srcPath, destPath);
    process.stdout.write(`${GREEN}✓${RESET} ${src}\n`);
  }

  // Copy .ts files from directories
  for (const dir of dirsToCopy) {
    const srcDir = path.join(PROJECT_ROOT, dir);
    const destDir = path.join(standaloneDir, dir);

    if (!fs.existsSync(srcDir)) {
      process.stdout.write(`${YELLOW}⚠${RESET} Skipped ${dir}/ (not found)\n`);
      continue;
    }

    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    const files = fs
      .readdirSync(srcDir)
      .filter((f: string) => f.endsWith(".ts"));
    for (const file of files) {
      fs.copyFileSync(path.join(srcDir, file), path.join(destDir, file));
    }
    process.stdout.write(
      `${GREEN}✓${RESET} ${dir}/*.ts (${files.length} files)\n`,
    );
  }

  process.stdout.write(`${GREEN}✓${RESET} Post-build complete\n`);
}

/**
 * Main function - displays menu and waits for input, or handles daemon commands
 */
async function main(): Promise<void> {
  const command = args[0]?.toLowerCase();

  // Handle daemon commands and flags
  const normalizedCommand = command?.replace(/^--/, "");
  if (normalizedCommand) {
    switch (normalizedCommand) {
      case "start":
        await daemonStart();
        return;
      case "stop":
        await daemonStop();
        return;
      case "restart":
        await daemonRestart();
        return;
      case "status":
        await daemonStatus();
        return;
      case "logs":
        await daemonLogs();
        return;
      case "foreground":
      case "fg":
        await daemonForeground();
        return;
      case "reinstall":
        await reinstall();
        return;
      case "postbuild":
        postbuild();
        return;
      case "debug":
        await startDevServerDebug();
        return;
    }
  }

  // Non-interactive mode (cPanel, systemd, etc.) - auto-start server
  if (STANDALONE_MODE) {
    await daemonForeground();
    return;
  }

  // Interactive menu (TTY)
  stopAnimation();
  stopListeningForMenuInput();
  displayMenu();

  process.stdout.write(`${CYAN}Enter your choice: ${RESET}`);

  isInMenu = true;
  startListeningForMenuInput();
}

// Setup handlers, cleanup, and start
setupSignalHandlers();
cleanupErrorLogs();
main();
