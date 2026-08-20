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
// The one SMTP transport in the product — the same one the overdue reminders send through —
// and the pure copy for this mail. Reached by relative path because this script runs under
// ts-node without the `@/` alias.
import { mailer, smtpConfigured, smtpFrom } from "../src/lib/mailer";
import { approvalEmailCopy, type ApprovalTarget } from "../src/lib/approval-email";

/**
 * The email /pending promises.
 *
 * The waiting room tells a new owner "you get an email when approved" — and until now no
 * email was ever sent, so a workspace could go live and its owner never know. Approval is
 * the moment that promise comes due, so this fires it here, on the PENDING→ACTIVE step.
 *
 * Best-effort, like every other send in the product: if SMTP is not configured we say so on
 * stdout (the operator approving the workspace is standing right here) rather than pretend a
 * mail went out, and a transport that throws is reported, never fatal — the approval already
 * happened and must not be undone by a mail server having a bad minute.
 */
async function sendApprovalEmail(tenant: ApprovalTarget) {
  const copy = approvalEmailCopy(tenant);
  if (!smtpConfigured()) {
    process.stdout.write(
      `  ! SMTP is not configured — no email sent. Tell the owner (${tenant.ownerEmail}) they can sign in at ${copy.signInUrl}\n`
    );
    return;
  }
  try {
    await mailer().sendMail({
      from: smtpFrom(tenant.businessName),
      to: tenant.ownerEmail,
      subject: copy.subject,
      text: copy.body.join("\n\n"),
      html: copy.body.map((p) => `<p>${p}</p>`).join(""),
    });
    process.stdout.write(`  ✓ Emailed ${tenant.ownerEmail} — signs in at ${copy.signInUrl}\n`);
  } catch (e) {
    process.stdout.write(
      `  ! Could not email ${tenant.ownerEmail} (${e instanceof Error ? e.message : String(e)}). They can sign in at ${copy.signInUrl}\n`
    );
  }
}

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
    // `tenant` still holds the status read before the update, so this fires once, on the real
    // PENDING→ACTIVE transition — never when re-approving an already-active workspace.
    if (status === "ACTIVE" && tenant.status === "PENDING") {
      await sendApprovalEmail({ slug, businessName: tenant.businessName, ownerEmail: tenant.ownerEmail });
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
