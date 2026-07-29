import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

type SignedPayload = Record<string, string | number | boolean | null> & {
  exp: number;
};

function secret() {
  const value = process.env.NEXTAUTH_SECRET;
  if (!value) throw new Error("NEXTAUTH_SECRET is required for signed tokens.");
  return value;
}

function signature(encodedPayload: string) {
  return createHmac("sha256", secret()).update(encodedPayload).digest("base64url");
}

export function createSignedToken(
  payload: Omit<SignedPayload, "exp">,
  ttlSeconds: number
) {
  const encodedPayload = Buffer.from(
    JSON.stringify({
      ...payload,
      exp: Math.floor(Date.now() / 1000) + ttlSeconds,
    })
  ).toString("base64url");

  return `${encodedPayload}.${signature(encodedPayload)}`;
}

export function verifySignedToken(token: string): SignedPayload | null {
  const [encodedPayload, providedSignature] = token.split(".");
  if (!encodedPayload || !providedSignature) return null;

  const expectedSignature = signature(encodedPayload);
  const provided = Buffer.from(providedSignature);
  const expected = Buffer.from(expectedSignature);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as SignedPayload;
    if (!Number.isFinite(payload.exp) || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}
