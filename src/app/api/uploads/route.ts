import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { getSupabaseServer, isSupabaseConfigured } from "@/lib/supabase";
import { MAX_UPLOAD_BYTES, kindFromMime, sanitizeFileName } from "@/lib/file-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Option A — File uploads (all types like WhatsApp):
 * POST multipart/form-data { file, conversationId? }
 * → { url, name, size, mime, kind }
 *
 * Storage strategy:
 *  1. If Supabase is configured (URL + SERVICE_ROLE_KEY), upload to the
 *     Supabase Storage bucket `chat-files` (auto-created as public) and
 *     return the public URL.
 *  2. Otherwise store on local disk under public/uploads/ and return
 *     the relative /uploads/... URL.
 */
export async function POST(req: NextRequest) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid multipart body" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "Empty file" }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: `File too large (max ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)}MB)` },
      { status: 413 }
    );
  }

  const conversationId = String(form.get("conversationId") || "general").slice(0, 64);
  const originalName = sanitizeFileName(file.name || "file");
  const mime = file.type || "application/octet-stream";
  const kind = kindFromMime(mime);
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${originalName}`;
  const storagePath = `${conversationId}/${unique}`;
  const bytes = Buffer.from(await file.arrayBuffer());

  // 1) Supabase Storage (preferred when configured)
  if (isSupabaseConfigured) {
    try {
      const sb = getSupabaseServer();
      if (sb) {
        const bucket = "chat-files";
        // ensure bucket exists (idempotent)
        const { data: buckets } = await sb.storage.listBuckets();
        if (!buckets?.some((b) => b.name === bucket)) {
          await sb.storage.createBucket(bucket, { public: true, fileSizeLimit: MAX_UPLOAD_BYTES });
        }
        const { error: upError } = await sb.storage
          .from(bucket)
          .upload(storagePath, bytes, { contentType: mime, upsert: false });
        if (upError) throw upError;
        const { data: pub } = sb.storage.from(bucket).getPublicUrl(storagePath);
        return NextResponse.json({
          url: pub.publicUrl,
          name: file.name || originalName,
          size: file.size,
          mime,
          kind,
          storage: "supabase",
        });
      }
    } catch (e) {
      console.warn("[uploads] supabase storage failed, falling back to disk:", e);
    }
  }

  // 2) Local disk fallback
  try {
    const dir = path.join(process.cwd(), "public", "uploads", conversationId);
    await fs.mkdir(dir, { recursive: true });
    const abs = path.join(dir, unique);
    await fs.writeFile(abs, bytes);
    return NextResponse.json({
      url: `/uploads/${conversationId}/${unique}`,
      name: file.name || originalName,
      size: file.size,
      mime,
      kind,
      storage: "local",
    });
  } catch (e) {
    console.error("[uploads] disk write failed", e);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
