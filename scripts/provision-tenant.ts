/**
 * Opens a workspace for a paying contractor from the command line.
 *
 * Self-service registration is a different animal: it always opens a trial, seeds sample
 * leads and invoices, and derives the slug from the business name. A client who paid gets
 * an empty desk and the slug we sold him, so provisioning lives here instead.
 *
 * Run (from the repository root, so DATABASE_URL's relative path lands on ./dev.db):
 *
 *   npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/provision-tenant.ts \
 *     --business "Korvex Developments" --slug korvex --owner vlad@korvex.ca --plan paid \
 *     --worker "Ivan Petrov <ivan@korvex.ca>" --worker dana@korvex.ca
 *
 * Passwords are never accepted as arguments — argv is world-readable in `ps` and lands in
 * the shell history. Either let the script mint one and copy it from the output once, or
 * feed it on stdin with `--owner-password-stdin < secret.txt`.
 */
import "dotenv/config";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const BCRYPT_ROUNDS = 12;
const MIN_PASSWORD_LENGTH = 10;

// Slugs become subdomains, so these would either shadow platform hosts or collide with
// the fallback slug that `slugFromHost` returns for a bare apex.
const RESERVED_SLUGS = new Set([
  "www", "api", "app", "admin", "mail", "smtp", "static", "assets",
  "login", "register", "expired", "demo", "test", "staging",
]);

const SUPER_ADMIN_EMAILS = (process.env.SUPER_ADMIN_EMAILS || "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

/** Empty means the super-admin panel is switched off, so no slug can be the platform's. */
const PLATFORM_TENANT_SLUG = (process.env.PLATFORM_TENANT_SLUG || "").trim().toLowerCase();

type WorkerSpec = { name: string; email: string };

type Args = {
  business: string;
  ownerName: string;
  slug: string;
  owner: string;
  plan: string;
  workers: string[];
  trialDays: number;
  domain: string;
  ownerPasswordStdin: boolean;
  addWorkers: boolean;
  resetPassword: string;
};

const USAGE = `
provision-tenant — open a workspace for a paying client

  --business "<name>"        business name shown in the app        (required)
  --slug <slug>              subdomain / workspace slug            (required)
  --owner <email>            owner's login, becomes ADMIN          (required)
  --owner-name "<name>"      person's name in the journal; defaults to the business name
  --plan paid|demo           default: paid
  --trial-days <n>           demo plan only, default 14
  --worker "Name <email>"    repeatable; may also be a bare email
  --domain <host>            base host, only used to print the login URL
  --owner-password-stdin     read the owner's password from stdin instead of minting one
  --add-workers              existing workspace: add the missing workers, touch nothing else
  --reset-password <email>   existing workspace: mint a new password for that one account
`;

function parseArgs(argv: string[]): Args {
  const args: Args = {
    business: "",
    ownerName: "",
    slug: "",
    owner: "",
    plan: "paid",
    workers: [],
    trialDays: 14,
    domain: "",
    ownerPasswordStdin: false,
    addWorkers: false,
    resetPassword: "",
  };

  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = () => {
      const v = argv[++i];
      if (v === undefined) fail(`${flag} needs a value`);
      return v;
    };

    if (flag === "-h" || flag === "--help") {
      process.stdout.write(USAGE);
      process.exit(0);
    }

    switch (flag) {
      case "--business": args.business = value().trim(); break;
      case "--slug": args.slug = value().trim().toLowerCase(); break;
      case "--owner": args.owner = value().trim().toLowerCase(); break;
      case "--owner-name": args.ownerName = value().trim(); break;
      case "--plan": args.plan = value().trim().toLowerCase(); break;
      case "--trial-days": args.trialDays = Number(value()); break;
      case "--worker": args.workers.push(value().trim()); break;
      case "--domain": args.domain = value().trim().replace(/^https?:\/\//, ""); break;
      case "--owner-password-stdin": args.ownerPasswordStdin = true; break;
      case "--add-workers": args.addWorkers = true; break;
      case "--reset-password": args.resetPassword = value().trim().toLowerCase(); break;
      default: fail(`unknown argument: ${flag}`);
    }
  }

  return args;
}

function fail(message: string): never {
  process.stderr.write(`provision-tenant: ${message}\n`);
  process.exit(2);
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/** "Ivan Petrov <ivan@korvex.ca>" or a bare address, whose local part becomes the name. */
function parseWorker(spec: string): WorkerSpec | null {
  const angled = spec.match(/^(.*?)<([^>]+)>$/);
  if (angled) {
    const name = angled[1].trim();
    const email = angled[2].trim().toLowerCase();
    if (!name || !isEmail(email)) return null;
    return { name, email };
  }

  const email = spec.trim().toLowerCase();
  if (!isEmail(email)) return null;
  const local = email.split("@")[0].replace(/[._-]+/g, " ");
  const name = local.replace(/\b\w/g, (c) => c.toUpperCase());
  return { name, email };
}

/** ~20 chars of base64url. Long enough that the 10-char floor is never the binding limit. */
function mintPassword(): string {
  return crypto.randomBytes(15).toString("base64url");
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

const prisma = new PrismaClient({
  adapter: new PrismaBetterSqlite3({ url: process.env.DATABASE_URL ?? "file:./dev.db" }),
});

async function main() {
  const args = parseArgs(process.argv.slice(2));

  // Everything is validated before the first write: a workspace half-created because the
  // third worker had a typo in his address is worse than a workspace not created at all.
  const problems: string[] = [];

  // A reset touches one existing account, so the workspace's own details are not asked for.
  const resetting = !!args.resetPassword;

  if (!args.slug) problems.push("--slug is required");
  if (!resetting && !args.business) problems.push("--business is required");
  if (!resetting && !args.owner) problems.push("--owner is required");
  if (resetting && !isEmail(args.resetPassword)) {
    problems.push(`--reset-password "${args.resetPassword}" is not a valid email`);
  }
  if (resetting && (args.addWorkers || args.workers.length)) {
    problems.push("--reset-password does one thing only; run it on its own");
  }

  if (args.slug && !/^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])$/.test(args.slug)) {
    problems.push(`--slug "${args.slug}": 2-40 chars, lowercase letters, digits and inner hyphens`);
  }
  if (!resetting && RESERVED_SLUGS.has(args.slug)) {
    problems.push(`--slug "${args.slug}" is reserved by the platform`);
  }
  if (args.owner && !isEmail(args.owner)) {
    problems.push(`--owner "${args.owner}" is not a valid email`);
  }
  // The signup form bans operator addresses outright; here they are allowed in exactly
  // one place — the platform's own workspace, which is where the panel expects them.
  // Anywhere else the client would inherit super-admin rights over every tenant.
  const isPlatformWorkspace = !!PLATFORM_TENANT_SLUG && args.slug === PLATFORM_TENANT_SLUG;
  if (SUPER_ADMIN_EMAILS.includes(args.owner) && !isPlatformWorkspace) {
    problems.push(
      `--owner "${args.owner}" is a platform operator address; it belongs only in the ` +
        `workspace named by PLATFORM_TENANT_SLUG`
    );
  }
  if (args.plan !== "paid" && args.plan !== "demo") {
    problems.push(`--plan "${args.plan}": expected "paid" or "demo"`);
  }
  if (args.plan === "demo" && (!Number.isFinite(args.trialDays) || args.trialDays < 1)) {
    problems.push("--trial-days must be a positive number");
  }

  const workers: WorkerSpec[] = [];
  const seen = new Set<string>([args.owner]);
  for (const spec of args.workers) {
    const worker = parseWorker(spec);
    if (!worker) {
      problems.push(`--worker "${spec}": expected "Name <email>" or a bare email`);
      continue;
    }
    if (seen.has(worker.email)) {
      problems.push(`--worker "${worker.email}" is listed twice (or equals the owner)`);
      continue;
    }
    if (SUPER_ADMIN_EMAILS.includes(worker.email) && !isPlatformWorkspace) {
      problems.push(`--worker "${worker.email}" is a platform operator address`);
      continue;
    }
    seen.add(worker.email);
    workers.push(worker);
  }

  if (problems.length) {
    process.stderr.write("Nothing was written. Fix these first:\n");
    for (const p of problems) process.stderr.write(`  · ${p}\n`);
    process.exit(2);
  }

  const existing = await prisma.tenant.findUnique({
    where: { slug: args.slug },
    include: { users: { select: { id: true, name: true, email: true, role: true } } },
  });

  if (resetting) {
    if (!existing) fail(`no workspace with the slug "${args.slug}"`);

    const target = existing.users.find((u) => u.email === args.resetPassword);
    if (!target) {
      fail(`«${existing.businessName}» has no account ${args.resetPassword}`);
    }

    let secret = "";
    if (args.ownerPasswordStdin) {
      secret = (await readStdin()).split("\n")[0].trim();
      if (secret.length < MIN_PASSWORD_LENGTH) {
        fail(`the password on stdin is shorter than ${MIN_PASSWORD_LENGTH} characters`);
      }
    } else {
      secret = mintPassword();
    }

    const password = await bcrypt.hash(secret, BCRYPT_ROUNDS);

    // The old hash is overwritten, so a reset locks out whoever held the old password —
    // which is the point when a phone with a saved session walks off a job site.
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: target.id }, data: { password } });
      await tx.auditLog.create({
        data: {
          tenantId: existing.id,
          actorId: target.id,
          actorName: "platform operator",
          action: "user.password_reset",
          entity: "User",
          entityId: target.id,
          summary: `Reset the password of ${target.name} (${target.email})`,
          meta: JSON.stringify({ email: target.email, via: "provision-tenant" }),
        },
      });
    });

    printCredentials(args, existing.businessName, existing.plan, null, [
      { name: target.name, email: target.email, secret: args.ownerPasswordStdin ? "(the password you piped in)" : secret, role: target.role },
    ]);
    return;
  }

  if (existing && !args.addWorkers) {
    const created = existing.createdAt.toISOString().slice(0, 10);
    process.stdout.write(
      `The slug "${args.slug}" is already taken by «${existing.businessName}» ` +
        `(${existing.plan}, opened ${created}, owner ${existing.ownerEmail}, ` +
        `${existing.users.length} account(s)).\n` +
        "Nothing was changed — this workspace already exists.\n" +
        "  · another client with a similar name → pick a different --slug\n" +
        "  · the same client, new crew members  → re-run with --add-workers\n" +
        "  · a lost password                    → --reset-password <email>\n"
    );
    return;
  }

  let ownerPassword = "";
  if (!existing) {
    if (args.ownerPasswordStdin) {
      ownerPassword = (await readStdin()).split("\n")[0].trim();
      if (ownerPassword.length < MIN_PASSWORD_LENGTH) {
        fail(`the password on stdin is shorter than ${MIN_PASSWORD_LENGTH} characters`);
      }
    } else {
      ownerPassword = mintPassword();
    }
  }

  // Only the accounts that are actually missing get a password minted, so a re-run with
  // --add-workers never rotates the credentials a crew member is already using.
  const known = new Set(existing ? existing.users.map((u) => u.email) : []);
  const fresh = workers
    .filter((w) => !known.has(w.email))
    .map((w) => ({ ...w, secret: mintPassword() }));

  if (existing && !fresh.length) {
    process.stdout.write(
      `«${existing.businessName}» already has every listed account. Nothing was changed.\n`
    );
    return;
  }

  // Hashing happens outside the transaction: bcrypt at 12 rounds takes a quarter of a
  // second each, and holding the SQLite write lock through a whole crew blocks the app.
  const [ownerHash, ...workerHashes] = await Promise.all([
    ownerPassword ? bcrypt.hash(ownerPassword, BCRYPT_ROUNDS) : Promise.resolve(""),
    ...fresh.map((w) => bcrypt.hash(w.secret, BCRYPT_ROUNDS)),
  ]);

  if (existing) {
    // The owner's own journal answers "where did this account come from" the same way
    // it does for a crew member added from Settings → Team.
    const actorId = (existing.users.find((u) => u.role === "ADMIN") ?? existing.users[0])?.id ?? "";

    await prisma.$transaction(async (tx) => {
      for (let i = 0; i < fresh.length; i++) {
        const user = await tx.user.create({
          data: {
            tenantId: existing.id,
            name: fresh[i].name,
            email: fresh[i].email,
            password: workerHashes[i],
            role: "WORKER",
          },
        });

        await tx.auditLog.create({
          data: {
            tenantId: existing.id,
            actorId,
            actorName: "platform operator",
            action: "user.add",
            entity: "User",
            entityId: user.id,
            summary: `Added ${user.name} (${user.email}) to the crew as WORKER`,
            meta: JSON.stringify({ role: "WORKER", email: user.email, via: "provision-tenant" }),
          },
        });
      }
    });

    printCredentials(args, existing.businessName, existing.plan, null, fresh);
    return;
  }

  const expiresAt =
    args.plan === "demo" ? new Date(Date.now() + args.trialDays * 24 * 60 * 60 * 1000) : null;

  const tenantId = await prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.create({
      data: {
        slug: args.slug,
        businessName: args.business,
        ownerEmail: args.owner,
        plan: args.plan === "demo" ? "DEMO" : "PAID",
        expiresAt,
      },
    });

    const admin = await tx.user.create({
      data: {
        tenantId: tenant.id,
        name: args.ownerName || args.business,
        email: args.owner,
        password: ownerHash,
        role: "ADMIN",
      },
    });

    for (let i = 0; i < fresh.length; i++) {
      await tx.user.create({
        data: {
          tenantId: tenant.id,
          name: fresh[i].name,
          email: fresh[i].email,
          password: workerHashes[i],
          role: "WORKER",
        },
      });
    }

    // The first line of the workspace's own history: months later "who opened this and
    // when" is answered by the journal the owner can read, not by a shell transcript.
    await tx.auditLog.create({
      data: {
        tenantId: tenant.id,
        actorId: admin.id,
        actorName: "platform operator",
        action: "tenant.provision",
        entity: "Tenant",
        entityId: tenant.id,
        summary:
          `Opened workspace «${args.business}» on the ${args.plan.toUpperCase()} plan ` +
          `with ${fresh.length} crew account(s)`,
        meta: JSON.stringify({ slug: args.slug, workers: fresh.length }),
      },
    });

    return tenant.id;
  });

  // No sample data. A contractor who paid opens an empty desk instead of sweeping out
  // invented leads and invoices before he can trust a single number on the screen.
  // A password fed on stdin is already in the operator's hands; echoing it back would
  // only copy it into one more terminal scrollback.
  process.stdout.write(`Workspace created: ${tenantId}\n`);
  printCredentials(
    args,
    args.business,
    args.plan.toUpperCase(),
    args.ownerPasswordStdin ? null : ownerPassword,
    fresh
  );
}

function printCredentials(
  args: Args,
  businessName: string,
  plan: string,
  ownerPassword: string | null,
  workers: Array<{ name: string; email: string; secret: string; role?: string }>
) {
  const loginUrl = args.domain
    ? `https://${args.slug}.${args.domain}/login`
    : `http://localhost:3000/login?tenant=${args.slug}`;

  const out: string[] = [];
  out.push("");
  out.push("─".repeat(72));
  out.push(`  ${businessName}  ·  ${args.slug}  ·  ${plan}`);
  out.push(`  ${loginUrl}`);
  out.push("─".repeat(72));
  if (ownerPassword) {
    out.push(`  OWNER   ${args.owner}`);
    out.push(`          ${ownerPassword}`);
  } else if (args.ownerPasswordStdin) {
    out.push(`  OWNER   ${args.owner}`);
    out.push("          (the password you piped in)");
  }
  for (const w of workers) {
    out.push(`  ${(w.role ?? "WORKER").padEnd(6)}  ${w.email}  (${w.name})`);
    out.push(`          ${w.secret}`);
  }
  out.push("─".repeat(72));
  out.push("  Shown once. Only the hashes are stored, so a lost password is reset,");
  out.push("  never recovered. Hand these over one by one, and have each person");
  out.push("  change theirs on first sign-in.");
  out.push("");
  process.stdout.write(out.join("\n"));
}

main()
  .catch((err) => {
    process.stderr.write(`provision-tenant: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 3;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
