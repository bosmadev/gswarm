/// <reference types="vitest" />

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true, // Allows using describe/expect without imports
    environment: "happy-dom", // The simulation (no real browser needed)
    exclude: ["**/node_modules/**"],
  },
});
