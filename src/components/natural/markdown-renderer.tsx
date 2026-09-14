"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { Copy, Check } from "lucide-react";
import { useState, useCallback, type ReactNode } from "react";

interface MarkdownRendererProps {
  content: string;
}

/* ------------------------------------------------------------------ */
/*  Copy button for fenced code blocks                                 */
/* ------------------------------------------------------------------ */
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* silent */
    }
  }, [text]);

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="absolute top-2 right-2 flex items-center gap-1 rounded-md bg-muted/80 px-2 py-1 text-[10px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors opacity-0 group-hover:opacity-100"
      aria-label="Copy code"
    >
      {copied ? (
        <>
          <Check className="size-3 text-emerald-500" /> Copied
        </>
      ) : (
        <>
          <Copy className="size-3" /> Copy
        </>
      )}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Custom components for ReactMarkdown                                 */
/* ------------------------------------------------------------------ */
function CodeBlock({ className, children, ...props }: React.HTMLAttributes<HTMLElement> & { children?: ReactNode }) {
  const match = /language-(\w+)/.exec(className || "");
  const isInline = !match;

  if (isInline) {
    return (
      <code
        className="rounded-md bg-muted/70 px-1.5 py-0.5 text-[13px] font-mono text-foreground/90 border border-border/40"
        {...props}
      >
        {children}
      </code>
    );
  }

  const codeString = String(children).replace(/\n$/, "");

  return (
    <div className="group relative my-3 rounded-xl overflow-hidden border border-border/60 bg-[#1e1e2e] dark:bg-[#11111b]">
      {/* Language label */}
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-1.5">
        <span className="text-[10px] font-mono font-medium text-white/50 uppercase tracking-wider">
          {match[1]}
        </span>
        <CopyButton text={codeString} />
      </div>
      <pre className="overflow-x-auto p-4 text-[13px] leading-relaxed nice-scroll">
        <code className={className} {...props}>
          {children}
        </code>
      </pre>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Markdown Renderer                                             */
/* ------------------------------------------------------------------ */
export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <div className="markdown-body text-sm leading-relaxed break-words">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          code: CodeBlock,
          h1: ({ children }) => (
            <h1 className="text-xl font-bold mt-6 mb-3 text-foreground">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-lg font-bold mt-5 mb-2 text-foreground">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-base font-semibold mt-4 mb-2 text-foreground">{children}</h3>
          ),
          h4: ({ children }) => (
            <h4 className="text-sm font-semibold mt-3 mb-1.5 text-foreground">{children}</h4>
          ),
          p: ({ children }) => (
            <p className="mb-3 last:mb-0 text-foreground/90">{children}</p>
          ),
          ul: ({ children }) => (
            <ul className="mb-3 ml-4 list-disc space-y-1 text-foreground/90 marker:text-muted-foreground">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="mb-3 ml-4 list-decimal space-y-1 text-foreground/90 marker:text-muted-foreground">
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li className="pl-1 leading-relaxed">{children}</li>
          ),
          blockquote: ({ children }) => (
            <blockquote className="my-3 border-l-4 border-primary/40 bg-muted/40 pl-4 py-2 pr-3 rounded-r-lg text-foreground/80 italic">
              {children}
            </blockquote>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline underline-offset-2 decoration-primary/30 hover:decoration-primary transition-colors"
            >
              {children}
            </a>
          ),
          strong: ({ children }) => (
            <strong className="font-semibold text-foreground">{children}</strong>
          ),
          em: ({ children }) => (
            <em className="italic text-foreground/85">{children}</em>
          ),
          hr: () => (
            <hr className="my-4 border-border/60" />
          ),
          table: ({ children }) => (
            <div className="my-3 overflow-x-auto rounded-lg border border-border/60">
              <table className="w-full text-sm">{children}</table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-muted/50 border-b border-border/60">{children}</thead>
          ),
          tbody: ({ children }) => (
            <tbody className="divide-y divide-border/40">{children}</tbody>
          ),
          tr: ({ children }) => (
            <tr className="hover:bg-muted/30 transition-colors">{children}</tr>
          ),
          th: ({ children }) => (
            <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="px-3 py-2 text-foreground/90 whitespace-nowrap">{children}</td>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
