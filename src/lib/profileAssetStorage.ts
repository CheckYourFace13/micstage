import { randomBytes } from "node:crypto";

const MAX_BYTES = 2_500_000;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export type StoreProfileImageResult = { ok: true; publicUrl: string } | { ok: false; error: string };

function extForMime(mime: string): string {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/gif") return "gif";
  return "jpg";
}

/**
 * Stores a profile image. Uses Vercel Blob when `BLOB_READ_WRITE_TOKEN` is set; otherwise local
 * `public/uploads/micstage-profiles/` when `NODE_ENV === "development"` or `MICSTAGE_LOCAL_UPLOADS=1`.
 */
export async function storeProfileImage(
  buf: Buffer,
  contentType: string,
  /** e.g. venue/{id}/logo.jpg */
  logicalPath: string,
): Promise<StoreProfileImageResult> {
  const mime = contentType.split(";")[0]?.trim().toLowerCase() ?? "";
  if (!ALLOWED.has(mime)) {
    return { ok: false, error: "unsupported_type" };
  }
  if (buf.length > MAX_BYTES) {
    return { ok: false, error: "too_large" };
  }

  const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  if (token) {
    try {
      const { put } = await import("@vercel/blob");
      const name = logicalPath.replace(/[^a-zA-Z0-9/_\-_.]/g, "_");
      const blob = await put(name, buf, {
        access: "public",
        contentType: mime,
        token,
      });
      return { ok: true, publicUrl: blob.url };
    } catch (e) {
      console.error("[profileAssetStorage] blob put failed", e);
      return { ok: false, error: "blob_failed" };
    }
  }

  const localOk = process.env.NODE_ENV === "development" || process.env.MICSTAGE_LOCAL_UPLOADS === "1";
  if (!localOk) {
    return { ok: false, error: "uploads_not_configured" };
  }

  try {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const dir = path.join(process.cwd(), "public", "uploads", "micstage-profiles");
    await fs.mkdir(dir, { recursive: true });
    const ext = extForMime(mime);
    const safe = `${Date.now()}-${randomBytes(8).toString("hex")}.${ext}`;
    const full = path.join(dir, safe);
    await fs.writeFile(full, buf);
    return { ok: true, publicUrl: `/uploads/micstage-profiles/${safe}` };
  } catch (e) {
    console.error("[profileAssetStorage] local write failed", e);
    return { ok: false, error: "local_write_failed" };
  }
}

export async function readProfileImageFile(formData: FormData): Promise<{ buf: Buffer; type: string } | { error: string }> {
  const file = formData.get("file");
  if (!file || typeof file !== "object" || !("arrayBuffer" in file)) {
    return { error: "missing_file" };
  }
  const blob = file as File;
  const type = (blob.type || "").split(";")[0]?.trim().toLowerCase() || "application/octet-stream";
  const ab = await blob.arrayBuffer();
  const buf = Buffer.from(ab);
  return { buf, type };
}
