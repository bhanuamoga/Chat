"use client";

/**
 * In-app attachment viewer — real previews, no dummies:
 *  - images / pdf / text → inline iframe
 *  - DOCX → rendered to HTML client-side (mammoth, Word-style look)
 *  - XLSX/XLS/CSV → parsed client-side (SheetJS) → scrollable spreadsheet table
 *    with per-sheet tabs
 *  - everything else → nice Download tile
 */
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, FileText, Loader2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

export interface AttachmentTarget {
  emailRowId: string;
  accountId: string;
  messageId: string;
  index: number;
  filename: string;
  mime?: string;
  size?: number;
}

type Kind = "iframe" | "docx" | "sheet" | "fallback";

const extOf = (name: string) => (name.includes(".") ? name.split(".").pop()!.toLowerCase() : "");

function kindOf(target: AttachmentTarget): Kind {
  const ext = extOf(target.filename);
  const mime = target.mime || "";
  if (mime.startsWith("image/") || ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "avif"].includes(ext)) return "iframe";
  if (mime === "application/pdf" || ext === "pdf") return "iframe";
  if (mime.startsWith("text/") || ["txt", "md", "log", "json", "xml", "html", "htm", "yaml", "yml"].includes(ext)) return "iframe";
  if (ext === "docx") return "docx";
  if (["xlsx", "xls", "xlsm", "xlsb", "csv", "tsv", "ods"].includes(ext)) return "sheet";
  return "fallback";
}

const SHEET_CAP_ROWS = 400;
const SHEET_CAP_COLS = 60;

export function AttachmentViewer({ target, onClose }: { target: AttachmentTarget | null; onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [officeHtml, setOfficeHtml] = useState<string | null>(null);
  const [officeErr, setOfficeErr] = useState<string | null>(null);

  const kind = target ? kindOf(target) : "fallback";
  const src = target
    ? `/api/email/attachment?accountId=${encodeURIComponent(target.accountId)}` +
      `&e=${encodeURIComponent(target.emailRowId)}` +
      `&id=${encodeURIComponent(target.messageId)}` +
      `&i=${target.index}`
    : "";

  useEffect(() => {
    if (!target) return;
    setLoading(true);
    setOfficeHtml(null);
    setOfficeErr(null);
    if (kind === "docx" || kind === "sheet") {
      let cancelled = false;
      (async () => {
        try {
          const res = await fetch(src);
          if (!res.ok) throw new Error(`Download failed (${res.status})`);
          const buf = await res.arrayBuffer();
          if (kind === "docx") {
            const mammoth = await import("mammoth/mammoth.browser");
            const { value } = await mammoth.convertToHtml({ arrayBuffer: buf });
            if (!cancelled) setOfficeHtml(`<div class="docx-page">${value || "<p><i>(empty document)</i></p>"}</div>`);
          } else {
            const XLSX = await import("xlsx");
            const wb = XLSX.read(buf, { type: "array" });
            const parts = wb.SheetNames.map((name) => {
              const sheet = wb.Sheets[name];
              const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false }) as unknown[][];
              const clipped = rows.slice(0, SHEET_CAP_ROWS).map((r) => r.slice(0, SHEET_CAP_COLS));
              const body = clipped
                .map(
                  (r, i) =>
                    `<tr>${r.map((c) => `<td${i === 0 ? ' class="hdr"' : ""}>${String(c ?? "").replace(/</g, "&lt;")}</td>`).join("")}</tr>`
                )
                .join("");
              const note =
                rows.length > SHEET_CAP_ROWS ? `<p class="capnote">showing first ${SHEET_CAP_ROWS} rows of ${rows.length}</p>` : "";
              return `<h4>${name.replace(/</g, "&lt;")}</h4><table>${body}</table>${note}`;
            });
            if (!cancelled) setOfficeHtml(`<div class="sheet-wrap">${parts.join("")}</div>`);
          }
        } catch (e) {
          if (!cancelled) setOfficeErr(e instanceof Error ? e.message : "Preview failed");
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
      return () => {
        cancelled = true;
      };
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, kind]);

  if (!target) return null;
  const kb = target.size ? Math.max(1, Math.round(target.size / 1024)) : null;

  const officeCss = useMemo(
    () => `
      .docx-page{max-width:820px;margin:0 auto;padding:40px 48px;background:#fff;color:#111;font-family:ui-serif,Georgia,Cambria,'Times New Roman',serif;font-size:14px;line-height:1.6;}
      .docx-page img{max-width:100%;}
      .docx-page table{border-collapse:collapse;margin:8px 0;}
      .docx-page td,.docx-page th{border:1px solid #d4d4d4;padding:4px 8px;}
      .sheet-wrap{padding:16px;overflow:auto;height:100%;background:#fff;color:#111;}
      .sheet-wrap h4{margin:8px 0 6px;font:600 13px ui-sans-serif,system-ui,sans-serif;color:#333;}
      .sheet-wrap table{border-collapse:collapse;width:max-content;margin-bottom:20px;}
      .sheet-wrap td{border:1px solid #e5e7eb;padding:4px 10px;font:12px ui-monospace,SFMono-Regular,Menlo,monospace;white-space:pre;}
      .sheet-wrap td.hdr{background:#f3f4f6;font-weight:600;}
      .sheet-wrap .capnote{font:11px ui-sans-serif,system-ui,sans-serif;color:#6b7280;}
    `,
    []
  );

  return (
    <Dialog open onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent
        className="flex h-[85vh] max-w-4xl flex-col gap-2 p-0
          max-sm:inset-0 max-sm:h-dvh max-sm:w-screen max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0
          max-sm:rounded-none max-sm:border-0 max-sm:shadow-none"
      >
        <DialogHeader className="flex-row items-center gap-3 space-y-0 border-b border-border px-4 py-3">
          <DialogTitle className="min-w-0 flex-1 truncate text-sm font-semibold">{target.filename}</DialogTitle>
          {kb != null && <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{kb} KB</span>}
          <Button variant="outline" size="sm" className="shrink-0" asChild>
            <a href={`${src}&dl=1`} download={target.filename}>
              <Download className="mr-1.5 size-4" /> Download
            </a>
          </Button>
          <Button variant="ghost" size="icon" className="shrink-0" onClick={onClose} aria-label="Close">
            <X className="size-4" />
          </Button>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-hidden bg-muted/30">
          {kind === "iframe" ? (
            <>
              {loading && (
                <div className="flex h-full items-center justify-center">
                  <Loader2 className="size-6 animate-spin text-muted-foreground" />
                </div>
              )}
              <iframe title={target.filename} src={src} className="h-full w-full border-0 bg-white" onLoad={() => setLoading(false)} />
            </>
          ) : kind === "fallback" ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
              <div className="flex size-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
                <FileText className="size-7" />
              </div>
              <div>
                <div className="text-sm font-semibold">{target.filename}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {target.mime || "file"}
                  {kb != null ? ` · ${kb} KB` : ""} — no inline preview for this type
                </div>
              </div>
              <Button asChild>
                <a href={`${src}&dl=1`} download={target.filename}>
                  <Download className="mr-2 size-4" /> Download
                </a>
              </Button>
            </div>
          ) : (
            <>
              {loading && (
                <div className="flex h-full items-center justify-center">
                  <Loader2 className="size-6 animate-spin text-muted-foreground" />
                </div>
              )}
              {!loading && officeErr && (
                <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
                  <FileText className="size-8 text-muted-foreground" />
                  <div className="text-sm text-destructive">{officeErr}</div>
                  <Button asChild variant="outline">
                    <a href={`${src}&dl=1`} download={target.filename}>
                      <Download className="mr-2 size-4" /> Download instead
                    </a>
                  </Button>
                </div>
              )}
              {!loading && officeHtml && (
                <div className="h-full overflow-auto">
                  <style>{officeCss}</style>
                  {/* content parsed safely client-side from our own sync-served bytes */}
                  <div dangerouslySetInnerHTML={{ __html: officeHtml }} />
                </div>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default AttachmentViewer;
