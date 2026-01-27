import { promises as fs } from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import { ReadmePageClient } from "./readme/client";

export const metadata: Metadata = {
  title: "GSwarm API | Documentation",
  description: "GSwarm API documentation and system overview",
};

/**
 * Home Page
 *
 * Server component that reads the README.md file and renders it as the homepage.
 * Uses the existing ReadmePageClient component for consistent markdown rendering.
 */
export default async function Home() {
  const readmePath = path.join(process.cwd(), "README.md");

  let content: string;
  try {
    content = await fs.readFile(readmePath, "utf-8");
  } catch {
    content = "# README not found\n\nThe README.md file could not be loaded.";
  }

  return <ReadmePageClient content={content} />;
}
