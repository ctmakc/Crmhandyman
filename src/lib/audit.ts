import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type AuditWriter = Pick<Prisma.TransactionClient, "$executeRaw">;

export type AuditActor = {
  type: "USER" | "SYSTEM" | "WEBHOOK";
  id?: string | null;
  email?: string | null;
};

export type AuditInput = {
  actor: AuditActor;
  action: string;
  targetType: string;
  targetId?: string | null;
  tenantId?: string | null;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
};

function clean(value: string | null | undefined, maxLength: number) {
  return (value ?? "").trim().slice(0, maxLength) || null;
}

function safeMetadata(metadata: Record<string, unknown> | undefined) {
  if (!metadata) return "{}";
  try {
    const json = JSON.stringify(metadata);
    return json.length <= 20_000 ? json : JSON.stringify({ truncated: true });
  } catch {
    return JSON.stringify({ serializationFailed: true });
  }
}

export function hashAuditIdentifier(value: string | null | undefined) {
  const normalized = (value ?? "").trim();
  if (!normalized) return null;
  const pepper = process.env.AUDIT_HASH_PEPPER || process.env.NEXTAUTH_SECRET || "development-only";
  return createHash("sha256").update(`${pepper}:${normalized}`, "utf8").digest("hex");
}

export async function recordAuditEvent(
  input: AuditInput,
  db: AuditWriter = prisma
) {
  const action = clean(input.action, 120);
  const targetType = clean(input.targetType, 120);
  if (!action || !targetType) throw new Error("Audit action and target type are required.");

  const id = randomUUID();
  await db.$executeRaw(Prisma.sql`
    INSERT INTO AuditEvent (
      "id", "actorType", "actorId", "actorEmail", "tenantId", "action",
      "targetType", "targetId", "metadataJson", "ipHash", "createdAt"
    ) VALUES (
      ${id}, ${input.actor.type}, ${clean(input.actor.id, 160)},
      ${clean(input.actor.email?.toLowerCase(), 320)}, ${clean(input.tenantId, 160)},
      ${action}, ${targetType}, ${clean(input.targetId, 240)},
      ${safeMetadata(input.metadata)}, ${hashAuditIdentifier(input.ipAddress)}, CURRENT_TIMESTAMP
    )
  `);
  return id;
}

export function requestIp(headers: Headers) {
  return (
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headers.get("x-real-ip") ||
    null
  );
}
