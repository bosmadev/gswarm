/**
 * @file components/ui/service-icons.tsx
 * @description SVG icons for external services used in the dashboard status indicators.
 */

import { cn } from "@/lib/utils";

interface IconProps {
  className?: string;
  size?: number;
}

/**
 * Binance logo icon
 */
export function BinanceIcon({ className, size = 16 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 126 126"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("text-[#F0B90B]", className)}
      aria-hidden="true"
    >
      <title>Binance</title>
      <path
        d="M38.171 53.203L62.759 28.616L87.36 53.216L101.667 38.909L62.759 0L23.864 38.896L38.171 53.203Z"
        fill="currentColor"
      />
      <path
        d="M0 62.759L14.307 48.452L28.614 62.759L14.307 77.066L0 62.759Z"
        fill="currentColor"
      />
      <path
        d="M38.171 72.328L62.759 96.916L87.36 72.316L101.674 86.609L62.759 125.518L23.864 86.622L38.171 72.328Z"
        fill="currentColor"
      />
      <path
        d="M96.903 62.772L111.21 48.465L125.517 62.772L111.21 77.079L96.903 62.772Z"
        fill="currentColor"
      />
      <path
        d="M77.093 62.746L62.759 48.398L48.438 62.706L48.438 62.786L62.759 77.106L77.093 62.746Z"
        fill="currentColor"
      />
    </svg>
  );
}

/**
 * MongoDB logo icon
 */
export function MongoDBIcon({ className, size = 16 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("text-[#00ED64]", className)}
      aria-hidden="true"
    >
      <title>MongoDB</title>
      <path
        d="M12 2C12 2 12.5 7 12.5 12C12.5 17 12 22 12 22"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M12 6C14.5 7 16 9.5 16 12C16 14.5 14.5 17 12 18"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M12 6C9.5 7 8 9.5 8 12C8 14.5 9.5 17 12 18"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Redis logo icon
 */
export function RedisIcon({ className, size = 16 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("text-[#DC382D]", className)}
      aria-hidden="true"
    >
      <title>Redis</title>
      <path d="M12 4L3 8L12 12L21 8L12 4Z" fill="currentColor" />
      <path
        d="M3 12L12 16L21 12"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M3 16L12 20L21 16"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Google AI / Gemini sparkle icon
 */
export function GeminiIcon({ className, size = 16 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("text-[#8E75B2]", className)}
      aria-hidden="true"
    >
      <title>Google AI Studio</title>
      <path
        d="M12 2L14 10L22 12L14 14L12 22L10 14L2 12L10 10L12 2Z"
        fill="currentColor"
      />
    </svg>
  );
}

/**
 * Vertex AI icon (used internally for AI status differentiation)
 */
function VertexAIIcon({ className, size = 16 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("text-[#4285F4]", className)}
      aria-hidden="true"
    >
      <title>Vertex AI</title>
      <path
        d="M12 2L2 7L12 12L22 7L12 2Z"
        fill="currentColor"
        fillOpacity="0.9"
      />
      <path
        d="M2 17L12 22L22 17"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M2 12L12 17L22 12"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// Re-export for potential future use
export { VertexAIIcon };

/**
 * SearXNG search icon (used internally)
 */
function SearXNGIcon({ className, size = 16 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("text-[#3050FF]", className)}
      aria-hidden="true"
    >
      <title>SearXNG</title>
      <circle
        cx="11"
        cy="11"
        r="7"
        stroke="currentColor"
        strokeWidth="2"
        fill="none"
      />
      <path
        d="M16 16L21 21"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="11" cy="11" r="3" fill="currentColor" fillOpacity="0.3" />
    </svg>
  );
}

// Re-export for potential future use
export { SearXNGIcon };

/**
 * News icon
 */
export function NewsIcon({ className, size = 16 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("text-text-secondary", className)}
      aria-hidden="true"
    >
      <title>News</title>
      <rect
        x="3"
        y="3"
        width="18"
        height="18"
        rx="2"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M7 7H12"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M7 11H17"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M7 15H17"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <rect
        x="14"
        y="6"
        width="3"
        height="3"
        fill="currentColor"
        fillOpacity="0.5"
      />
    </svg>
  );
}

/**
 * Worker cog icon
 */
export function WorkerIcon({ className, size = 16 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <title>Worker</title>
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
      <path
        d="M12 1V4M12 20V23M4.22 4.22L6.34 6.34M17.66 17.66L19.78 19.78M1 12H4M20 12H23M4.22 19.78L6.34 17.66M17.66 6.34L19.78 4.22"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * ML/Brain icon for ML Worker (used internally)
 */
function MLWorkerIcon({ className, size = 16 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <title>ML Worker</title>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
      <path
        d="M12 7V12L15 15"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="2" fill="currentColor" />
    </svg>
  );
}

// Re-export for potential future use
export { MLWorkerIcon };

/**
 * Google Search icon for grounding (used internally)
 */
function GoogleSearchIcon({ className, size = 16 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <title>Google Search</title>
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

// Re-export for potential future use
export { GoogleSearchIcon };
