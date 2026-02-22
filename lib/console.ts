/**
 * ANSI Color Codes and Utilities for Log Prefixes
 * Provides color utilities specifically for logging and console output
 *
 * ============================================================================
 * LOG LEVEL GUIDELINES - WHEN TO USE EACH FUNCTION
 * ============================================================================
 *
 * consoleError() - ALWAYS VISIBLE
 *   Use for: Errors that require attention, failed operations, exceptions
 *   Examples:
 *   - Database connection failures
 *   - API request failures
 *   - Data validation failures
 *   - Unrecoverable errors
 *
 * consoleWarn() - ALWAYS VISIBLE
 *   Use for: Important warnings that might indicate problems
 *   Examples:
 *   - Rate limit approaching
 *   - Fallback behavior triggered
 *   - Deprecated feature usage
 *   - Configuration issues that don't prevent operation
 *
 * consoleLog() - ALWAYS VISIBLE
 *   Use for: Critical status updates users should always see
 *   Examples:
 *   - Worker started/stopped status
 *   - Major system state changes
 *   - Significant milestones
 *   - Critical configuration changes
 *
 * consoleDebug() - DEBUG MODE ONLY (DEBUG=true)
 *   Use for: Verbose/detailed information for development/debugging
 *   Examples:
 *   - Initialization details
 *   - Data fetching progress
 *   - State transitions
 *   - Performance timing details
 *   - Configuration loading details
 *
 * ============================================================================
 * DEBUG MODE CONFIGURATION
 * ============================================================================
 *
 * Set DEBUG=true or DEBUG=1 in environment to enable debug logging.
 * Debug messages are hidden by default in production.
 */

// =============================================================================
// ANSI STYLE CODES
// =============================================================================

export const RESET = "\x1b[0m";
export const BOLD = "\x1b[1m";
export const DIM = "\x1b[2m";
export const ITALIC = "\x1b[3m";
export const UNDERLINE = "\x1b[4m";

// =============================================================================
// FOREGROUND COLORS
// =============================================================================

export const RED = "\x1b[31m";
export const GREEN = "\x1b[32m";
export const YELLOW = "\x1b[33m";
export const BLUE = "\x1b[34m";
export const MAGENTA = "\x1b[35m";
export const CYAN = "\x1b[36m";
export const WHITE = "\x1b[37m";
export const GRAY = "\x1b[90m";

// =============================================================================
// BACKGROUND COLORS
// =============================================================================

export const BG_RED = "\x1b[41m";
export const BG_GREEN = "\x1b[42m";
export const BG_YELLOW = "\x1b[43m";
export const BG_BLUE = "\x1b[44m";
export const BG_MAGENTA = "\x1b[45m";
export const BG_CYAN = "\x1b[46m";
export const BG_WHITE = "\x1b[47m";
export const BG_BLACK = "\x1b[40m";

// =============================================================================
// DEBUG MODE CONFIGURATION
// =============================================================================

/**
 * Check if debug mode is enabled via environment variable
 * Set DEBUG=true or DEBUG=1 to enable debug logging
 */
export const isDebugMode = (): boolean => {
  const debugEnv = process.env.DEBUG;
  return debugEnv === "true" || debugEnv === "1";
};

/**
 * Global silent mode flag to suppress non-error logging
 * Used during diagnostic checks to prevent output interleaving
 */
let silentMode = false;

/**
 * Enable or disable silent mode for non-error logging
 * @param enabled - Whether to enable silent mode
 */
export function setSilentMode(enabled: boolean): void {
  silentMode = enabled;
}

/**
 * Check if silent mode is currently enabled
 */
export function isSilentMode(): boolean {
  return silentMode;
}

// =============================================================================
// EMOJI CONSTANTS
// =============================================================================

/**
 * Collection of emojis for different log types
 * Organized by category for easy reference
 */
export const EMOJI = {
  // Status emojis
  SUCCESS: "✅",
  ERROR: "❌",
  WARNING: "⚠️",
  INFO: "ℹ️",
  DEBUG: "🔍",
  FATAL: "💀",
  CANCEL: "🚫",

  // Action emojis
  START: "▶️",
  STOP: "⏹️",
  PAUSE: "⏸️",
  RESUME: "▶️",
  EXECUTE: "⚡",
  PROCESSING: "⏳",
  COMPLETED: "✓",

  // System emojis
  API: "🌐",
  DATABASE: "🗄️",
  WORKER: "⚙️",
  QUEUE: "📬",

  // Time-related emojis
  CLOCK: "🕐",
  TIMER: "⏱️",
  CALENDAR: "📅",

  // Miscellaneous emojis
  ROCKET: "🚀",
  FIRE: "🔥",
  SPARKLES: "✨",
  CHART: "📊",
  BELL: "🔔",
  LOCK: "🔒",
  KEY: "🔑",
  SHIELD: "🛡️",
} as const;

// =============================================================================
// TEXT FORMATTING FUNCTIONS
// =============================================================================

/**
 * Create colored and styled text with various formatting options
 *
 * @param text - The text to style
 * @param options - Formatting options
 * @returns Styled text string with ANSI codes
 *
 * @example
 * styled('Hello World', { color: RED, bold: true })
 * styled('Warning!', { color: YELLOW, bg: BG_RED, bold: true })
 */
export function styled(
  text: string,
  options: {
    /** Foreground color */
    color?: string;
    /** Background color */
    bg?: string;
    /** Bold text */
    bold?: boolean;
    /** Dim text */
    dim?: boolean;
    /** Italic text */
    italic?: boolean;
    /** Underline text */
    underline?: boolean;
  },
): string {
  let result = "";

  // Apply styles in order
  if (options.bold) result += BOLD;
  if (options.dim) result += DIM;
  if (options.italic) result += ITALIC;
  if (options.underline) result += UNDERLINE;
  if (options.bg) result += options.bg;
  if (options.color) result += options.color;

  // Add text and reset formatting
  result += text + RESET;
  return result;
}

/**
 * Highlight text with bold yellow formatting (convenience function)
 *
 * @param text - The text to highlight
 * @param color - The highlight color (defaults to YELLOW)
 * @returns Highlighted text string
 *
 * @example
 * highlight('Important message')
 * highlight('Error details', RED)
 */
export function highlight(text: string, color: string = YELLOW): string {
  return styled(text, { color, bold: true });
}

/**
 * Format a number with color based on its value
 * Positive numbers are green, negative are red, zero is yellow
 *
 * @param value - The number to format
 * @param options - Formatting options
 * @returns Formatted and colored number string
 *
 * @example
 * colorNumber(5.25) // green "5.25"
 * colorNumber(-3.75) // red "-3.75"
 * colorNumber(0) // yellow "0.00"
 * colorNumber(100, { prefix: '$', decimals: 0 }) // green "$100"
 */
export function colorNumber(
  value: number,
  options: {
    /** Color for positive values (default: GREEN) */
    positive?: string;
    /** Color for negative values (default: RED) */
    negative?: string;
    /** Color for zero values (default: YELLOW) */
    zero?: string;
    /** Prefix to add before the number */
    prefix?: string;
    /** Suffix to add after the number */
    suffix?: string;
    /** Number of decimal places (default: 2) */
    decimals?: number;
  } = {},
): string {
  const {
    positive = GREEN,
    negative = RED,
    zero = YELLOW,
    prefix = "",
    suffix = "",
    decimals = 2,
  } = options;

  // Determine color based on value
  const color = value > 0 ? positive : value < 0 ? negative : zero;

  // Format the number with fixed decimals
  const formatted = value.toFixed(decimals);

  // Apply styling and return
  return styled(`${prefix}${formatted}${suffix}`, { color, bold: true });
}

/**
 * Create a separator line with specified character, length, and color
 *
 * @param char - Character to repeat (default: '─')
 * @param length - Length of the separator (default: 80)
 * @param color - Color of the separator (default: GRAY)
 * @returns Formatted separator string
 *
 * @example
 * separator() // 80 gray dashes
 * separator('=', 50, BLUE) // 50 blue equals
 */
export function separator(
  char: string = "─",
  length: number = 80,
  color: string = GRAY,
): string {
  return color + char.repeat(length) + RESET;
}

// =============================================================================
// LOG PREFIXES
// =============================================================================

/**
 * Context-based log prefixes for different system components
 * Organized by category for better maintainability
 */
export const PREFIX = {
  // Core Systems
  QUEUE: `${CYAN}[ Queue ] ${RESET}`,
  DATABASE: `${GREEN}[ Database ] ${RESET}`,
  WORKER: `${MAGENTA}[ Worker ] ${RESET}`,
  SCHEDULER: `${MAGENTA}[ Scheduler ] ${RESET}`,
  API: `${BLUE}[ API ] ${RESET}`,

  // Database
  MONGODB: `${GREEN}[ MongoDB ] ${RESET}`,
  REDIS: `${GREEN}[ Redis ] ${RESET}`,

  // Network
  WEBSOCKET: `${BLUE}[ WebSocket ] ${RESET}`,

  // Status
  ERROR: `${RED}[ Error ] ${RESET}`,
  WARNING: `${YELLOW}[ Warning ] ${RESET}`,
  SUCCESS: `${GREEN}[ Success ] ${RESET}`,
  INFO: `${CYAN}[ Info ] ${RESET}`,
  DEBUG: `${GRAY}[ Debug ] ${RESET}`,
  HEALTH: `${GREEN}[ Health ] ${RESET}`,
  STATUS: `${CYAN}[ Status ] ${RESET}`,

  // Request Logging (Middleware)
  REQUEST_API: `${GRAY}[ API ]${RESET}`,
  REQUEST_PAGE: `${GRAY}[ Page ]${RESET}`,

  // Frontend
  UI: `${CYAN}[ UI ] ${RESET}`,

  // Worker
  WORKER_AUTO_INIT: `${MAGENTA}[ Worker Init ] ${RESET}`,
  WORKER_API: `${MAGENTA}[ Worker API ] ${RESET}`,

  // GSwarm
  GSWARM: `\x1b[38;5;208m[ GSwarm ] ${RESET}`,
} as const;

// =============================================================================
// LOGGING FUNCTIONS
// =============================================================================

/**
 * Get current timestamp in ISO format with gray color
 *
 * @returns Formatted timestamp string
 */
export function getTimestamp(): string {
  const now = new Date();
  const d =
    now.getFullYear() +
    "-" +
    String(now.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(now.getDate()).padStart(2, "0");
  const t =
    String(now.getHours()).padStart(2, "0") +
    ":" +
    String(now.getMinutes()).padStart(2, "0") +
    ":" +
    String(now.getSeconds()).padStart(2, "0");

  return `${GRAY}${ITALIC}${d} ${t}${RESET}`;
}

/**
 * Format a log message with timestamp and colored prefix
 *
 * @param prefix - Log prefix (from PREFIX constants)
 * @param message - Log message
 * @returns Formatted log string with timestamp and prefix
 */
export function formatLog(prefix: string, message: string): string {
  // Trim inner spaces from [ Prefix ] -> [Prefix]
  const cleanPrefix = prefix.replace(/\[\s+/g, "[").replace(/\s+\]/g, "]");

  const sep = `${GRAY} | ${RESET}`;

  return `${getTimestamp()}${sep}${cleanPrefix}${message}`;
}

/**
 * Log a message with timestamp and colored prefix
 *
 * @param prefix - Log prefix (from PREFIX constants)
 * @param message - Log message
 * @param args - Additional arguments to log
 *
 * @example
 * consoleLog(PREFIX.INFO, 'Application started')
 * consoleLog(PREFIX.SUCCESS, 'Operation completed', details)
 */
export function consoleLog(
  prefix: string,
  message: string,
  ...args: unknown[]
): void {
  if (silentMode) return;
  console.log(formatLog(prefix, message), ...args);
}

/**
 * Log an error message with timestamp and colored prefix
 *
 * @param prefix - Log prefix (from PREFIX constants)
 * @param message - Error message
 * @param args - Additional arguments to log
 *
 * @example
 * consoleError(PREFIX.ERROR, 'Failed to connect to database', error)
 */
export function consoleError(
  prefix: string,
  message: string,
  ...args: unknown[]
): void {
  console.error(formatLog(prefix, message), ...args);
}

/**
 * Log a warning message with timestamp and colored prefix
 *
 * @param prefix - Log prefix (from PREFIX constants)
 * @param message - Warning message
 * @param args - Additional arguments to log
 *
 * @example
 * consoleWarn(PREFIX.WARNING, 'Rate limit approaching', { limit: 1000, current: 950 })
 */
export function consoleWarn(
  prefix: string,
  message: string,
  ...args: unknown[]
): void {
  if (silentMode) return;
  console.warn(formatLog(prefix, message), ...args);
}

/**
 * Log a debug message with timestamp and colored prefix
 * Only outputs when DEBUG=true or DEBUG=1 environment variable is set
 *
 * @param prefix - Log prefix (from PREFIX constants)
 * @param message - Debug message
 * @param args - Additional arguments to log
 *
 * @example
 * consoleDebug(PREFIX.DEBUG, 'Detailed analysis', details)
 */
export function consoleDebug(
  prefix: string,
  message: string,
  ...args: unknown[]
): void {
  if (isDebugMode()) {
    console.debug(formatLog(prefix, message), ...args);
  }
}

/**
 * Displays data as a formatted, interactive table.
 *
 * @param prefix - Log prefix (from PREFIX constants)
 * @param message - Message to log before the table
 * @param data - Data to display in table
 * @param properties - Optional list of properties to restrict columns to
 */
export function consoleTable(
  prefix: string,
  message: string,
  data: unknown,
  properties?: string[],
): void {
  console.log(formatLog(prefix, message));
  console.table(data, properties);
}

/**
 * Displays an interactive list of an object's properties.
 *
 * @param prefix - Log prefix (from PREFIX constants)
 * @param message - Message to log before the object
 * @param obj - Object to display
 * @param options - Optional options
 */
export function consoleDir(
  prefix: string,
  message: string,
  obj: unknown,
  options?: unknown,
): void {
  console.log(formatLog(prefix, message));
  console.dir(obj, options);
}

/**
 * Displays the XML/HTML element representation of a DOM node.
 *
 * @param prefix - Log prefix (from PREFIX constants)
 * @param message - Message to log before the node
 * @param node - DOM node to display
 */
export function consoleDirxml(
  prefix: string,
  message: string,
  node: unknown,
): void {
  console.log(formatLog(prefix, message));
  console.dirxml(node);
}

/**
 * Logs an error only if the specified condition is false.
 *
 * @param condition - Condition to check
 * @param prefix - Log prefix (from PREFIX constants)
 * @param message - Message to log if condition is false
 * @param args - Additional arguments
 */
export function consoleAssert(
  condition: boolean,
  prefix: string,
  message: string,
  ...args: unknown[]
): void {
  console.assert(condition, formatLog(prefix, message), ...args);
}

/**
 * Starts a timer for tracking duration.
 *
 * @param prefix - Log prefix (from PREFIX constants)
 * @param label - Timer label
 */
export function consoleTime(prefix: string, label: string): void {
  console.time(formatLog(prefix, label));
}

/**
 * Stops the timer and logs the elapsed time.
 *
 * @param prefix - Log prefix (from PREFIX constants)
 * @param label - Timer label (must match consoleTime)
 */
export function consoleTimeEnd(prefix: string, label: string): void {
  console.timeEnd(formatLog(prefix, label));
}

/**
 * Increments and outputs a counter for a specific label.
 *
 * @param prefix - Log prefix (from PREFIX constants)
 * @param label - Counter label
 */
export function consoleCount(prefix: string, label: string): void {
  console.count(formatLog(prefix, label));
}

/**
 * Resets the counter for a specific label.
 *
 * @param prefix - Log prefix (from PREFIX constants)
 * @param label - Counter label
 */
export function consoleCountReset(prefix: string, label: string): void {
  console.countReset(formatLog(prefix, label));
}

/**
 * Creates a new, expandable message group (indented output).
 *
 * @param prefix - Log prefix (from PREFIX constants)
 * @param label - Group label
 */
export function consoleGroup(prefix: string, label: string): void {
  console.group(formatLog(prefix, label));
}

/**
 * Creates a new message group that is initially closed (collapsed).
 *
 * @param prefix - Log prefix (from PREFIX constants)
 * @param label - Group label
 */
export function consoleGroupCollapsed(prefix: string, label: string): void {
  console.groupCollapsed(formatLog(prefix, label));
}

/**
 * Closes the current message group.
 */
export function consoleGroupEnd(): void {
  console.groupEnd();
}

/**
 * Outputs a stack trace showing the call path to the current location.
 *
 * @param prefix - Log prefix (from PREFIX constants)
 * @param message - Message to log with trace
 * @param args - Additional arguments
 */
export function consoleTrace(
  prefix: string,
  message: string,
  ...args: unknown[]
): void {
  console.trace(formatLog(prefix, message), ...args);
}

/**
 * Clears all messages from the console view.
 */
export function consoleClear(): void {
  console.clear();
}

// =============================================================================
// ANSI 256-COLOR SUPPORT
// =============================================================================

/**
 * Generate ANSI 256-color foreground code
 * @param code - Color code (0-255)
 * @returns ANSI escape sequence for foreground color
 */
export function color256(code: number): string {
  return `\x1b[38;5;${code}m`;
}

/**
 * Generate ANSI 256-color background code
 * @param code - Color code (0-255)
 * @returns ANSI escape sequence for background color
 */
export function bgColor256(code: number): string {
  return `\x1b[48;5;${code}m`;
}

/**
 * Apply a light gradient (white to gray) across text
 * Creates a flowing effect from white to light gray
 * @param text - Text to apply gradient to
 * @returns Styled text with per-character gradient
 */
export function lightGradient(text: string): string {
  // Light grayscale codes: 250 (light gray) -> 255 (white) -> 250
  const codes = [250, 251, 252, 253, 254, 255, 254, 253, 252, 251];
  return (
    text
      .split("")
      .map((char, i) => `${color256(codes[i % codes.length]!)}${char}`)
      .join("") + RESET
  );
}

/**
 * Apply a custom gradient across text using ANSI 256 color codes
 * @param text - Text to apply gradient to
 * @param codes - Array of ANSI 256 color codes to cycle through
 * @returns Styled text with per-character gradient
 */
export function customGradient(text: string, codes: number[]): string {
  return (
    text
      .split("")
      .map((char, i) => `${color256(codes[i % codes.length]!)}${char}`)
      .join("") + RESET
  );
}

// =============================================================================
// DECORATIVE UNICODE CHARACTERS
// =============================================================================

/**
 * Collection of decorative Unicode characters for CLI styling
 */
export const CHARS = {
  // Box drawing (thin)
  THIN_HORIZONTAL: "─",
  THIN_VERTICAL: "│",
  THIN_TOP_LEFT: "┌",
  THIN_TOP_RIGHT: "┐",
  THIN_BOTTOM_LEFT: "└",
  THIN_BOTTOM_RIGHT: "┘",

  // Box drawing (heavy)
  HEAVY_HORIZONTAL: "━",
  HEAVY_VERTICAL: "┃",

  // Blocks
  FULL_BLOCK: "█",
  UPPER_HALF: "▀",
  LOWER_HALF: "▄",
  LEFT_HALF: "▌",
  RIGHT_HALF: "▐",

  // Geometric shapes
  DIAMOND_FILLED: "◆",
  DIAMOND_EMPTY: "◇",
  CIRCLE_FILLED: "●",
  CIRCLE_EMPTY: "○",
  SQUARE_FILLED: "■",
  SQUARE_EMPTY: "□",

  // Decorative (for hieroglyphs effect)
  DECORATIVE: "◆◇◈◉○●◐◑◒◓◔◕◖◗◘◙◚◛◜◝◞◟◠◡◢◣◤◥",

  // Status indicators
  CHECK: "✓",
  CROSS: "×",
  WARNING_SIGN: "⚠",
  INFO_SIGN: "ⓘ",
  BULLET: "•",
  ARROW_RIGHT: "→",
  ARROW_LEFT: "←",
} as const;
