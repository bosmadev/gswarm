/**
 * Launch Script
 *
 * Interactive launch tool with:
 * - Dev server mode (hot reload)
 * - Production server mode
 * - Automatic process cleanup
 *
 * Usage: pnpm launch
 */

import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import * as fs from "node:fs";
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
} from "../lib/console";

// =============================================================================
// CONFIGURATION
// =============================================================================

// Read version from package.json (single source of truth)
const packageJsonPath = path.join(import.meta.dirname, "..", "package.json");
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
const SYSTEM_VERSION: string = packageJson.version;
const DISPLAY_NAME: string = packageJson.displayName;
const DESCRIPTION: string = packageJson.description;

// Server port (edit this to change port for all modes)
const SERVER_PORT = 3000;

// Cloudflare Tunnel Configuration (customize per project)
const TUNNEL_NAME = "app";
const TUNNEL_ORIGIN = `http://localhost:${SERVER_PORT}`;
const TUNNEL_PUBLIC_URL = "https://app.example.com";

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

let childProcess: ChildProcess | null = null;
let isInMenu = false;
let stdinListenerActive = false;
let hieroglyphAnimationInterval: NodeJS.Timeout | null = null;
let currentAnimationFrame = 0;

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
  if (hieroglyphAnimationInterval) return;

  // Pre-render frames if not done yet
  if (prerenderedFrames.length === 0) {
    prerenderAnimationFrames();
  }

  currentAnimationFrame = 0;

  // Static parts of title line
  const orangeVersion = `${rgb(220, 110, 50)}v${SYSTEM_VERSION}${RESET}`;

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
  clearScreen();

  // Pre-render frames for animation
  if (prerenderedHeaderFrames.length === 0) {
    prerenderAnimationFrames();
  }

  // Use first frame for initial render
  const gradientLine = prerenderedHeaderFrames[0];
  const gradientName = prerenderedNameFrames[0];

  // Version in orange, description in white
  const orangeVersion = `${rgb(220, 110, 50)}v${SYSTEM_VERSION}${RESET}`;

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
    `      ${DIM}Hot reload, DEBUG=true, port ${SERVER_PORT}${RESET}\n\n`,
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

  // Track line count for animation cursor positioning (1-indexed)
  // Lines: 1=top bar, 2=title, 3=bottom bar, 4=system info, 5=empty
  // 6=Select, 7=empty, 8=[1], 9=desc, 10=empty, 11=[2], 12=desc, 13=empty
  // 14=[3], 15=desc, 16=empty, 17=[4], 18=desc, 19=empty, 20=[0], 21=empty, 22=footer
  menuLineCount = 22;

  // Start animation loop after menu is displayed
  startAnimation();
}

// =============================================================================
// PROCESS MANAGEMENT
// =============================================================================

/**
 * Kill processes blocking port 80
 */
async function killBlockingProcesses(): Promise<void> {
  process.stdout.write(`\n${BOLD}[CLEANUP] Process Termination${RESET}\n`);

  const currentPid = process.pid;
  const { execSync } = await import("node:child_process");
  let totalKilled = 0;

  process.stdout.write(`  ${DIM}Terminating blocking processes...${RESET}\n`);

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
      {
        encoding: "utf-8",
      },
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

  if (totalKilled > 0) {
    process.stdout.write(
      `  ${GREEN}✔${RESET} Cleanup completed (${totalKilled} processes)\n`,
    );
  } else {
    process.stdout.write(`  ${DIM}○${RESET} No conflicting processes found\n`);
  }

  await sleep(200);
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

// =============================================================================
// SERVER LAUNCHERS
// =============================================================================

/**
 * Start development server
 */
async function startDevServer(): Promise<void> {
  printBanner();
  process.stdout.write(`${YELLOW}${BOLD}▶ DEVELOPMENT MODE${RESET}\n`);

  await killBlockingProcesses();
  clearNextCache();

  process.stdout.write(`\n${BOLD}[START] Development Server${RESET}\n`);
  process.stdout.write(
    `  ${DIM}Hot reload enabled, port ${SERVER_PORT}${RESET}\n\n`,
  );

  process.stdout.write(
    `${DIM}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}\n\n`,
  );

  childProcess = spawn("pnpm", ["dev"], {
    stdio: "inherit",
    env: {
      ...process.env,
      NODE_OPTIONS: "--no-deprecation --disable-warning=SourceMapWarning",
    },
  });

  childProcess.on("close", (code) => {
    process.stdout.write(
      `\n${YELLOW}Dev server exited with code ${code}${RESET}\n`,
    );
    returnToMenu();
  });

  childProcess.on("error", (err) => {
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
  printBanner();
  process.stdout.write(`${CYAN}${BOLD}▶ DEVELOPMENT MODE (DEBUG)${RESET}\n`);

  await killBlockingProcesses();
  clearNextCache();

  process.stdout.write(`\n${BOLD}[START] Development Server (Debug)${RESET}\n`);
  process.stdout.write(
    `  ${DIM}Hot reload enabled, DEBUG=true, port ${SERVER_PORT}${RESET}\n\n`,
  );

  process.stdout.write(
    `${DIM}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}\n\n`,
  );

  childProcess = spawn("pnpm", ["dev"], {
    stdio: "inherit",
    env: {
      ...process.env,
      NODE_OPTIONS: "--no-deprecation --disable-warning=SourceMapWarning",
      DEBUG: "true",
    },
  });

  childProcess.on("close", (code) => {
    process.stdout.write(
      `\n${YELLOW}Dev server (debug) exited with code ${code}${RESET}\n`,
    );
    returnToMenu();
  });

  childProcess.on("error", (err) => {
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

  childProcess = spawn("pnpm", ["start"], {
    stdio: "inherit",
    env: {
      ...process.env,
      NODE_OPTIONS: "--no-deprecation --disable-warning=SourceMapWarning",
    },
  });

  childProcess.on("close", (code) => {
    process.stdout.write(
      `\n${YELLOW}Production server exited with code ${code}${RESET}\n`,
    );
    returnToMenu();
  });

  childProcess.on("error", (err) => {
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
    const { execSync } = await import("node:child_process");
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
    await sleep(2000);
    returnToMenu();
    return;
  }

  // Step 2: Start production server in background
  process.stdout.write(`\n${BOLD}[START] Production Server${RESET}\n`);
  process.stdout.write(
    `  ${DIM}Starting production server on port ${SERVER_PORT}...${RESET}\n`,
  );

  const serverProcess = spawn("pnpm", ["start"], {
    stdio: "pipe",
    detached: true,
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
// MENU HANDLING
// =============================================================================

/**
 * Return to main menu
 */
async function returnToMenu(): Promise<void> {
  childProcess = null;
  await sleep(500);

  process.stdout.write(
    `\n${YELLOW}Press any key to return to menu...${RESET}\n`,
  );

  await waitForKeypress();
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

  if (childProcess) {
    childProcess.kill("SIGTERM");
    childProcess = null;
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
 * Main function - displays menu and waits for input
 */
function main(): void {
  stopAnimation();
  stopListeningForMenuInput();
  displayMenu();

  process.stdout.write(`${CYAN}Enter your choice: ${RESET}`);

  isInMenu = true;
  startListeningForMenuInput();
}

// Setup handlers and start
setupSignalHandlers();
main();
