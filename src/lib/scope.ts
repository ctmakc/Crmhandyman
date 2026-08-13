import { prisma } from "@/lib/prisma";

/**
 * Ids that arrive in a request body are claims, not facts.
 *
 * `tenantId` has always come from the session, which made the routes look safe: the row
 * is created with the caller's tenant. The row it POINTS AT is a different question.
 * A stranger posting `projectId` of someone else's job wrote a payment, an expense or a
 * task that the victim's job card then read back through the relation — an invented
 * $9,999 collection the victim could not even delete, because deletion is scoped and
 * the phantom belonged to the attacker's tenant.
 *
 * `assignedToId` is the same hole pointed at people: work handed to a stranger's
 * employee, whose name the lead list then rendered back to the attacker.
 *
 * Every route that accepts either field resolves it here, so there is one door.
 */

export type Scoped<T> = { ok: true; value: T } | { ok: false };

/** Blank, missing or the literal empty string all mean "no id given". */
function absent(raw: unknown): boolean {
  return raw === undefined || raw === null || raw === "";
}

/** Resolves an optional projectId to one this workspace owns. */
export async function scopedProjectId(
  tenantId: string,
  raw: unknown
): Promise<Scoped<string | undefined>> {
  if (absent(raw)) return { ok: true, value: undefined };
  if (typeof raw !== "string") return { ok: false };

  const owned = await prisma.project.findFirst({
    where: { id: raw, tenantId },
    select: { id: true },
  });
  return owned ? { ok: true, value: owned.id } : { ok: false };
}

/** Resolves an optional assignee to a member of this crew. */
export async function scopedUserId(
  tenantId: string,
  raw: unknown
): Promise<Scoped<string | undefined>> {
  if (absent(raw)) return { ok: true, value: undefined };
  if (typeof raw !== "string") return { ok: false };

  const owned = await prisma.user.findFirst({
    where: { id: raw, tenantId },
    select: { id: true },
  });
  return owned ? { ok: true, value: owned.id } : { ok: false };
}

/**
 * Resolves an optional clientId to a customer this workspace owns.
 *
 * The job form posts `clientId` when the dispatcher picks an existing customer, and the
 * route took it as fact. A stranger posting the victim's clientId hung a whole job — with
 * its payments, its costs and its lifetime value — off the victim's customer record, on
 * the victim's own screen, and the row carried the attacker's tenant so it could not be
 * deleted from the other side.
 */
export async function scopedClientId(
  tenantId: string,
  raw: unknown
): Promise<Scoped<string | undefined>> {
  if (absent(raw)) return { ok: true, value: undefined };
  if (typeof raw !== "string") return { ok: false };

  const owned = await prisma.client.findFirst({
    where: { id: raw, tenantId },
    select: { id: true },
  });
  return owned ? { ok: true, value: owned.id } : { ok: false };
}

/**
 * Resolves an optional equipmentId to a unit this workspace services. A service contract
 * pointed at a stranger's furnace read its make, model and serial straight back out
 * through the contract list.
 */
export async function scopedEquipmentId(
  tenantId: string,
  raw: unknown
): Promise<Scoped<string | undefined>> {
  if (absent(raw)) return { ok: true, value: undefined };
  if (typeof raw !== "string") return { ok: false };

  const owned = await prisma.equipment.findFirst({
    where: { id: raw, tenantId },
    select: { id: true },
  });
  return owned ? { ok: true, value: owned.id } : { ok: false };
}
