/**
 * Approve (or suspend) a self-serve workspace.
 *
 * A workspace opened through "Continue with Google" starts PENDING and no one can sign in
 * until it is approved here. This is the human in "self-serve with moderation".
 *
 *   npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/approve-tenant.ts --slug acme
 *   npx ts-node ... scripts/approve-tenant.ts --slug acme --status SUSPENDED
 *   npx ts-node ... scripts/approve-tenant.ts --list-pending
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const adapter = new PrismaBetterSqlite3({ url });
  const prisma = new PrismaClient({ adapter });

  try {
    if (process.argv.includes("--list-pending")) {
      const pending = await prisma.tenant.findMany({
        where: { status: "PENDING" },
        select: { slug: true, businessName: true, ownerEmail: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      });
      if (!pending.length) {
        process.stdout.write("No workspaces awaiting approval.\n");
        return;
      }
      process.stdout.write(`${pending.length} awaiting approval:\n`);
      for (const t of pending) {
        process.stdout.write(`  ${t.slug.padEnd(24)} ${t.businessName}  <${t.ownerEmail}>  ${t.createdAt.toISOString().slice(0, 10)}\n`);
      }
      return;
    }

    const slug = arg("slug");
    if (!slug) throw new Error("pass --slug <workspace> (or --list-pending)");

    // Remove a workspace outright — for clearing a rejected or test sign-up. Deletes the
    // users first (the FK is RESTRICT), then the tenant. A workspace that has done real
    // work would hit other RESTRICT relations and stop here, which is the safe outcome.
    if (process.argv.includes("--delete")) {
      const t = await prisma.tenant.findUnique({ where: { slug } });
      if (!t) throw new Error(`no workspace with slug "${slug}"`);
      await prisma.user.deleteMany({ where: { tenantId: t.id } });
      await prisma.tenant.delete({ where: { id: t.id } });
      process.stdout.write(`Deleted workspace ${t.businessName} (${slug}).\n`);
      return;
    }
    const status = (arg("status") || "ACTIVE").toUpperCase();
    if (!["ACTIVE", "PENDING", "SUSPENDED"].includes(status)) {
      throw new Error(`--status must be ACTIVE, PENDING or SUSPENDED (got ${status})`);
    }

    const tenant = await prisma.tenant.findUnique({ where: { slug } });
    if (!tenant) throw new Error(`no workspace with slug "${slug}"`);

    await prisma.tenant.update({
      where: { slug },
      data: { status: status as "ACTIVE" | "PENDING" | "SUSPENDED" },
    });
    process.stdout.write(`${tenant.businessName} (${slug}): ${tenant.status} → ${status}\n`);
    if (status === "ACTIVE" && tenant.status === "PENDING") {
      process.stdout.write(`  The owner can now sign in with Google at their workspace.\n`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
