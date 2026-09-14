"use client";

import { useEffect, useRef, useState } from "react";
import {
  Download,
  ExternalLink,
  Loader2,
  Music,
  Video,
  X,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  AlertCircle,
  FileSpreadsheet,
} from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatBytes, iconForFile } from "@/lib/file-utils";

export interface FileViewerTarget {
  url: string;
  name: string;
  size?: number | null;
  mime?: string | null;
  kind: "image" | "video" | "audio" | "document" | "text" | "system";
}

interface FileViewerModalProps {
  file: FileViewerTarget | null;
  onClose: () => void;
}

/**
 * Universal In-App Document & Media Viewer:
 * 1. PDF: Mozilla PDF.js canvas renderer (with page nav, zoom in/out, and fallbacks)
 * 2. Word (.docx / .doc): Rendered directly into HTML via docx-preview client engine
 * 3. Excel (.xlsx / .xls / .csv): Rendered into styled interactive spreadsheets via SheetJS
 * 4. Images: Pan/zoom lightbox
 * 5. Videos: Full HTML5 video player with controls
 * 6. Audio/Voice notes: Player card with metadata
 * 7. Text/Code (.txt, .json, .md, .js, .py, etc.): Formatted readable text viewer
 */
export function FileViewerModal({ file, onClose }: FileViewerModalProps) {
  if (!file) return null;

  return (
    <Dialog open={!!file} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        hideDefaultClose
        className="max-w-4xl w-[96vw] h-[90dvh] max-h-[90dvh] p-0 gap-0 overflow-hidden bg-background border border-border shadow-2xl flex flex-col rounded-2xl"
      >
        <DialogTitle className="sr-only">{file.name}</DialogTitle>
        <DialogDescription className="sr-only">File preview viewer for {file.name}</DialogDescription>

        {/* Top Header */}
        <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-border bg-card shrink-0">
          <div className="flex items-center gap-2.5 min-w-0 pr-2">
            <span className="text-2xl shrink-0">{iconForFile(file.mime ?? null, file.name)}</span>
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate leading-tight text-foreground">{file.name}</p>
              <p className="text-xs text-muted-foreground truncate">
                {formatBytes(file.size)}
                {file.mime ? ` • ${file.mime}` : ""}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <Button variant="outline" size="sm" asChild className="h-8 gap-1.5 text-xs px-2.5">
              <a href={file.url} download={file.name} target="_blank" rel="noreferrer">
                <Download className="size-3.5" />
                <span className="hidden sm:inline">Download</span>
              </a>
            </Button>
            <Button variant="ghost" size="sm" asChild className="h-8 gap-1.5 text-xs hidden sm:inline-flex">
              <a href={file.url} target="_blank" rel="noreferrer">
                <ExternalLink className="size-3.5" />
                <span>Open in Tab</span>
              </a>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-8 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted"
              onClick={onClose}
              aria-label="Close viewer"
            >
              <X className="size-4" />
            </Button>
          </div>
        </div>

        {/* Content Viewer Body */}
        <div className="flex-1 min-h-0 w-full overflow-hidden bg-muted/20 relative flex items-center justify-center">
          <FileRenderer file={file} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function FileRenderer({ file }: { file: FileViewerTarget }) {
  const ext = file.name.split(".").pop()?.toLowerCase() || "";
  const isPdf = file.mime?.toLowerCase() === "application/pdf" || ext === "pdf";
  const isDocx =
    ext === "docx" ||
    file.mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  const isDoc = ext === "doc" || file.mime === "application/msword";
  const isExcel =
    ext === "xlsx" ||
    ext === "xls" ||
    ext === "csv" ||
    file.mime?.includes("spreadsheet") ||
    file.mime?.includes("excel");
  const isText =
    file.mime?.startsWith("text/") ||
    /^(txt|md|csv|json|js|ts|tsx|jsx|html|css|xml|py|log)$/i.test(ext);

  if (file.kind === "image") {
    return (
      <div className="size-full flex items-center justify-center p-2 sm:p-4 overflow-auto">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={file.url}
          alt={file.name}
          className="max-h-full max-w-full object-contain rounded-lg shadow-lg select-none"
        />
      </div>
    );
  }

  if (file.kind === "video") {
    return (
      <div className="size-full flex items-center justify-center p-2 sm:p-4 bg-black">
        <video
          src={file.url}
          controls
          autoPlay
          playsInline
          className="max-h-full max-w-full rounded-lg shadow-2xl bg-black"
        />
      </div>
    );
  }

  if (file.kind === "audio") {
    return (
      <div className="w-full max-w-md p-6 bg-card border border-border rounded-2xl shadow-xl flex flex-col items-center gap-4 text-center m-4">
        <div className="size-20 rounded-full bg-primary/10 flex items-center justify-center text-primary">
          <Music className="size-10" />
        </div>
        <div className="min-w-0 w-full">
          <p className="font-semibold text-base truncate">{file.name}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{formatBytes(file.size)}</p>
        </div>
        <audio src={file.url} controls autoPlay className="w-full mt-2" />
      </div>
    );
  }

  if (isPdf) {
    return <PdfRenderer file={file} />;
  }

  if (isDocx) {
    return <DocxRenderer file={file} />;
  }

  if (isDoc) {
    // Legacy .doc format uses Google Docs Viewer fallback directly
    return <GoogleDocsFallback url={file.url} name={file.name} />;
  }

  if (isExcel) {
    return <ExcelRenderer file={file} />;
  }

  if (isText) {
    return <TextFileRenderer url={file.url} name={file.name} />;
  }

  return (
    <div className="w-full max-w-md p-6 sm:p-8 bg-card border border-border rounded-2xl shadow-xl flex flex-col items-center gap-4 text-center m-4">
      <div className="size-20 rounded-2xl bg-muted flex items-center justify-center text-5xl">
        {iconForFile(file.mime ?? null, file.name)}
      </div>
      <div>
        <p className="font-semibold text-base">{file.name}</p>
        <p className="text-xs text-muted-foreground mt-1">
          {formatBytes(file.size)} • {file.mime || "Binary Document"}
        </p>
      </div>
      <p className="text-xs text-muted-foreground max-w-xs leading-relaxed">
        This document can be opened and viewed using apps installed on your device.
      </p>
      <Button asChild className="gap-2 mt-2 w-full">
        <a href={file.url} download={file.name} target="_blank" rel="noreferrer">
          <Download className="size-4" /> Download to View
        </a>
      </Button>
    </div>
  );
}

/**
 * Native Word (.docx) Document In-App Renderer
 * Uses docx-preview to render full formatted Word documents right on screen!
 */
function DocxRenderer({ file }: { file: FileViewerTarget }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const render = async () => {
      try {
        const res = await fetch(file.url);
        if (!res.ok) throw new Error(`Failed to load file: ${res.statusText}`);
        const blob = await res.blob();
        if (cancelled) return;

        // Dynamically import docx-preview (client-only)
        const docx = await import("docx-preview");
        if (cancelled || !containerRef.current) return;

        containerRef.current.innerHTML = "";
        await docx.renderAsync(blob, containerRef.current, undefined, {
          className: "docx-viewer-content",
          inWrapper: false,
          ignoreWidth: false,
          ignoreHeight: false,
          breakPages: true,
        });

        if (!cancelled) {
          setLoading(false);
        }
      } catch (err: any) {
        if (!cancelled) {
          console.warn("[DocxRenderer] Error rendering docx:", err);
          setError(err?.message || "Could not render Word document");
          setLoading(false);
        }
      }
    };

    render();

    return () => {
      cancelled = true;
    };
  }, [file.url]);

  if (error) {
    return <GoogleDocsFallback url={file.url} name={file.name} />;
  }

  return (
    <div className="size-full flex flex-col bg-slate-100 dark:bg-slate-900 overflow-auto nice-scroll p-3 sm:p-6 select-text">
      {loading && (
        <div className="flex flex-col items-center justify-center gap-2 m-auto text-muted-foreground">
          <Loader2 className="size-6 animate-spin text-primary" />
          <p className="text-xs">Rendering Word document...</p>
        </div>
      )}
      <div
        ref={containerRef}
        className="max-w-3xl w-full mx-auto bg-white text-black shadow-xl rounded-lg p-6 sm:p-10 min-h-[400px] text-sm leading-relaxed"
      />
    </div>
  );
}

/**
 * Excel (.xlsx, .xls, .csv) Spreadsheet In-App Renderer
 * Uses SheetJS (xlsx) to render worksheets into formatted interactive HTML tables.
 */
function ExcelRenderer({ file }: { file: FileViewerTarget }) {
  const [sheets, setSheets] = useState<{ name: string; html: string }[]>([]);
  const [activeSheet, setActiveSheet] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const parse = async () => {
      try {
        const res = await fetch(file.url);
        if (!res.ok) throw new Error(`Failed to load file: ${res.statusText}`);
        const arrayBuffer = await res.arrayBuffer();
        if (cancelled) return;

        const XLSX = await import("xlsx");
        const workbook = XLSX.read(arrayBuffer, { type: "array" });

        const parsedSheets = workbook.SheetNames.map((sheetName) => {
          const worksheet = workbook.Sheets[sheetName];
          const html = XLSX.utils.sheet_to_html(worksheet, {
            id: `sheet-${sheetName}`,
            editable: false,
          });
          return { name: sheetName, html };
        });

        if (!cancelled) {
          setSheets(parsedSheets);
          setActiveSheet(0);
          setLoading(false);
        }
      } catch (err: any) {
        if (!cancelled) {
          console.warn("[ExcelRenderer] Error parsing spreadsheet:", err);
          setError(err?.message || "Could not preview spreadsheet");
          setLoading(false);
        }
      }
    };

    parse();

    return () => {
      cancelled = true;
    };
  }, [file.url]);

  if (error) {
    return <GoogleDocsFallback url={file.url} name={file.name} />;
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 m-auto text-muted-foreground">
        <Loader2 className="size-6 animate-spin text-primary" />
        <p className="text-xs">Parsing spreadsheet...</p>
      </div>
    );
  }

  return (
    <div className="size-full flex flex-col bg-background select-text overflow-hidden">
      {/* Sheet Tabs */}
      {sheets.length > 1 && (
        <div className="flex items-center gap-1 px-3 py-1.5 border-b border-border bg-card overflow-x-auto shrink-0 nice-scroll">
          <FileSpreadsheet className="size-4 text-emerald-600 mr-1.5 shrink-0" />
          {sheets.map((s, idx) => (
            <button
              key={s.name}
              type="button"
              onClick={() => setActiveSheet(idx)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors shrink-0 ${
                activeSheet === idx
                  ? "bg-primary text-primary-foreground font-semibold"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}

      {/* Sheet Table Viewport */}
      <div className="flex-1 overflow-auto p-4 nice-scroll">
        <div
          className="w-full text-xs [&_table]:w-full [&_table]:border-collapse [&_table]:border [&_table]:border-border [&_th]:border [&_th]:border-border [&_th]:bg-muted [&_th]:p-2 [&_th]:font-semibold [&_td]:border [&_td]:border-border [&_td]:p-2 [&_tr:hover]:bg-muted/40"
          dangerouslySetInnerHTML={{ __html: sheets[activeSheet]?.html || "" }}
        />
      </div>
    </div>
  );
}

/**
 * Mobile-compatible PDF Viewer:
 * Uses Mozilla PDF.js loaded on-demand to render PDF pages onto an HTML5 Canvas!
 */
function PdfRenderer({ file }: { file: FileViewerTarget }) {
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [pageNum, setPageNum] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [scale, setScale] = useState(1.1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const renderTaskRef = useRef<any>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const load = async () => {
      try {
        let pdfjsLib = (window as any).pdfjsLib;
        if (!pdfjsLib) {
          await new Promise<void>((resolve, reject) => {
            const script = document.createElement("script");
            script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
            script.onload = () => resolve();
            script.onerror = () => reject(new Error("Failed to load PDF viewer engine"));
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
          url: file.url,
          withCredentials: false,
        });

        const doc = await loadingTask.promise;
        if (cancelled) return;

        setPdfDoc(doc);
        setNumPages(doc.numPages);
        setPageNum(1);
        setLoading(false);
      } catch (err: any) {
        if (cancelled) return;
        console.warn("[PdfRenderer] PDF.js failed:", err);
        setError(err?.message || "Could not render PDF pages");
        setLoading(false);
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [file.url]);

  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return;
    let cancelled = false;

    const render = async () => {
      try {
        if (renderTaskRef.current) {
          try {
            renderTaskRef.current.cancel();
          } catch {
            // ignore
          }
        }

        const page = await pdfDoc.getPage(pageNum);
        if (cancelled || !canvasRef.current) return;

        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        canvas.height = viewport.height;
        canvas.width = viewport.width;

        const renderContext = {
          canvasContext: ctx,
          viewport,
        };

        const task = page.render(renderContext);
        renderTaskRef.current = task;
        await task.promise;
      } catch (err: any) {
        if (err?.name !== "RenderingCancelledException") {
          console.warn("[PdfRenderer] Page render error:", err);
        }
      }
    };

    render();

    return () => {
      cancelled = true;
    };
  }, [pdfDoc, pageNum, scale]);

  if (error) {
    return <GoogleDocsFallback url={file.url} name={file.name} />;
  }

  return (
    <div className="size-full flex flex-col bg-slate-900/60 select-none">
      {/* PDF Controls Toolbar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-card/90 border-b border-border text-xs shrink-0">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="size-7 rounded-md"
            disabled={pageNum <= 1 || loading}
            onClick={() => setPageNum((p) => Math.max(p - 1, 1))}
            aria-label="Previous page"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="text-xs font-medium tabular-nums px-1.5">
            {loading ? "..." : `${pageNum} / ${numPages}`}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 rounded-md"
            disabled={pageNum >= numPages || loading}
            onClick={() => setPageNum((p) => Math.min(p + 1, numPages))}
            aria-label="Next page"
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="size-7 rounded-md"
            disabled={scale <= 0.6 || loading}
            onClick={() => setScale((s) => Math.max(s - 0.2, 0.6))}
            aria-label="Zoom out"
          >
            <ZoomOut className="size-3.5" />
          </Button>
          <span className="text-[11px] text-muted-foreground tabular-nums w-10 text-center">
            {Math.round(scale * 100)}%
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 rounded-md"
            disabled={scale >= 2.5 || loading}
            onClick={() => setScale((s) => Math.min(s + 0.2, 2.5))}
            aria-label="Zoom in"
          >
            <ZoomIn className="size-3.5" />
          </Button>
        </div>
      </div>

      {/* PDF Canvas Viewport */}
      <div className="flex-1 overflow-auto flex items-start justify-center p-3 sm:p-5 nice-scroll">
        {loading ? (
          <div className="flex flex-col items-center justify-center gap-2 m-auto text-muted-foreground">
            <Loader2 className="size-6 animate-spin text-primary" />
            <p className="text-xs">Rendering document pages...</p>
          </div>
        ) : (
          <div className="shadow-2xl rounded-sm overflow-hidden bg-white">
            <canvas ref={canvasRef} className="max-w-full h-auto block" />
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Text file reader
 */
function TextFileRenderer({ url, name }: { url: string; name: string }) {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch(url)
      .then((r) => r.text())
      .then((txt) => {
        if (!cancelled) {
          setContent(txt);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="size-6 animate-spin text-primary" />
        <p className="text-xs">Loading text preview...</p>
      </div>
    );
  }

  if (content === null) {
    return <iframe src={url} title={name} className="size-full border-0 bg-card p-4 font-mono text-xs" />;
  }

  return (
    <div className="size-full p-4 overflow-auto font-mono text-xs text-foreground bg-card leading-relaxed whitespace-pre-wrap select-text nice-scroll">
      {content}
    </div>
  );
}

/**
 * Google Docs Viewer fallback for remote docx/doc files
 */
function GoogleDocsFallback({ url, name }: { url: string; name: string }) {
  const googleViewerUrl = `https://docs.google.com/viewer?url=${encodeURIComponent(url)}&embedded=true`;
  return (
    <div className="size-full flex flex-col">
      <iframe src={googleViewerUrl} title={name} className="size-full flex-1 border-0 bg-white" />
      <div className="p-2 bg-card border-t border-border flex items-center justify-between text-xs px-4">
        <span className="text-muted-foreground flex items-center gap-1.5">
          <AlertCircle className="size-3.5 text-amber-500" /> Cloud document preview
        </span>
        <Button size="sm" variant="outline" asChild className="h-7 text-xs gap-1">
          <a href={url} download={name} target="_blank" rel="noreferrer">
            <Download className="size-3" /> Direct Download
          </a>
        </Button>
      </div>
    </div>
  );
}
