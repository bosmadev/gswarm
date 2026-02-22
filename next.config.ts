import type { NextConfig } from "next";
import pkg from "./package.json" with { type: "json" };

// Check if debug mode is enabled
const isDebugMode = process.env.DEBUG === "true" || process.env.DEBUG === "1";

const nextConfig: NextConfig = {
  output: "standalone",

  // App identity from package.json (available in all components via process.env)
  env: {
    GLOBAL_APP_NAME: pkg.name,
    GLOBAL_APP_DISPLAY_NAME: pkg.displayName,
    GLOBAL_APP_DESCRIPTION: pkg.description,
    GLOBAL_APP_VERSION: pkg.version,
    GLOBAL_DEBUG_MODE: String(isDebugMode),
  },
  // Enable React Compiler for automatic memoization
  reactCompiler: true,
  // Add project-specific external packages here (e.g., bullmq, ws)
  serverExternalPackages: ["node-cron"],
  experimental: {
    optimizePackageImports: [
      "lucide-react",
      "recharts",
      "@radix-ui/react-accordion",
      "@radix-ui/react-alert-dialog",
      "@radix-ui/react-checkbox",
      "@radix-ui/react-collapsible",
      "@radix-ui/react-context-menu",
      "@radix-ui/react-dialog",
      "@radix-ui/react-dropdown-menu",
      "@radix-ui/react-hover-card",
      "@radix-ui/react-label",
      "@radix-ui/react-select",
      "@radix-ui/react-separator",
      "@radix-ui/react-slider",
      "@radix-ui/react-switch",
      "@radix-ui/react-tabs",
      "@radix-ui/react-toggle",
      "@radix-ui/react-toggle-group",
      "@radix-ui/react-tooltip",
      "@radix-ui/react-visually-hidden",
      "date-fns",
      "@dnd-kit/core",
      "@dnd-kit/sortable",
      "@dnd-kit/utilities",
      "react-hook-form",
      "sonner",
      "cmdk",
    ],
  },

  // Enable Next.js logging only in DEBUG mode, otherwise disable
  // When disabled: removes "○ Compiling..." and "GET /path 200 in Xms" messages
  // When enabled (DEBUG=true): shows full Next.js development logs with fetch details
  logging: isDebugMode
    ? {
        fetches: {
          fullUrl: true,
          hmrRefreshes: true,
        },
      }
    : false,

  // Optimize for faster builds and dev server
  reactStrictMode: true,

  // Optimize images
  images: {
    formats: ["image/avif", "image/webp"],
  },

  // Allow cross-origin requests from specific origins in development
  allowedDevOrigins: [
    "localhost",
    "127.0.0.1",
    ...(process.env.DEV_ALLOWED_ORIGIN ? [process.env.DEV_ALLOWED_ORIGIN] : []),
  ],

  // Security headers for all routes
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-XSS-Protection", value: "0" },
          {
            key: "Content-Security-Policy",
            value:
              "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains; preload",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
