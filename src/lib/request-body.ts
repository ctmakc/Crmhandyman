/**
 * Body caps that hold BEFORE the bytes are in memory.
 *
 * The public intake endpoint checked its 20 KB limit after `await req.text()`, so a
 * 300 MB POST was fully buffered and only then refused: three concurrent ones pushed
 * the worker to 2.7 GB resident. On a box that already dies to the OOM killer, an
 * endpoint anyone on the internet may call has to refuse by the header and stop reading
 * at the limit.
 */

/** The size the caller declared. Missing or unparseable reads as unknown. */
export function declaredBodyBytes(req: Request): number | null {
  const raw = req.headers.get("content-length");
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** True when the caller has already announced more than we will accept. */
export function declaredTooLarge(req: Request, limit: number): boolean {
  const declared = declaredBodyBytes(req);
  return declared !== null && declared > limit;
}

/**
 * Read a text body, giving up as soon as it passes the limit. A chunked request
 * declares no length, so the stream itself is the only place left to say no.
 */
export async function readTextCapped(req: Request, limit: number): Promise<string | null> {
  if (declaredTooLarge(req, limit)) return null;

  const stream = req.body;
  if (!stream) return "";

  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  return Buffer.concat(chunks).toString("utf8");
}
