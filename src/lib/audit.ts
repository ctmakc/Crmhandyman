import type { Session } from "next-auth";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/utils";
import { formatCents } from "@/lib/money";
import { sessionTenant } from "@/lib/session";

/**
 * THE JOURNAL (ROADMAP 5.2). A dispute is settled by reading one line of this out
 * loud — "who dropped the price", "I already paid that in cash" — so an entry is a
 * finished English sentence about money and paper, not a field-level diff.
 *
 * Append-only by construction: nothing here updates or deletes, and no route offers it.
 */

export type AuditActor = {
  id: string;
  /** Supplying it saves a lookup — the guard identity carries an id and no name. */
  name?: string | null;
};

export type AuditEntry = {
  tenantId: string;
  actor: AuditActor;
  /** `entity.verb`, lowercase: invoice.pay, payment.delete, user.add. */
  action: string;
  /** Model name as written in the schema, so `?entity=Invoice&entityId=…` filters cleanly. */
  entity: string;
  entityId: string;
  /** Already formatted for a human. Nothing downstream reformats it. */
  summary: string;
  meta?: Record<string, unknown>;
};

/**
 * Formatters re-exported so a call site adds one import for the whole journal line.
 * Money in a summary must read exactly as it reads on the paper the client is holding,
 * so `money()` takes cents like every other formatter in the system.
 */
export { formatCents as money, formatDate as day };

/** Routes holding the raw session instead of a guard identity get their actor here. */
export function actorFromSession(session: Session): AuditActor {
  return { id: sessionTenant(session).id, name: session.user?.name };
}

export async function record(entry: AuditEntry): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        tenantId: entry.tenantId,
        actorId: entry.actor.id,
        actorName: await actorName(entry.actor, entry.tenantId),
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId,
        summary: entry.summary,
        meta: entry.meta ? JSON.stringify(entry.meta) : null,
      },
    });
  } catch (e) {
    // The journal is a witness, never a gate. Losing the line about a payment beats
    // losing the payment because writing the line failed.
    console.error(`[audit] ${entry.action} on ${entry.entity} ${entry.entityId} not recorded:`, e);
  }
}

/**
 * "Kitchen Renovation — Dave Kowalski" for a summary. Tenant-scoped like every other
 * read, and silent on failure: a summary that degrades is better than a 500 after the
 * money has already been written.
 */
export async function jobLabel(tenantId: string, projectId: string): Promise<string> {
  try {
    const project = await prisma.project.findFirst({
      where: { id: projectId, tenantId },
      select: { title: true, clientName: true },
    });
    if (project) return `${project.title} — ${project.clientName}`;
  } catch (e) {
    console.error("[audit] job label lookup failed:", e);
  }
  return `job ${projectId.slice(-4).toUpperCase()}`;
}

/** Name as of the action: a later rename must not rewrite what the journal says happened. */
async function actorName(actor: AuditActor, tenantId: string): Promise<string> {
  const given = actor.name?.trim();
  if (given) return given;

  const user = await prisma.user.findFirst({
    where: { id: actor.id, tenantId },
    select: { name: true },
  });
  return user?.name?.trim() || "Unknown";
}
