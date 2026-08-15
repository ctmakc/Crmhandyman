import { createHmac, timingSafeEqual } from "node:crypto";

const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

export function signIntakePayload(rawBody: string, timestamp: string, secret: string) {
  return createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
}

export function verifyIntakeSignature(input: {
  rawBody: string;
  timestamp: string | null;
  signature: string | null;
  secret: string;
  now?: number;
}) {
  if (!input.timestamp || !input.signature || !input.secret) return false;

  const sentAt = Number(input.timestamp);
  if (!Number.isFinite(sentAt)) return false;
  if (Math.abs((input.now ?? Date.now()) - sentAt) > MAX_CLOCK_SKEW_MS) return false;

  const provided = input.signature.startsWith("sha256=")
    ? input.signature.slice("sha256=".length)
    : input.signature;
  if (!/^[a-f0-9]{64}$/i.test(provided)) return false;

  const expected = signIntakePayload(input.rawBody, input.timestamp, input.secret);
  const left = Buffer.from(expected, "hex");
  const right = Buffer.from(provided, "hex");
  return left.length === right.length && timingSafeEqual(left, right);
}
