import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

import {
  CommandPaletteProvider,
  ConfirmationProvider,
  FontProvider,
  NotificationProvider,
  ThemeProvider,
} from "@/components/providers";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

// Optimized Google Fonts via next/font (self-hosted, no external requests)
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Next.js Template",
  description: "Next.js 16+ template with Biome, Knip, Vitest, and Tailwind v4",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${jetbrainsMono.variable}`}
    >
      <body>
        <ThemeProvider defaultTheme="dark" storageKey="app-theme">
          <FontProvider>
            <TooltipProvider delayDuration={300}>
              <NotificationProvider>
                <ConfirmationProvider>
                  <CommandPaletteProvider>
                    {children}
                    <Toaster />
                  </CommandPaletteProvider>
                </ConfirmationProvider>
              </NotificationProvider>
            </TooltipProvider>
          </FontProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
