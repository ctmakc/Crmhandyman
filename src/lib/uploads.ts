import { randomBytes } from "crypto";
import { mkdir, unlink, writeFile } from "fs/promises";
import path from "path";

/**
 * Job photos on disk. They live OUTSIDE public/ on purpose: a file under public/ is
 * served by the web server before any handler runs, so one guessed URL would hand a
 * competitor another contractor's site photos. Everything here is reached only through
 * /api/photos/[id], which checks the session first.
 */

/** What a phone actually produces. The list is the allowlist — nothing else is stored. */
export const PHOTO_MIMES = ["image/jpeg", "image/png", "image/webp", "image/heic"] as const;
export type PhotoMime = (typeof PHOTO_MIMES)[number];

const EXTENSION: Record<PhotoMime, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
};

const DEFAULT_MAX_MB = 12;
const DEFAULT_MAX_PER_JOB = 40;

/**
 * A missing or malformed limit falls back to the conservative default rather than to
 * "no limit" — a typo in the env file must not turn the upload endpoint into free disk.
 */
function positiveInt(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

export function uploadsRoot(): string {
  const configured = process.env.UPLOADS_DIR?.trim();
  return path.resolve(configured && configured.length > 0 ? configured : "var/uploads");
}

export function maxUploadBytes(): number {
  return positiveInt(process.env.MAX_UPLOAD_MB, DEFAULT_MAX_MB) * 1024 * 1024;
}

export function maxPhotosPerJob(): number {
  return positiveInt(process.env.MAX_PHOTOS_PER_JOB, DEFAULT_MAX_PER_JOB);
}

/** HEIF brands an iPhone writes. Stills, bursts and the sequence variants. */
const HEIF_BRANDS = new Set([
  "heic",
  "heix",
  "heim",
  "heis",
  "hevc",
  "hevx",
  "hevm",
  "hevs",
  "mif1",
  "msf1",
]);

/**
 * Read the format out of the bytes. Content-Type on a multipart part is whatever the
 * client typed — a shell script renamed to .jpg arrives as image/jpeg if the uploader
 * says so — and a file we later serve back with that same header is a stored XSS.
 */
export function sniffImageMime(buf: Buffer): PhotoMime | null {
  if (buf.length < 12) return null;

  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";

  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  )
    return "image/png";

  if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP")
    return "image/webp";

  if (buf.toString("ascii", 4, 8) === "ftyp" && HEIF_BRANDS.has(buf.toString("ascii", 8, 12)))
    return "image/heic";

  return null;
}

export function extensionFor(mime: PhotoMime): string {
  return EXTENSION[mime];
}

/**
 * Write the bytes under <root>/<tenantId>/<projectId>/ and return the storage key kept
 * in the database. The name is generated here: a filename that came from the client is
 * a path, and a path from the client walks out of the directory.
 */
export async function storeJobPhoto(args: {
  tenantId: string;
  projectId: string;
  mime: PhotoMime;
  bytes: Buffer;
}): Promise<string> {
  const key = path.posix.join(
    args.tenantId,
    args.projectId,
    `${randomBytes(16).toString("hex")}.${extensionFor(args.mime)}`
  );
  const abs = path.join(uploadsRoot(), key);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, args.bytes);
  return key;
}

/**
 * Absolute path for a stored key, or null when the key would escape the upload root.
 * Keys are generated above and should always be clean; the check is here because a
 * single bad row would otherwise turn the download route into an arbitrary file read.
 */
export function photoFilePath(key: string): string | null {
  if (!key || key.includes("\0")) return null;
  const root = uploadsRoot();
  const abs = path.resolve(root, key);
  return abs === root || abs.startsWith(root + path.sep) ? abs : null;
}

/** Best-effort file removal. A vanished file is the desired end state anyway. */
export async function removeStoredFile(key: string): Promise<void> {
  const abs = photoFilePath(key);
  if (!abs) return;
  try {
    await unlink(abs);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
}
