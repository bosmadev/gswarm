import type { NextConfig } from "next";

// Check if debug mode is enabled
const isDebugMode = process.env.DEBUG === "true" || process.env.DEBUG === "1";

const nextConfig: NextConfig = {
  output: "standalone",
  // Enable React Compiler when babel-plugin-react-compiler is installed
  // reactCompiler: true,
  // Add project-specific external packages here (e.g., bullmq, ws)
  serverExternalPackages: [],
  experimental: {
    optimizePackageImports: ["lucide-react"],
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
  allowedDevOrigins: ["localhost", "127.0.0.1"],
};

export default nextConfig;
