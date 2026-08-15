import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import { prisma } from "./prisma";

export interface RateLimitResult {
  allowed: boolean;
  count: number;
  limit: number;
  resetAt: number;
  retryAfterSeconds: number;
}

function hashIdentifier(scope: string, identifier: string) {
  const pepper = process.env.RATE_LIMIT_PEPPER || process.env.NEXTAUTH_SECRET || "";
  if (!pepper) throw new Error("RATE_LIMIT_PEPPER is not configured");
  return createHash("sha256").update(`${scope}\0${identifier}\0${pepper}`).digest("hex");
}

export function requestIp(req: NextRequest) {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || req.headers.get("x-real-ip")?.trim() || "unknown";
}

export async function consumeRateLimit(input: {
  scope: string;
  identifier: string;
  limit: number;
  windowMs: number;
  now?: number;
}): Promise<RateLimitResult> {
  const now = input.now ?? Date.now();
  const freshReset = now + input.windowMs;
  const key = hashIdentifier(input.scope, input.identifier);

  const rows = await prisma.$queryRawUnsafe<Array<{ count: number | bigint; resetAt: number | bigint }>>(
    `INSERT INTO "RateLimitBucket" ("key", "count", "resetAt", "updatedAt")
     VALUES (?, 1, ?, CURRENT_TIMESTAMP)
     ON CONFLICT("key") DO UPDATE SET
       "count" = CASE WHEN "resetAt" <= ? THEN 1 ELSE "count" + 1 END,
       "resetAt" = CASE WHEN "resetAt" <= ? THEN ? ELSE "resetAt" END,
       "updatedAt" = CURRENT_TIMESTAMP
     RETURNING "count", "resetAt"`,
    key,
    freshReset,
    now,
    now,
    freshReset
  );

  const count = Number(rows[0]?.count ?? input.limit + 1);
  const resetAt = Number(rows[0]?.resetAt ?? freshReset);
  return {
    allowed: count <= input.limit,
    count,
    limit: input.limit,
    resetAt,
    retryAfterSeconds: Math.max(1, Math.ceil((resetAt - now) / 1000)),
  };
}

export function rateLimitHeaders(result: RateLimitResult) {
  return {
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(Math.max(0, result.limit - result.count)),
    "X-RateLimit-Reset": String(Math.ceil(result.resetAt / 1000)),
    ...(result.allowed ? {} : { "Retry-After": String(result.retryAfterSeconds) }),
  };
}
