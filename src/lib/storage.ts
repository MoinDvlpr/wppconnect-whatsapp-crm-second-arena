import { promises as fs } from "node:fs";
import path from "node:path";
import { newId } from "./api";

/** Media storage abstraction. Local FS implementation; swap for S3/MinIO by implementing MediaStorage. */
export interface StoredFile { key: string; size: number; mimeType: string; filename: string; }
export interface MediaStorage {
  put(buffer: Buffer, opts: { mimeType: string; filename: string; folder?: string }): Promise<StoredFile>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  absolutePath?(key: string): string;
}
const ROOT = path.resolve(process.cwd(), process.env.MEDIA_STORAGE_PATH || "data/media");
export const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_MB || 64) * 1024 * 1024;
export const ALLOWED_MIME = new Set([
  "image/jpeg", "image/png", "image/webp", "image/gif", "video/mp4", "video/quicktime", "audio/mpeg", "audio/mp3", "audio/aac", "audio/ogg", "audio/opus", "audio/wav", "audio/webm", "audio/ogg; codecs=opus",
  "application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "text/plain", "text/csv", "application/zip", "application/x-zip-compressed",
]);
function safeKey(key: string) {
  const p = path.normalize(key).replace(/^(\.\.(\/|\\|$))+/, "");
  const abs = path.resolve(ROOT, p);
  if (!abs.startsWith(ROOT + path.sep) && abs !== ROOT) throw new Error("Invalid storage key");
  return abs;
}
class LocalStorage implements MediaStorage {
  async put(buffer: Buffer, opts: { mimeType: string; filename: string; folder?: string }): Promise<StoredFile> {
    const ext = path.extname(opts.filename).replace(/[^a-zA-Z0-9.]/g, "").slice(0, 10);
    const folder = (opts.folder || "uploads").replace(/[^a-zA-Z0-9_-]/g, "");
    const key = `${folder}/${new Date().toISOString().slice(0, 10)}/${newId()}${ext}`;
    const abs = safeKey(key);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, buffer);
    return { key, size: buffer.length, mimeType: opts.mimeType, filename: opts.filename };
  }
  async get(key: string) { return fs.readFile(safeKey(key)); }
  async delete(key: string) { await fs.rm(safeKey(key), { force: true }); }
  async exists(key: string) { try { await fs.access(safeKey(key)); return true; } catch { return false; } }
  absolutePath(key: string) { return safeKey(key); }
}
const g = globalThis as typeof globalThis & { __mediaStorage?: MediaStorage };
export const storage: MediaStorage = g.__mediaStorage ?? (g.__mediaStorage = new LocalStorage());
export function mediaKind(mime: string): "image" | "video" | "audio" | "document" | "sticker" {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "document";
}
