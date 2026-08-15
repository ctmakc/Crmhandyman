import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";

export interface AuditEventInput {
  tenantId: string;
  actorEmail?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  summary?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface AuditEventRow {
  id: string;
  tenantId: string;
  actorEmail: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  summary: string | null;
  metadata: string | null;
  createdAt: string;
}

let auditTableReady: Promise<void> | null = null;

function ensureAuditTable() {
  if (!auditTableReady) {
    auditTableReady = (async () => {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "AuditEvent" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "tenantId" TEXT NOT NULL,
          "actorEmail" TEXT,
          "action" TEXT NOT NULL,
          "entityType" TEXT NOT NULL,
          "entityId" TEXT,
          "summary" TEXT,
          "metadata" TEXT,
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "AuditEvent_tenantId_fkey"
            FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id")
            ON DELETE RESTRICT ON UPDATE CASCADE
        )
      `);
      await prisma.$executeRawUnsafe(
        `CREATE INDEX IF NOT EXISTS "AuditEvent_tenantId_createdAt_idx" ON "AuditEvent"("tenantId", "createdAt")`
      );
      await prisma.$executeRawUnsafe(
        `CREATE INDEX IF NOT EXISTS "AuditEvent_entityType_entityId_idx" ON "AuditEvent"("entityType", "entityId")`
      );
    })();
  }
  return auditTableReady;
}

function serializeMetadata(metadata?: Record<string, unknown> | null) {
  if (!metadata) return null;
  const json = JSON.stringify(metadata);
  return json.length > 12_000 ? `${json.slice(0, 11_900)}…` : json;
}

export async function writeAuditEvent(input: AuditEventInput) {
  try {
    await ensureAuditTable();
    const id = randomUUID();
    await prisma.$executeRawUnsafe(
      `INSERT INTO "AuditEvent"
        ("id", "tenantId", "actorEmail", "action", "entityType", "entityId", "summary", "metadata", "createdAt")
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      id,
      input.tenantId,
      input.actorEmail ?? null,
      input.action,
      input.entityType,
      input.entityId ?? null,
      input.summary ?? null,
      serializeMetadata(input.metadata)
    );
    return id;
  } catch (error) {
    // A journal failure must be visible to operators, but must not make an already
    // committed customer/payment mutation look as if it never happened.
    console.error("AUDIT_WRITE_FAILED", error);
    return null;
  }
}

export async function listAuditEvents(input: {
  tenantId: string;
  limit?: number;
  entityType?: string | null;
  entityId?: string | null;
}) {
  await ensureAuditTable();
  const limit = Math.max(1, Math.min(input.limit ?? 100, 200));
  const clauses = [`"tenantId" = ?`];
  const values: unknown[] = [input.tenantId];

  if (input.entityType) {
    clauses.push(`"entityType" = ?`);
    values.push(input.entityType);
  }
  if (input.entityId) {
    clauses.push(`"entityId" = ?`);
    values.push(input.entityId);
  }

  values.push(limit);
  return prisma.$queryRawUnsafe<AuditEventRow[]>(
    `SELECT "id", "tenantId", "actorEmail", "action", "entityType", "entityId", "summary", "metadata", "createdAt"
       FROM "AuditEvent"
      WHERE ${clauses.join(" AND ")}
      ORDER BY "createdAt" DESC
      LIMIT ?`,
    ...values
  );
}
