"use client";

import { useEffect, useRef, useState } from "react";
import { FileText } from "lucide-react";
import { formatBytes } from "@/lib/file-utils";
import { cn } from "@/lib/utils";

interface WhatsAppDocCardProps {
  url: string;
  name: string;
  size?: number | null;
  mime?: string | null;
  own: boolean;
  onClick: () => void;
}

/**
 * WhatsApp-style Document Card:
 * Responsive and strictly bounded width (w-full max-w-[240px] sm:max-w-[280px])
 * so it never overflows or causes horizontal scrolling on mobile!
 */
export function WhatsAppDocCard({
  url,
  name,
  size,
  mime,
  own,
  onClick,
}: WhatsAppDocCardProps) {
  const ext = name.split(".").pop()?.toUpperCase() || "DOC";
  const isPdf = mime?.toLowerCase() === "application/pdf" || ext === "PDF";
  const isDocx =
    ext === "DOCX" ||
    ext === "DOC" ||
    mime?.includes("wordprocessingml") ||
    mime?.includes("msword");
  const isExcel =
    ext === "XLSX" ||
    ext === "XLS" ||
    ext === "CSV" ||
    mime?.includes("spreadsheet") ||
    mime?.includes("excel");

  const [pdfThumbnail, setPdfThumbnail] = useState<string | null>(null);
  const [pageCount, setPageCount] = useState<number | null>(null);

  useEffect(() => {
    if (!isPdf) return;
    let cancelled = false;

    const renderThumb = async () => {
      try {
        let pdfjsLib = (window as any).pdfjsLib;
        if (!pdfjsLib) {
          await new Promise<void>((resolve, reject) => {
            const script = document.createElement("script");
            script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
            script.onload = () => resolve();
            script.onerror = () => reject(new Error("pdfjs load failed"));
            document.head.appendChild(script);
          });
          pdfjsLib = (window as any).pdfjsLib;
          if (pdfjsLib) {
            pdfjsLib.GlobalWorkerOptions.workerSrc =
              "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
          }
        }

        if (cancelled || !pdfjsLib) return;

        const loadingTask = pdfjsLib.getDocument({
          url,
          withCredentials: false,
        });

        const doc = await loadingTask.promise;
        if (cancelled) return;
        setPageCount(doc.numPages);

        const page = await doc.getPage(1);
        if (cancelled) return;

        const viewport = page.getViewport({ scale: 0.5 });
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        canvas.height = viewport.height;
        canvas.width = viewport.width;

        await page.render({
          canvasContext: ctx,
          viewport,
        }).promise;

        if (!cancelled) {
          setPdfThumbnail(canvas.toDataURL("image/jpeg", 0.75));
        }
      } catch {
        // graceful fallback to icon
      }
    };

    renderThumb();

    return () => {
      cancelled = true;
    };
  }, [url, isPdf]);

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full max-w-[240px] sm:max-w-[280px] text-left rounded-xl overflow-hidden transition-all duration-150 cursor-pointer block select-none group/card",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
        own
          ? "bg-black/10 hover:bg-black/15"
          : "bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10"
      )}
    >
      {/* 1. PDF Page 1 Preview Banner */}
      {isPdf && (
        <div className="w-full h-24 sm:h-28 bg-white/95 relative overflow-hidden border-b border-black/10 flex items-start justify-center">
          {pdfThumbnail ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={pdfThumbnail}
              alt="Page 1 preview"
              className="w-full h-full object-cover object-top select-none group-hover/card:scale-[1.02] transition-transform duration-200"
            />
          ) : (
            <div className="size-full flex flex-col items-center justify-center gap-1 text-slate-400 bg-slate-50">
              <span className="text-2xl">📄</span>
              <span className="text-[10px] font-medium tracking-wide uppercase text-slate-500">PDF Document</span>
            </div>
          )}
          <div className="absolute top-0 right-0 size-3.5 bg-gradient-to-bl from-black/20 to-transparent pointer-events-none" />
        </div>
      )}

      {/* 2. Document Info Row */}
      <div className="p-2 sm:p-2.5 flex items-center gap-2.5">
        {!isPdf && (
          <div
            className={cn(
              "size-9 sm:size-10 rounded-lg shrink-0 flex items-center justify-center font-bold text-white shadow-xs select-none",
              isDocx && "bg-[#2b579a]",
              isExcel && "bg-[#217346]",
              !isDocx && !isExcel && "bg-slate-700"
            )}
          >
            {isDocx ? (
              <span className="text-sm sm:text-base tracking-tighter">W</span>
            ) : isExcel ? (
              <span className="text-sm sm:text-base tracking-tighter">X</span>
            ) : (
              <FileText className="size-4 sm:size-5" />
            )}
          </div>
        )}

        <div className="min-w-0 flex-1">
          <p className="truncate text-xs sm:text-[13px] font-medium leading-tight text-foreground" title={name}>
            {name}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1.5 truncate">
            {pageCount ? <span>{pageCount} {pageCount === 1 ? "page" : "pages"}</span> : null}
            {pageCount ? <span>•</span> : null}
            <span>{formatBytes(size)}</span>
            <span>•</span>
            <span className="uppercase font-semibold text-[10px] opacity-90">{ext}</span>
          </p>
        </div>
      </div>
    </button>
  );
}
