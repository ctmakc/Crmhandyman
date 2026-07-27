/**
 * Wave 2 backfill: turn the loose `clientName` strings on jobs and leads into real
 * Client rows, then point everything at them.
 *
 * Matching is deliberately conservative — a wrong merge silently glues two customers
 * together and is far more damaging than leaving a duplicate for a human to merge:
 *
 *   1. same tenant AND same normalised phone   → same client
 *   2. same tenant AND same normalised email   → same client
 *   3. same tenant AND same name + same street → same client
 *   otherwise → a new client
 *
 * Idempotent: rows that already carry a clientId are left alone, so it is safe to
 * re-run after importing more data.
 */
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const prisma = new PrismaClient({
  adapter: new PrismaBetterSqlite3({ url: process.env.DATABASE_URL ?? "file:./dev.db" }),
});

const digits = (s?: string | null) => (s || "").replace(/\D/g, "");
const norm = (s?: string | null) => (s || "").trim().toLowerCase().replace(/\s+/g, " ");
/** Street part only — "18 Larkspur Cres, Ottawa" and "18 Larkspur Cres" are one home. */
const street = (s?: string | null) => norm(s).split(",")[0];

interface Candidate {
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
}

async function main() {
  const tenants = await prisma.tenant.findMany({ select: { id: true } });
  let created = 0;
  let linked = 0;

  for (const tenant of tenants) {
    const existing = await prisma.client.findMany({ where: { tenantId: tenant.id } });

    const byPhone = new Map<string, string>();
    const byEmail = new Map<string, string>();
    const byNameStreet = new Map<string, string>();

    const index = (id: string, c: Candidate) => {
      const p = digits(c.phone);
      if (p.length >= 7) byPhone.set(p, id);
      const e = norm(c.email);
      if (e) byEmail.set(e, id);
      const ns = `${norm(c.name)}|${street(c.address)}`;
      if (norm(c.name)) byNameStreet.set(ns, id);
    };

    for (const c of existing) index(c.id, c);

    const resolve = async (c: Candidate): Promise<string> => {
      const p = digits(c.phone);
      if (p.length >= 7 && byPhone.has(p)) return byPhone.get(p)!;
      const e = norm(c.email);
      if (e && byEmail.has(e)) return byEmail.get(e)!;
      const ns = `${norm(c.name)}|${street(c.address)}`;
      if (byNameStreet.has(ns)) return byNameStreet.get(ns)!;

      const client = await prisma.client.create({
        data: {
          tenantId: tenant.id,
          name: c.name || "Unnamed client",
          phone: c.phone || undefined,
          email: c.email || undefined,
          address: c.address || undefined,
          city: c.city || undefined,
        },
      });
      created++;
      index(client.id, c);
      return client.id;
    };

    // Jobs first — they carry the address, which makes them the better seed record.
    const projects = await prisma.project.findMany({
      where: { tenantId: tenant.id, clientId: null },
      orderBy: { createdAt: "asc" },
    });
    for (const p of projects) {
      const clientId = await resolve({
        name: p.clientName,
        phone: p.phone,
        email: p.email,
        address: p.address,
      });
      await prisma.project.update({ where: { id: p.id }, data: { clientId } });
      linked++;
    }

    const leads = await prisma.lead.findMany({
      where: { tenantId: tenant.id, clientId: null },
      orderBy: { createdAt: "asc" },
    });
    for (const l of leads) {
      // A rejected lead is not a customer — do not manufacture a client record for it.
      if (l.status === "REJECTED") continue;
      const clientId = await resolve({
        name: l.name,
        phone: l.phone,
        email: l.email,
        address: l.address,
        city: l.city,
      });
      await prisma.lead.update({ where: { id: l.id }, data: { clientId } });
      linked++;
    }

    // Fill in blanks on clients that were seeded from a record missing contact details.
    for (const client of await prisma.client.findMany({ where: { tenantId: tenant.id } })) {
      if (client.phone && client.email && client.address) continue;
      const job = await prisma.project.findFirst({
        where: { clientId: client.id },
        orderBy: { createdAt: "asc" },
      });
      const lead = await prisma.lead.findFirst({
        where: { clientId: client.id },
        orderBy: { createdAt: "asc" },
      });
      await prisma.client.update({
        where: { id: client.id },
        data: {
          phone: client.phone ?? job?.phone ?? lead?.phone ?? undefined,
          email: client.email ?? job?.email ?? lead?.email ?? undefined,
          address: client.address ?? job?.address ?? lead?.address ?? undefined,
          city: client.city ?? lead?.city ?? undefined,
        },
      });
    }
  }

  console.log(`Clients created: ${created}. Records linked: ${linked}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
