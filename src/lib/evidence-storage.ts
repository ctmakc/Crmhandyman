import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;
const MIME_EXTENSION: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
};

function storageRoot() {
  return path.resolve(process.env.EVIDENCE_DIR || path.join(process.cwd(), "data", "evidence"));
}

function resolveStorageKey(storageKey: string) {
  const root = storageRoot();
  const resolved = path.resolve(root, storageKey);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error("Invalid evidence storage key");
  }
  return resolved;
}

export function maxEvidenceBytes() {
  const configured = Number(process.env.EVIDENCE_MAX_BYTES || DEFAULT_MAX_BYTES);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_MAX_BYTES;
}

export function validateEvidenceFile(input: { mimeType: string; byteSize: number }) {
  if (!MIME_EXTENSION[input.mimeType]) throw new Error("Unsupported image type");
  if (input.byteSize <= 0) throw new Error("Empty image");
  if (input.byteSize > maxEvidenceBytes()) throw new Error("Image is too large");
}

export async function persistEvidenceFile(input: {
  tenantId: string;
  projectId: string;
  mimeType: string;
  bytes: Buffer;
}) {
  validateEvidenceFile({ mimeType: input.mimeType, byteSize: input.bytes.byteLength });
  const extension = MIME_EXTENSION[input.mimeType];
  const storageKey = path.join(input.tenantId, input.projectId, `${randomUUID()}.${extension}`);
  const destination = resolveStorageKey(storageKey);
  await fs.mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
  await fs.writeFile(destination, input.bytes, { mode: 0o600 });

  return {
    storageKey,
    byteSize: input.bytes.byteLength,
    sha256: createHash("sha256").update(input.bytes).digest("hex"),
  };
}

export async function readEvidenceFile(storageKey: string) {
  return fs.readFile(resolveStorageKey(storageKey));
}

export async function removeEvidenceFile(storageKey: string) {
  try {
    await fs.unlink(resolveStorageKey(storageKey));
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") throw error;
  }
}
