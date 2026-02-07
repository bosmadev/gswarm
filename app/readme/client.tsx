"use client";

/**
 * README Page Client Component
 *
 * Renders the README content with GitHub-style dark theme,
 * Mermaid diagrams, syntax highlighting, and floating TOC.
 *
 * Performance optimizations:
 * - ReactMarkdown loaded via next/dynamic (deferred ~50KB)
 * - remarkGfm and rehypeRaw lazy-loaded as plugins
 * - Shiki highlighter cached across all CodeBlock instances
 * - Mermaid instance cached and re-used across all diagrams
 */

import {
  Check,
  Copy,
  Expand,
  FileText,
  List,
  Minus,
  Plus,
  RotateCcw,
} from "lucide-react";
import dynamic from "next/dynamic";
import Image from "next/image";
import { useEffect, useId, useRef, useState } from "react";
import type { Components } from "react-markdown";
import SharedLayout from "@/app/shared";
import { useTheme } from "@/components/providers";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

// =============================================================================
// Lazy-loaded ReactMarkdown (defers ~50KB from initial bundle)
// =============================================================================

const ReactMarkdown = dynamic(
  () => import("react-markdown").then((m) => m.default),
  {
    loading: () => (
      <div className="animate-pulse space-y-4">
        <div className="h-4 bg-bg-tertiary rounded w-3/4" />
        <div className="h-4 bg-bg-tertiary rounded w-full" />
        <div className="h-4 bg-bg-tertiary rounded w-1/2" />
      </div>
    ),
    ssr: false,
  },
);

// =============================================================================
// Cached Shiki Highlighter (created once, reused across all CodeBlock instances)
// =============================================================================

let cachedCodeToHtml: typeof import("shiki").codeToHtml | null = null;

async function getCodeToHtml() {
  if (!cachedCodeToHtml) {
    const { codeToHtml } = await import("shiki");
    cachedCodeToHtml = codeToHtml;
  }
  return cachedCodeToHtml;
}

// =============================================================================
// Cached Mermaid Instance (initialized once, reused across all diagrams)
// =============================================================================

let cachedMermaid: typeof import("mermaid").default | null = null;
let cachedMermaidTheme: string | null = null;

async function getMermaid(theme: string) {
  const isDark = theme === "dark" || theme === "system";
  const themeKey = isDark ? "dark" : "light";

  if (!cachedMermaid || cachedMermaidTheme !== themeKey) {
    const { default: mermaid } = await import("mermaid");
    mermaid.initialize({
      startOnLoad: false,
      theme: isDark ? "dark" : "default",
      themeVariables: isDark
        ? {
            primaryColor: "#64748b",
            primaryTextColor: "#eaecef",
            primaryBorderColor: "#2b3139",
            lineColor: "#848e9c",
            secondaryColor: "#1e2329",
            tertiaryColor: "#2b3139",
            background: "#0b0e11",
            mainBkg: "#1e2329",
            nodeBorder: "#2b3139",
            clusterBkg: "#1e2329",
            clusterBorder: "#2b3139",
            titleColor: "#eaecef",
            edgeLabelBackground: "#1e2329",
          }
        : undefined,
      securityLevel: "loose",
      fontFamily: "ui-sans-serif, system-ui, sans-serif",
    });
    cachedMermaid = mermaid;
    cachedMermaidTheme = themeKey;
  }

  return cachedMermaid;
}

// =============================================================================
// SafeHtml Component - Renders sanitized HTML from trusted sources
// =============================================================================

function SafeHtml({ html, className }: { html: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.innerHTML = html;
    }
  }, [html]);

  return <div ref={ref} className={className} />;
}

// =============================================================================
// CodeBlock Component - Shiki Syntax Highlighting (cached)
// =============================================================================

function CodeBlock({
  code,
  language,
  className = "",
}: {
  code: string;
  language: string;
  className?: string;
}) {
  const [highlightedHtml, setHighlightedHtml] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const highlightCode = async () => {
      try {
        setIsLoading(true);
        const codeToHtml = await getCodeToHtml();
        const html = await codeToHtml(code, {
          lang: language || "text",
          theme: "github-dark",
        });

        if (isMounted) {
          setHighlightedHtml(html);
          setIsLoading(false);
        }
      } catch {
        if (isMounted) {
          setHighlightedHtml("");
          setIsLoading(false);
        }
      }
    };

    highlightCode();
    return () => {
      isMounted = false;
    };
  }, [code, language]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={`relative group my-4 ${className}`}>
      <div className="flex items-center justify-between px-4 py-2 bg-bg-secondary border border-border border-b-0 rounded-t-md">
        <span className="text-xs text-text-tertiary font-mono">
          {language || "text"}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1.5 px-2 py-1 text-xs text-text-tertiary hover:text-text-primary bg-bg-tertiary hover:bg-border-hover rounded transition-colors"
          title="Copy code"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-green-500" />
              Copied!
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              Copy
            </>
          )}
        </button>
      </div>
      <div className="overflow-x-auto bg-bg-primary border border-border border-t-0 rounded-b-md">
        {isLoading ? (
          <pre className="p-4">
            <code className="text-sm font-mono text-text-primary">{code}</code>
          </pre>
        ) : highlightedHtml ? (
          <SafeHtml
            html={highlightedHtml}
            className="shiki-container [&>pre]:p-4 [&>pre]:m-0 [&>pre]:bg-transparent [&_code]:text-sm [&_code]:font-mono"
          />
        ) : (
          <pre className="p-4">
            <code className="text-sm font-mono text-text-primary">{code}</code>
          </pre>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// MermaidRenderer Component - Mermaid Diagrams with Zoom Modal (cached)
// =============================================================================

function MermaidRenderer({
  code,
  className = "",
}: {
  code: string;
  className?: string;
}) {
  const { theme } = useTheme();
  const [svg, setSvg] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const uniqueId = useId().replace(/:/g, "-");

  useEffect(() => {
    let isMounted = true;

    const renderDiagram = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const mermaid = await getMermaid(theme);

        const { svg: renderedSvg } = await mermaid.render(
          `mermaid-${uniqueId}`,
          code.trim(),
        );

        if (isMounted) {
          setSvg(renderedSvg);
          setIsLoading(false);
        }
      } catch (err) {
        if (isMounted) {
          setError(
            err instanceof Error ? err.message : "Failed to render diagram",
          );
          setIsLoading(false);
        }
      }
    };

    renderDiagram();
    return () => {
      isMounted = false;
    };
  }, [code, theme, uniqueId]);

  if (isLoading) {
    return (
      <div
        className={`flex items-center justify-center p-8 rounded-lg bg-bg-secondary border border-border ${className}`}
      >
        <div className="flex items-center gap-3 text-text-tertiary">
          <div className="w-5 h-5 border-2 border-brand/30 border-t-brand rounded-full animate-spin" />
          <span className="text-sm">Rendering diagram...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className={`p-4 rounded-lg bg-red/10 border border-red/30 ${className}`}
      >
        <p className="text-sm text-red-500 font-medium mb-2">
          Failed to render Mermaid diagram
        </p>
        <pre className="text-xs text-red-500/70 overflow-x-auto">{error}</pre>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        className={`group relative w-full overflow-x-auto p-4 rounded-lg bg-bg-secondary border border-border cursor-pointer hover:border-border-hover transition-colors text-left ${className}`}
        onClick={() => setIsModalOpen(true)}
        title="Click to expand"
      >
        <span className="absolute top-2 right-2 p-1.5 rounded bg-bg-tertiary border border-border opacity-0 group-hover:opacity-100 transition-opacity">
          <Expand className="w-4 h-4 text-text-tertiary" />
        </span>
        <SafeHtml html={svg} className="mermaid-container" />
      </button>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-[95vw] max-h-[95vh] w-full h-full bg-bg-primary border-border">
          <DialogHeader className="flex flex-row items-center justify-between">
            <DialogTitle className="text-text-primary">
              Mermaid Diagram
            </DialogTitle>
            <div className="flex items-center gap-2 mr-8">
              <button
                type="button"
                onClick={() => setZoom((z) => Math.max(z - 0.25, 0.5))}
                className="p-1.5 rounded bg-bg-tertiary border border-border hover:bg-border-hover transition-colors"
                title="Zoom out"
              >
                <Minus className="w-4 h-4 text-text-tertiary" />
              </button>
              <span className="text-sm text-text-tertiary w-12 text-center">
                {Math.round(zoom * 100)}%
              </span>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.min(z + 0.25, 3))}
                className="p-1.5 rounded bg-bg-tertiary border border-border hover:bg-border-hover transition-colors"
                title="Zoom in"
              >
                <Plus className="w-4 h-4 text-text-tertiary" />
              </button>
              <button
                type="button"
                onClick={() => setZoom(1)}
                className="p-1.5 rounded bg-bg-tertiary border border-border hover:bg-border-hover transition-colors"
                title="Reset zoom"
              >
                <RotateCcw className="w-4 h-4 text-text-tertiary" />
              </button>
            </div>
          </DialogHeader>
          <div className="flex-1 overflow-auto p-4">
            <div
              className="transition-transform duration-200 origin-top-left"
              style={{ transform: `scale(${zoom})` }}
            >
              <SafeHtml html={svg} />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// =============================================================================
// TableOfContents Component - Floating TOC with Sheet Drawer
// =============================================================================

interface TocItem {
  id: string;
  text: string;
  level: number;
}

function extractHeadings(content: string): TocItem[] {
  const headingRegex = /^(#{1,6})\s+(.+)$/gm;
  const headings: TocItem[] = [];

  for (const match of content.matchAll(headingRegex)) {
    const level = match[1].length;
    const text = match[2]
      .replace(/\*\*/g, "")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/[\u{1F300}-\u{1F9FF}]/gu, "")
      .trim();

    const id = text
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .trim();

    if (id && text) {
      headings.push({ id, text, level });
    }
  }

  return headings;
}

function TableOfContents({ content }: { content: string }) {
  const [headings, setHeadings] = useState<TocItem[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    setHeadings(extractHeadings(content));
  }, [content]);

  useEffect(() => {
    if (headings.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        }
      },
      { rootMargin: "-80px 0px -80% 0px", threshold: 0 },
    );

    for (const heading of headings) {
      const element = document.getElementById(heading.id);
      if (element) observer.observe(element);
    }

    return () => observer.disconnect();
  }, [headings]);

  const handleClick = (id: string) => {
    setIsOpen(false);
    setTimeout(() => {
      const element = document.getElementById(id);
      if (element) {
        const headerOffset = 100;
        const elementPosition = element.getBoundingClientRect().top;
        const offsetPosition = elementPosition + window.scrollY - headerOffset;

        window.scrollTo({
          top: offsetPosition,
          behavior: "smooth",
        });

        window.history.pushState(null, "", `#${id}`);
        setActiveId(id);
      }
    }, 150);
  };

  const visibleHeadings = headings.filter((h) => h.level <= 3);

  if (visibleHeadings.length === 0) return null;

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          className="fixed top-24 right-4 z-50 p-3 rounded-full bg-brand text-white shadow-lg hover:bg-brand-light transition-all hover:scale-105"
          title="Table of Contents"
        >
          <List className="w-5 h-5" />
        </button>
      </SheetTrigger>
      <SheetContent
        side="right"
        className="w-80 bg-bg-primary border-border overflow-hidden"
      >
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 text-text-primary">
            <List className="w-5 h-5 text-brand" />
            Table of Contents
          </SheetTitle>
        </SheetHeader>
        <nav className="mt-4 space-y-1 max-h-[calc(100vh-120px)] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
          {visibleHeadings.map((heading) => (
            <button
              key={heading.id}
              type="button"
              onClick={() => handleClick(heading.id)}
              className={`
                block w-full text-left text-sm py-2 px-3 rounded transition-all
                ${heading.level === 1 ? "pl-3 font-medium" : ""}
                ${heading.level === 2 ? "pl-5" : ""}
                ${heading.level === 3 ? "pl-7 text-xs" : ""}
                ${
                  activeId === heading.id
                    ? "text-brand bg-brand/10 border-l-2 border-brand"
                    : "text-text-tertiary hover:text-text-primary hover:bg-bg-secondary"
                }
              `}
              title={heading.text}
            >
              <span className="line-clamp-2">{heading.text}</span>
            </button>
          ))}
        </nav>
      </SheetContent>
    </Sheet>
  );
}

// =============================================================================
// MarkdownImage Component - Image with Badge Detection
// =============================================================================

function MarkdownImage({ src, alt }: { src?: string | Blob; alt?: string }) {
  const srcString = typeof src === "string" ? src : undefined;
  if (!srcString) return null;

  const isBadge =
    srcString.includes("shields.io") ||
    srcString.includes("badge") ||
    alt?.toLowerCase().includes("badge");

  if (isBadge) {
    return (
      <Image
        src={srcString}
        alt={alt || ""}
        width={120}
        height={20}
        className="inline-block h-5 w-auto"
        unoptimized
      />
    );
  }

  return (
    <span className="block my-6">
      <Image
        src={srcString}
        alt={alt || ""}
        width={800}
        height={400}
        className="max-w-full h-auto rounded-lg border border-border"
        unoptimized
      />
      {alt && (
        <span className="block text-center text-sm text-text-tertiary mt-2 italic">
          {alt}
        </span>
      )}
    </span>
  );
}

// =============================================================================
// Markdown Components Configuration
// =============================================================================

function generateHeadingId(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
}

const markdownComponents: Components = {
  h1: ({ children }) => {
    const id = generateHeadingId(String(children));
    return (
      <h1
        id={id}
        className="text-[32px] font-semibold text-text-primary mt-8 mb-4 pb-2 border-b border-border scroll-mt-20"
      >
        {children}
      </h1>
    );
  },
  h2: ({ children }) => {
    const id = generateHeadingId(String(children));
    return (
      <h2
        id={id}
        className="text-2xl font-semibold text-text-primary mt-8 mb-4 pb-2 border-b border-border scroll-mt-20"
      >
        {children}
      </h2>
    );
  },
  h3: ({ children }) => {
    const id = generateHeadingId(String(children));
    return (
      <h3
        id={id}
        className="text-xl font-semibold text-text-primary mt-6 mb-3 scroll-mt-20"
      >
        {children}
      </h3>
    );
  },
  h4: ({ children }) => {
    const id = generateHeadingId(String(children));
    return (
      <h4
        id={id}
        className="text-base font-semibold text-text-primary mt-6 mb-3 scroll-mt-20"
      >
        {children}
      </h4>
    );
  },
  h5: ({ children }) => (
    <h5 className="text-sm font-semibold text-text-primary mt-4 mb-2">
      {children}
    </h5>
  ),
  h6: ({ children }) => (
    <h6 className="text-sm font-semibold text-text-tertiary mt-4 mb-2">
      {children}
    </h6>
  ),
  p: ({ children }) => (
    <p className="text-text-primary leading-relaxed mb-4">{children}</p>
  ),
  a: ({ href, children }) => (
    <a
      href={href}
      className="text-blue-500 hover:underline"
      target={href?.startsWith("http") ? "_blank" : undefined}
      rel={href?.startsWith("http") ? "noopener noreferrer" : undefined}
    >
      {children}
    </a>
  ),
  ul: ({ children }) => (
    <ul className="list-disc list-outside space-y-1 mb-4 text-text-primary pl-6">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="list-decimal list-outside space-y-1 mb-4 text-text-primary pl-6">
      {children}
    </ol>
  ),
  li: ({ children }) => <li className="leading-relaxed pl-1">{children}</li>,
  code: ({ className, children }) => {
    const match = /language-(\w+)/.exec(className || "");
    const language = match ? match[1] : "";
    const codeContent = String(children).replace(/\n$/, "");

    if (language === "mermaid") {
      return <MermaidRenderer code={codeContent} className="my-6" />;
    }

    if (!className) {
      return (
        <code className="px-1.5 py-0.5 rounded-md bg-bg-tertiary text-text-primary text-sm font-mono">
          {children}
        </code>
      );
    }

    return <CodeBlock code={codeContent} language={language} />;
  },
  pre: ({ children }) => <>{children}</>,
  blockquote: ({ children }) => (
    <blockquote className="border-l-4 border-border-hover pl-4 py-1 my-4 text-text-tertiary">
      {children}
    </blockquote>
  ),
  table: ({ children }) => (
    <div className="overflow-x-auto my-6">
      <table className="w-full border-collapse text-sm border border-border">
        {children}
      </table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="bg-bg-secondary">{children}</thead>
  ),
  tbody: ({ children }) => <tbody>{children}</tbody>,
  tr: ({ children }) => (
    <tr className="border-b border-border hover:bg-bg-secondary/50">
      {children}
    </tr>
  ),
  th: ({ children }) => (
    <th className="px-4 py-3 text-left font-semibold text-text-primary border border-border">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="px-4 py-3 text-text-primary border border-border">
      {children}
    </td>
  ),
  hr: () => <hr className="my-6 border-border" />,
  img: ({ src, alt }) => <MarkdownImage src={src} alt={alt} />,
  strong: ({ children }) => (
    <strong className="font-semibold text-text-primary">{children}</strong>
  ),
  em: ({ children }) => <em className="italic">{children}</em>,
  input: ({ checked }) => (
    <input
      type="checkbox"
      checked={checked}
      readOnly
      className="mr-2 accent-green-500"
    />
  ),
  div: ({ children, ...props }) => {
    const alignAttr = (props as Record<string, unknown>).align as
      | string
      | undefined;
    if (alignAttr === "center") {
      return <div className="text-center">{children}</div>;
    }
    return <div {...props}>{children}</div>;
  },
};

// =============================================================================
// Main Page Component
// =============================================================================

interface ReadmePageClientProps {
  content: string;
}

export function ReadmePageClient({ content }: ReadmePageClientProps) {
  const [isClient, setIsClient] = useState(false);
  const [plugins, setPlugins] = useState<{
    remarkGfm?: typeof import("remark-gfm").default;
    rehypeRaw?: typeof import("rehype-raw").default;
  }>({});

  useEffect(() => {
    setIsClient(true);
  }, []);

  // Lazy-load markdown plugins in parallel
  useEffect(() => {
    Promise.all([
      import("remark-gfm").then((m) => m.default),
      import("rehype-raw").then((m) => m.default),
    ]).then(([gfm, raw]) => {
      setPlugins({ remarkGfm: gfm, rehypeRaw: raw });
    });
  }, []);

  return (
    <SharedLayout>
      {/* Page Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-lg bg-bg-tertiary border border-border">
            <FileText className="w-5 h-5 text-brand" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-text-primary">
              Documentation
            </h1>
            <p className="text-sm text-text-tertiary">
              System overview and technical documentation
            </p>
          </div>
        </div>
      </div>

      {/* Main Content - Full Width with Solid Background */}
      <article className="w-full">
        <div className="bg-bg-primary border border-border rounded-lg p-6 md:p-10 min-h-[80vh]">
          {!isClient ? (
            <div className="space-y-6 animate-pulse">
              <div className="h-10 bg-bg-tertiary rounded w-3/4" />
              <div className="h-4 bg-bg-tertiary rounded w-full" />
              <div className="h-4 bg-bg-tertiary rounded w-5/6" />
              <div className="h-4 bg-bg-tertiary rounded w-4/6" />
              <div className="h-8 bg-bg-tertiary rounded w-1/2 mt-8" />
              <div className="h-4 bg-bg-tertiary rounded w-full" />
              <div className="h-4 bg-bg-tertiary rounded w-3/4" />
              <div className="h-32 bg-bg-tertiary rounded w-full" />
              <div className="h-4 bg-bg-tertiary rounded w-5/6" />
              <div className="h-4 bg-bg-tertiary rounded w-2/3" />
            </div>
          ) : (
            <div className="github-markdown">
              <ReactMarkdown
                remarkPlugins={plugins.remarkGfm ? [plugins.remarkGfm] : []}
                rehypePlugins={plugins.rehypeRaw ? [plugins.rehypeRaw] : []}
                components={markdownComponents}
              >
                {content}
              </ReactMarkdown>
            </div>
          )}
        </div>
      </article>

      {/* Floating TOC Button - only show after hydration */}
      {isClient && <TableOfContents content={content} />}
    </SharedLayout>
  );
}
