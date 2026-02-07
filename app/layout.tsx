import type { Metadata } from "next";
import { JetBrains_Mono, Nunito } from "next/font/google";
import Script from "next/script";
import "./globals.css";

import {
  CommandPaletteProvider,
  ConfirmationProvider,
  FontProvider,
  NotificationProvider,
  ReactGrabProvider,
  ThemeProvider,
} from "@/components/providers";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

// DEBUG mode gate — only true when DEBUG=true is set (launch script Option 1)
const isDebug = process.env.DEBUG === "true" || process.env.DEBUG === "1";

// Optimized Google Fonts via next/font (self-hosted, no external requests)
const nunito = Nunito({
  subsets: ["latin"],
  variable: "--font-nunito",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: process.env.GLOBAL_APP_DISPLAY_NAME,
  description: process.env.GLOBAL_APP_DESCRIPTION,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${nunito.variable} ${jetbrainsMono.variable}`}
    >
      <head>
        {isDebug && (
          <>
            <Script
              src="//unpkg.com/react-grab/dist/index.global.js"
              crossOrigin="anonymous"
              strategy="beforeInteractive"
            />
            <Script
              src="//unpkg.com/@react-grab/claude-code/dist/client.global.js"
              crossOrigin="anonymous"
              strategy="lazyOnload"
            />
          </>
        )}
      </head>
      <body>
        <ThemeProvider defaultTheme="dark" storageKey="app-theme">
          <FontProvider>
            <TooltipProvider delayDuration={300}>
              <NotificationProvider>
                <ConfirmationProvider>
                  <CommandPaletteProvider>
                    <ReactGrabProvider>
                      {children}
                      <Toaster />
                    </ReactGrabProvider>
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
