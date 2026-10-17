"use client";

/**
 * In-app attachment viewer — opens on chip click, previews images/PDF/text
 * inline in a dialog, offers Download for anything the browser can't preview.
 */
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, FileText, Loader2, X } from "lucide-react";
import { useEffect, useState } from "react";

export interface AttachmentTarget {
  emailRowId: string;
  accountId: string;
  messageId: string;
  index: number;
  filename: string;
  mime?: string;
  size?: number;
}

const PREVIEWABLE = (mime?: string) => {
  if (!mime) return false;
  return (
    mime.startsWith("image/") ||
    mime === "application/pdf" ||
    mime.startsWith("text/") ||
    mime === "application/json"
  );
};

export function AttachmentViewer({ target, onClose }: { target: AttachmentTarget | null; onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (target) setLoading(true);
  }, [target]);
  if (!target) return null;

  const src =
    `/api/email/attachment?accountId=${encodeURIComponent(target.accountId)}` +
    `&e=${encodeURIComponent(target.emailRowId)}` +
    `&id=${encodeURIComponent(target.messageId)}` +
    `&i=${target.index}`;
  const kb = target.size ? Math.max(1, Math.round(target.size / 1024)) : null;
  const preview = PREVIEWABLE(target.mime);

  return (
    <Dialog open onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent className="flex h-[82vh] max-w-3xl flex-col gap-2 p-0">
        <DialogHeader className="flex-row items-center gap-3 space-y-0 border-b border-border px-4 py-3">
          <DialogTitle className="min-w-0 flex-1 truncate text-sm font-semibold">{target.filename}</DialogTitle>
          {kb != null && <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{kb} KB</span>}
          {target.mime && <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">{target.mime}</span>}
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
          {preview ? (
            <>
              {loading && (
                <div className="flex h-full items-center justify-center">
                  <Loader2 className="size-6 animate-spin text-muted-foreground" />
                </div>
              )}
              <iframe
                title={target.filename}
                src={src}
                className="h-full w-full border-0 bg-white"
                onLoad={() => setLoading(false)}
              />
            </>
          ) : (
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
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default AttachmentViewer;
