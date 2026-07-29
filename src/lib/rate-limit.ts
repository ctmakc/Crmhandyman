import "server-only";

import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type RateLimitRow = {
  count: number | bigint;
  windowStart: number | bigint;
  expiresAt: number | bigint;
};

export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
  resetAt: Date;
};

function bucketKey(scope: string, identifier: string) {
  const digest = createHash("sha256").update(identifier, "utf8").digest("hex");
  return `${scope.slice(0, 80)}:${digest}`;
}

export async function consumeRateLimit(input: {
  scope: string;
  identifier: string;
  limit: number;
  windowMs: number;
  now?: number;
}): Promise<RateLimitResult> {
  if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 100_000) {
    throw new Error("Rate-limit count must be a positive integer.");
  }
  if (!Number.isInteger(input.windowMs) || input.windowMs < 1_000 || input.windowMs > 31_536_000_000) {
    throw new Error("Rate-limit window is outside the allowed range.");
  }
  if (!input.scope.trim() || !input.identifier.trim()) {
    throw new Error("Rate-limit scope and identifier are required.");
  }

  const now = input.now ?? Date.now();
  const nextExpiry = now + input.windowMs;
  const key = bucketKey(input.scope.trim(), input.identifier.trim());

  const rows = await prisma.$queryRaw<RateLimitRow[]>(Prisma.sql`
    INSERT INTO RateLimitBucket ("key", "count", "windowStart", "expiresAt", "updatedAt")
    VALUES (${key}, 1, ${now}, ${nextExpiry}, CURRENT_TIMESTAMP)
    ON CONFLICT("key") DO UPDATE SET
      "count" = CASE
        WHEN RateLimitBucket."expiresAt" <= ${now} THEN 1
        ELSE RateLimitBucket."count" + 1
      END,
      "windowStart" = CASE
        WHEN RateLimitBucket."expiresAt" <= ${now} THEN ${now}
        ELSE RateLimitBucket."windowStart"
      END,
      "expiresAt" = CASE
        WHEN RateLimitBucket."expiresAt" <= ${now} THEN ${nextExpiry}
        ELSE RateLimitBucket."expiresAt"
      END,
      "updatedAt" = CURRENT_TIMESTAMP
    RETURNING "count", "windowStart", "expiresAt"
  `);

  const row = rows[0];
  if (!row) throw new Error("Unable to persist rate-limit bucket.");

  const count = Number(row.count);
  const expiresAt = Number(row.expiresAt);
  const allowed = count <= input.limit;
  return {
    allowed,
    limit: input.limit,
    remaining: Math.max(input.limit - count, 0),
    retryAfterSeconds: allowed ? 0 : Math.max(Math.ceil((expiresAt - now) / 1000), 1),
    resetAt: new Date(expiresAt),
  };
}

export function rateLimitHeaders(result: RateLimitResult) {
  return {
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(Math.ceil(result.resetAt.getTime() / 1000)),
    ...(result.allowed ? {} : { "Retry-After": String(result.retryAfterSeconds) }),
  };
}

export async function pruneExpiredRateLimits(now = Date.now()) {
  const retentionCutoff = now - 24 * 60 * 60 * 1000;
  return prisma.$executeRaw(Prisma.sql`
    DELETE FROM RateLimitBucket WHERE "expiresAt" < ${retentionCutoff}
  `);
}
