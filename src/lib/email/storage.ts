/**
 * Email attachment blobs — Supabase Storage bucket "email-attachments"
 * (private; content is served through the auth-gated /api/email/attachment route).
 * Bucket auto-creates on first upload, idempotently — same pattern as chat-files.
 */
import { getSupabaseServer, isSupabaseConfigured, SUPABASE_SERVICE_KEY } from "@/lib/supabase";

export const ATTACH_BUCKET = "email-attachments";
export const ATTACH_MAX_BYTES = 20 * 1024 * 1024; // skip giant files

export function attachmentsStorageReady(): boolean {
  return isSupabaseConfigured && Boolean(SUPABASE_SERVICE_KEY);
}

let bucketEnsured = false;

async function ensureBucket(): Promise<void> {
  if (bucketEnsured) return;
  const sb = getSupabaseServer();
  if (!sb) return;
  const { data: buckets } = await sb.storage.listBuckets();
  if (!buckets?.some((b) => b.name === ATTACH_BUCKET)) {
    const { error } = await sb.storage.createBucket(ATTACH_BUCKET, {
      public: false,
      fileSizeLimit: `${ATTACH_MAX_BYTES / 1024 / 1024}MB`,
    });
    // ignore "already exists" raced errors
    if (error && !/already exists/i.test(error.message)) throw error;
  }
  bucketEnsured = true;
}

const safeName = (name: string) =>
  name.replace(/[^\w.\-+()\[\] ]/g, "_").replace(/\s+/g, "_").slice(-120);

/** Upload one attachment; returns the storage path. */
export async function storeAttachment(
  userId: string,
  emailRowId: string,
  index: number,
  filename: string,
  mime: string,
  content: Buffer
): Promise<string | null> {
  if (!attachmentsStorageReady()) return null;
  if (!content?.length || content.length > ATTACH_MAX_BYTES) return null;
  try {
    await ensureBucket();
    const sb = getSupabaseServer()!;
    const path = `${userId}/${emailRowId}/${index}/${safeName(filename)}`;
    const { error } = await sb.storage.from(ATTACH_BUCKET).upload(path, content, {
      contentType: mime || "application/octet-stream",
      upsert: true,
    });
    if (error) return null;
    return path;
  } catch {
    return null;
  }
}

/** Download bytes back out of the bucket for the auth-gated route. */
export async function loadAttachment(path: string): Promise<{ bytes: Uint8Array } | null> {
  if (!attachmentsStorageReady()) return null;
  try {
    const sb = getSupabaseServer()!;
    const { data, error } = await sb.storage.from(ATTACH_BUCKET).download(path);
    if (error || !data) return null;
    return { bytes: new Uint8Array(await data.arrayBuffer()) };
  } catch {
    return null;
  }
}

/** Remove every stored attachment of one email row (used on purge). */
export async function removeAttachmentTree(userId: string, emailRowId: string, paths: string[]): Promise<void> {
  if (!attachmentsStorageReady() || !paths.length) return;
  try {
    const sb = getSupabaseServer()!;
    await sb.storage.from(ATTACH_BUCKET).remove(paths);
  } catch {
    /* best effort */
  }
}
