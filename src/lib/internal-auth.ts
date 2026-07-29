import "server-only";

import { timingSafeEqual } from "node:crypto";

export function hasValidInternalBearer(headers: Headers) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const authorization = headers.get("authorization") || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  const expected = Buffer.from(secret, "utf8");
  const provided = Buffer.from(token, "utf8");
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}
