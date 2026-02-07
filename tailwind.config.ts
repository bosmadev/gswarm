import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

/**
 * Tailwind CSS Configuration File
 *
 * This configuration extends Tailwind CSS with custom colors, animations,
 * and other theme extensions. Brand colors use a neutral slate palette
 * that can be customized per project.
 *
 * @module tailwind.config
 */
export default {
  /**
   * Enable dark mode via class strategy for theme toggle support
   */
  darkMode: "class",

  /**
   * Content paths for Tailwind CSS to scan for class usage.
   */
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      /**
       * Extended color palette organized into semantic groups.
       * Brand colors use neutral slate - customize per project.
       */
      colors: {
        // shadcn/ui compatible color tokens
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },

        // Brand color palette (neutral slate - customize per project)
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
          // === BRAND COLORS (Slate - customize per project) ===
          brand: "#64748b", // slate-500
          "brand-dark": "#475569", // slate-600
          "brand-light": "#94a3b8", // slate-400

          // === STATUS COLORS ===
          green: "#0ECB81", // Success/positive states
          red: "#F6465D", // Error/danger states
          blue: "#3861FB", // Informational states

          // === BACKGROUND COLORS ===
          "bg-primary": "#0B0E11", // Main background
          "bg-secondary": "#1E2329", // Secondary background
          "bg-tertiary": "#2B3139", // Tertiary background
          "bg-elevated": "#181A20", // Elevated components

          // === TEXT COLORS ===
          "text-primary": "#EAECEF", // Primary text
          "text-secondary": "#B7BDC6", // Secondary text
          "text-tertiary": "#848E9C", // Tertiary text

          // === BORDER COLORS ===
          border: "#2B3139", // Default borders
          "border-hover": "#474D57", // Hover state borders
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
      },

      /**
       * Border radius values for shadcn/ui compatibility
       */
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },

      /**
       * Custom box shadows for special effects.
       */
      boxShadow: {
        "primary-glow": "0 0 20px rgba(100, 116, 139, 0.2)", // Subtle glow (slate)
        "primary-glow-lg": "0 0 30px rgba(100, 116, 139, 0.3)", // Stronger glow
      },

      /**
       * Custom animations extending Tailwind's default animation utilities.
       */
      animation: {
        glow: "glow 2s ease-in-out infinite",
        "text-glow": "text-glow 2s ease-in-out infinite",
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "collapsible-down": "collapsible-down 0.2s ease-out",
        "collapsible-up": "collapsible-up 0.2s ease-out",
      },

      /**
       * Custom keyframes defining the animation behavior.
       */
      keyframes: {
        glow: {
          "0%, 100%": {
            boxShadow: "0 0 20px rgba(100, 116, 139, 0.2)",
          },
          "50%": {
            boxShadow:
              "0 0 30px rgba(100, 116, 139, 0.3), 0 0 40px rgba(100, 116, 139, 0.2)",
          },
        },
        "text-glow": {
          "0%, 100%": {
            textShadow:
              "0 0 4px rgba(251, 146, 60, 0.3), 0 0 8px rgba(251, 146, 60, 0.15)",
          },
          "50%": {
            textShadow:
              "0 0 8px rgba(251, 146, 60, 0.5), 0 0 16px rgba(251, 146, 60, 0.25), 0 0 24px rgba(251, 146, 60, 0.1)",
          },
        },
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "collapsible-down": {
          from: { height: "0" },
          to: { height: "var(--radix-collapsible-content-height)" },
        },
        "collapsible-up": {
          from: { height: "var(--radix-collapsible-content-height)" },
          to: { height: "0" },
        },
      },
    },
  },
  /**
   * Tailwind CSS plugins array.
   * - tailwindcss-animate: Provides animation utilities for shadcn/ui components
   */
  plugins: [tailwindcssAnimate],
} satisfies Config;
