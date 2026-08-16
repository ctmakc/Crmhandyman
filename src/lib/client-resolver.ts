import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Attach a record to a Client, creating one only when nothing matches.
 *
 * Same conservative rules as the Wave 2 backfill (prisma/backfill-clients.ts): phone,
 * then email, then name + street. A wrong merge glues two customers together silently,
 * which is worse than a duplicate a human can merge later.
 */
export interface ClientDetails {
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
}

/**
 * The resolver reads and may CREATE, so a caller that also creates the record hanging off
 * the client — a job, most of all — must be able to hand in its own transaction handle.
 * Off the shared `prisma`, a customer minted here survives a caller that then throws, and
 * the crew has no button to delete a client. Inside the caller's `$transaction`, the mint
 * rolls back with everything else. `Prisma.TransactionClient` and the base client share
 * the model methods this file touches, so one signature serves both.
 */
type Db = typeof prisma | Prisma.TransactionClient;

const digits = (s?: string | null) => (s || "").replace(/\D/g, "");
const norm = (s?: string | null) => (s || "").trim().toLowerCase().replace(/\s+/g, " ");
const street = (s?: string | null) => norm(s).split(",")[0];

export async function resolveClient(tenantId: string, details: ClientDetails, db: Db = prisma) {
  const phone = digits(details.phone);
  if (phone.length >= 7) {
    // SQLite cannot strip punctuation in SQL, so the digit comparison happens here.
    const candidates = await db.client.findMany({
      where: { tenantId, phone: { not: null } },
      select: { id: true, phone: true },
      orderBy: { createdAt: "asc" },
    });
    const hit = candidates.find((c) => digits(c.phone) === phone);
    if (hit) return hit.id;
  }

  const email = norm(details.email);
  if (email) {
    const byEmail = await db.client.findFirst({ where: { tenantId, email: details.email } });
    if (byEmail) return byEmail.id;
  }

  if (norm(details.name)) {
    const sameName = await db.client.findMany({
      where: { tenantId, name: details.name },
      select: { id: true, address: true },
    });
    const hit = sameName.find((c) => street(c.address) === street(details.address));
    if (hit) return hit.id;
  }

  const created = await db.client.create({
    data: {
      tenantId,
      name: details.name || "Unnamed client",
      phone: details.phone || undefined,
      email: details.email || undefined,
      address: details.address || undefined,
      city: details.city || undefined,
    },
  });
  return created.id;
}
