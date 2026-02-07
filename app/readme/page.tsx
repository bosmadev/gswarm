import { promises as fs } from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import { ReadmePageClient } from "./client";

export const metadata: Metadata = {
  title: "README | GSwarm API",
  description: "GSwarm API documentation and system overview",
};

/**
 * README Page
 *
 * Server component that reads the README.md file and passes it to the client component.
 * Uses Next.js file system APIs to read the markdown at request time.
 */
export default async function ReadmePage() {
  const readmePath = path.join(process.cwd(), "README.md");

  let content: string;
  try {
    content = await fs.readFile(readmePath, "utf-8");
  } catch {
    content = "# README not found\n\nThe README.md file could not be loaded.";
  }

  return <ReadmePageClient content={content} />;
}
