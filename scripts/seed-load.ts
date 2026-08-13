/**
 * A season's worth of work, in one throwaway workspace.
 *
 * Every screen in this system was built and checked against a dozen rows. A mover in
 * Ottawa books a thousand jobs between May and September, and a query that reads the
 * whole table is invisible at ten rows and fatal at ten thousand. This script exists so
 * a number can be measured instead of guessed.
 *
 * The shape of the data matters as much as the count. A uniform spray of rows hides the
 * two things that actually hurt: the seasonal pile-up (half the jobs land in four
 * months, so the "this month" filters read a fat slice, not 1/12th of the table) and the
 * long tail of settled paper the desk still has to skip past. So leads peak in summer,
 * most invoices are paid, a real minority is overdue by a real number of days, and jobs
 * carry the estimates, invoices, payments, expenses and photo records they carry in life.
 *
 * Photos are rows only — no bytes land on disk. The page cost being measured is the
 * database read; the file serving is a separate route with a separate answer.
 *
 * Run from the repository root, so the relative DATABASE_URL lands on ./dev.db:
 *
 *   npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/seed-load.ts
 *   npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/seed-load.ts --purge
 *
 * The workspace is DEMO-plan with a far expiry and a slug of its own. `--purge` removes
 * it whole, in the same order the super-admin panel uses, and is the last step of any
 * measuring session: this data must never be sitting next to a client's.
 *
 * IT REFUSES TO RUN ON A DATABASE THAT HOLDS REAL WORK. The password below is in the
 * repository, so a run against a live installation leaves eight accounts a stranger can
 * read from git — on a workspace that then sits in the owner's own super-admin list.
 * Pass `--yes-i-mean-this-database` to override, which is a sentence you have to type.
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL ?? "file:./dev.db",
});
const prisma = new PrismaClient({ adapter });

/* -------------------------------------------------------------------------- *
 * Arguments
 * -------------------------------------------------------------------------- */

const argv = process.argv.slice(2);
const flag = (name: string) => argv.includes(`--${name}`);
const opt = (name: string, fallback: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};

const SLUG = opt("slug", "loadtest");
const FORCED = flag("yes-i-mean-this-database");
const MONTHS = Number(opt("months", "18"));
const N_LEADS = Number(opt("leads", "5000"));
const N_PROJECTS = Number(opt("projects", "2000"));
const N_INVOICES = Number(opt("invoices", "3000"));
const N_PAYMENTS = Number(opt("payments", "6000"));
const N_CLIENTS = Number(opt("clients", "1400"));
const N_EXPENSES = Number(opt("expenses", "2500"));
const N_ESTIMATES = Number(opt("estimates", "2200"));
const N_TASKS = Number(opt("tasks", "1500"));
const N_PHOTOS = Number(opt("photos", "1200"));
const N_EQUIPMENT = Number(opt("equipment", "800"));
const N_CONTRACTS = Number(opt("contracts", "150"));
const N_AUDIT = Number(opt("audit", "4000"));

/* -------------------------------------------------------------------------- *
 * Deterministic randomness
 * -------------------------------------------------------------------------- */

/**
 * Seeded on purpose. A measurement that runs against different data every time cannot
 * be compared with the one before it, and "the list got faster" would mean nothing.
 */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(Number(opt("seed", "20260813")));
const pick = <T>(list: readonly T[]): T => list[Math.floor(rand() * list.length)];
const int = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
/** True with probability p. Reads better than a bare comparison at the call site. */
const chance = (p: number) => rand() < p;

/**
 * Ids are ours, so relations can be wired without reading a single row back. The slug
 * goes into the id: two load workspaces side by side is the shape the platform actually
 * has — two contractors on one instance — and a shared id space collides on the second.
 */
const NS = SLUG.replace(/[^a-z0-9]/gi, "");
const idOf = (prefix: string, n: number) => `ld${NS}${prefix}${String(n).padStart(8, "0")}`;

/* -------------------------------------------------------------------------- *
 * The trade, in words a dispatcher would recognise
 * -------------------------------------------------------------------------- */

const FIRST = [
  "James", "Marie", "Liam", "Sophie", "Noah", "Chloe", "Ethan", "Amelia", "Lucas",
  "Olivia", "Mason", "Emma", "Logan", "Ava", "Jacob", "Isabella", "Ryan", "Hannah",
  "Daniel", "Zoe", "Nathan", "Leah", "Owen", "Maya", "Adam", "Nora", "Tyler", "Elise",
];
const LAST = [
  "Tremblay", "Gagnon", "Roy", "Côté", "Bouchard", "Morin", "Lavoie", "Fortin",
  "Smith", "Brown", "Wilson", "Taylor", "Nguyen", "Patel", "Kowalski", "Ivanov",
  "O'Brien", "MacDonald", "Leblanc", "Bergeron", "Dubois", "Girard", "Simard",
];
const STREETS = [
  "Bank St", "Merivale Rd", "Carling Ave", "Baseline Rd", "Innes Rd", "Hunt Club Rd",
  "St Laurent Blvd", "Woodroffe Ave", "Greenbank Rd", "Montreal Rd", "Richmond Rd",
  "Prince of Wales Dr", "Conroy Rd", "Jockvale Rd", "Terry Fox Dr", "March Rd",
];
const CITIES = [
  "Ottawa", "Ottawa", "Ottawa", "Nepean", "Kanata", "Orléans", "Barrhaven",
  "Gloucester", "Gatineau", "Stittsville",
];

/** Both verticals in one workspace — the mover's jobs and the renovator's. */
const JOB_TYPES = [
  "Local move — 2 bed", "Local move — 3 bed", "Condo move", "Long-distance move",
  "Packing service", "Piano move", "Office relocation", "Storage shuttle",
  "Kitchen renovation", "Bathroom renovation", "Basement finishing", "Deck build",
  "Flooring install", "Interior painting", "Drywall repair", "Window replacement",
];

const SOURCES = [
  "FACEBOOK", "FACEBOOK", "FACEBOOK", "INSTAGRAM", "GOOGLE", "GOOGLE",
  "HOMESTARS", "KIJIJI", "EMAIL", "MANUAL", "OTHER",
] as const;

const METHODS = ["E_TRANSFER", "E_TRANSFER", "E_TRANSFER", "CASH", "CHEQUE", "CARD"] as const;
const EXPENSE_CATEGORIES = ["MATERIALS", "LABOR", "VEHICLE", "TOOLS", "OTHER"] as const;
const EQUIPMENT_KINDS = [
  "FURNACE", "AC", "HEAT_PUMP", "WATER_HEATER", "BOILER", "THERMOSTAT", "DUCTWORK", "OTHER",
] as const;
const PHOTO_KINDS = ["BEFORE", "BEFORE", "AFTER", "AFTER", "DAMAGE", "DOC"] as const;

/**
 * Ottawa's season, as a mover lives it. May through September is half the year's work;
 * January is the month the phone does not ring. The filters on every screen slice by
 * date, so a flat distribution would understate exactly the query that hurts.
 */
const SEASON = [0.4, 0.4, 0.6, 0.9, 1.6, 2.0, 2.2, 2.0, 1.6, 1.1, 0.7, 0.5];

const NOW = new Date();

/** A timestamp inside the last `MONTHS`, weighted by the season. */
function seasonalDate(): Date {
  const weights: number[] = [];
  let total = 0;
  for (let back = 0; back < MONTHS; back++) {
    const month = (NOW.getMonth() - back + 1200) % 12;
    total += SEASON[month];
    weights.push(total);
  }
  const target = rand() * total;
  const back = weights.findIndex((w) => w >= target);
  const d = new Date(NOW.getFullYear(), NOW.getMonth() - back, 1);
  const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  return new Date(
    d.getFullYear(),
    d.getMonth(),
    int(1, daysInMonth),
    int(7, 19),
    int(0, 59),
    int(0, 59)
  );
}

const addDays = (d: Date, days: number) => new Date(d.getTime() + days * 86_400_000);
const personName = () => `${pick(FIRST)} ${pick(LAST)}`;
const address = () => `${int(1, 3200)} ${pick(STREETS)}`;
const phone = () => `${pick(["613", "343", "819"])}-555-${String(int(0, 9999)).padStart(4, "0")}`;

/* -------------------------------------------------------------------------- *
 * Writing
 * -------------------------------------------------------------------------- */

/**
 * SQLite takes a bounded number of bound parameters per statement, and a wide table at
 * five thousand rows blows straight through it. Chunked, and reported, because a silent
 * eight-minute insert looks like a hang.
 */
async function insert<T>(label: string, rows: T[], write: (chunk: T[]) => Promise<unknown>) {
  const CHUNK = 250;
  const started = Date.now();
  for (let i = 0; i < rows.length; i += CHUNK) {
    await write(rows.slice(i, i + CHUNK));
  }
  console.log(`  ${label.padEnd(16)} ${String(rows.length).padStart(6)} rows  ${Date.now() - started}ms`);
}

async function purge(tenantId: string) {
  // Same order as the super-admin panel: the foreign keys are RESTRICT, and getting
  // this wrong is how tenant deletion broke twice before.
  await prisma.$transaction([
    prisma.auditLog.deleteMany({ where: { tenantId } }),
    prisma.jobPhoto.deleteMany({ where: { tenantId } }),
    prisma.intakeKey.deleteMany({ where: { tenantId } }),
    prisma.expense.deleteMany({ where: { tenantId } }),
    prisma.payment.deleteMany({ where: { tenantId } }),
    prisma.invoice.deleteMany({ where: { tenantId } }),
    prisma.task.deleteMany({ where: { tenantId } }),
    prisma.estimate.deleteMany({ where: { tenantId } }),
    prisma.equipment.deleteMany({ where: { tenantId } }),
    prisma.serviceContract.deleteMany({ where: { tenantId } }),
    prisma.project.deleteMany({ where: { tenantId } }),
    prisma.lead.deleteMany({ where: { tenantId } }),
    prisma.client.deleteMany({ where: { tenantId } }),
    prisma.channelIntegration.deleteMany({ where: { tenantId } }),
    prisma.user.deleteMany({ where: { tenantId } }),
    prisma.tenant.delete({ where: { id: tenantId } }),
  ]);
}

async function main() {
  const existing = await prisma.tenant.findUnique({ where: { slug: SLUG } });

  if (flag("purge")) {
    if (!existing) {
      console.log(`Nothing to purge — no workspace with slug "${SLUG}".`);
      return;
    }
    await purge(existing.id);
    console.log(`Purged workspace "${SLUG}" (${existing.id}).`);
    return;
  }

  /**
   * Never onto a database that is doing real work.
   *
   * `DATABASE_URL` defaults to `./dev.db`, which on a deployed box is the contractor's
   * own book, and the password below is in the repository. A run there leaves eight
   * accounts a stranger can read out of git, on a workspace that then sits in the
   * owner's super-admin list looking legitimate.
   *
   * Any workspace other than this script's own means somebody else's data is here.
   */
  const others = await prisma.tenant.count({ where: { slug: { not: SLUG } } });
  if (others > 0 && !FORCED) {
    console.error(
      `Refusing to seed: this database already holds ${others} other workspace(s).\n` +
        `DATABASE_URL = ${process.env.DATABASE_URL ?? "file:./dev.db"}\n` +
        `Point it at a throwaway file, or pass --yes-i-mean-this-database.`
    );
    process.exitCode = 1;
    return;
  }

  if (existing) {
    // Re-seeding on top would double the volume and make the second measurement
    // incomparable with the first.
    await purge(existing.id);
    console.log(`Removed the previous "${SLUG}" workspace before re-seeding.`);
  }

  const tenantId = `tenant-${SLUG}`;
  // In the repository, therefore public. It only ever protects throwaway rows — the
  // guard above is what keeps those rows off a real installation.
  const password = await bcrypt.hash("loadtest-not-a-real-password", 10);

  console.log(`Seeding "${SLUG}" — ${MONTHS} months of work.`);

  await prisma.tenant.create({
    data: {
      id: tenantId,
      slug: SLUG,
      businessName: "Load Test Movers & Renovations",
      ownerEmail: `owner@${SLUG}.local`,
      businessAddress: "1 Bank St, Ottawa ON K1P 1A1",
      businessPhone: "613-555-0100",
      businessEmail: `office@${SLUG}.local`,
      hstNumber: "123456789RT0001",
      paymentInstructions: "e-Transfer to office@loadtest.local",
      plan: "DEMO",
      // Far enough out that the middleware's expiry gate never fires mid-measurement.
      expiresAt: addDays(NOW, 3650),
    },
  });

  /* Crew ------------------------------------------------------------------ */

  const adminId = idOf("us", 0);
  const crew = [
    { id: adminId, name: "Load Test Owner", email: `owner@${SLUG}.local`, role: "ADMIN" as const },
    ...Array.from({ length: 7 }, (_, i) => ({
      id: idOf("us", i + 1),
      name: `${pick(FIRST)} ${pick(LAST)}`,
      email: `crew${i + 1}@${SLUG}.local`,
      role: "WORKER" as const,
    })),
  ];
  await insert("users", crew, (chunk) =>
    prisma.user.createMany({
      data: chunk.map((u) => ({ ...u, tenantId, password })),
    })
  );
  const workerIds = crew.filter((u) => u.role === "WORKER").map((u) => u.id);

  /* Clients --------------------------------------------------------------- */

  const clients = Array.from({ length: N_CLIENTS }, (_, i) => {
    const createdAt = seasonalDate();
    return {
      id: idOf("cl", i),
      tenantId,
      name: personName(),
      phone: phone(),
      email: `client${i}@example.com`,
      address: address(),
      city: pick(CITIES),
      notes: chance(0.2) ? "Repeat customer — knows the crew" : null,
      createdAt,
      updatedAt: createdAt,
    };
  });
  await insert("clients", clients, (chunk) => prisma.client.createMany({ data: chunk }));

  /* Leads ----------------------------------------------------------------- */

  /**
   * The funnel as it really settles: two fifths convert, a quarter never answer, the
   * rest sit at some stage of the chase. The desk filters on `status` constantly, so
   * this split is what the index has to cope with.
   */
  const leadStatus = () => {
    const r = rand();
    if (r < 0.4) return "CONVERTED" as const;
    if (r < 0.65) return "REJECTED" as const;
    if (r < 0.78) return "VERIFIED" as const;
    if (r < 0.92) return "CONTACTED" as const;
    return "NEW" as const;
  };

  const leads = Array.from({ length: N_LEADS }, (_, i) => {
    const createdAt = seasonalDate();
    const status = leadStatus();
    return {
      id: idOf("ld", i),
      tenantId,
      name: personName(),
      phone: phone(),
      email: `lead${i}@example.com`,
      address: address(),
      city: pick(CITIES),
      source: pick(SOURCES),
      sourceLeadId: chance(0.35) ? `fb-${int(100000, 999999)}` : null,
      jobType: pick(JOB_TYPES),
      notes: chance(0.5) ? "Wants a quote this week" : null,
      status,
      clientId: chance(0.6) ? pick(clients).id : null,
      assignedToId: chance(0.7) ? pick(workerIds) : null,
      createdAt,
      updatedAt: addDays(createdAt, int(0, 6)),
    };
  });
  await insert("leads", leads, (chunk) => prisma.lead.createMany({ data: chunk }));

  /* Projects -------------------------------------------------------------- */

  /**
   * A converted lead becomes a job. `Project.leadId` is unique, so the pairing is
   * one-to-one and taken off the front of the converted pile.
   */
  const converted = leads.filter((l) => l.status === "CONVERTED");
  const clientById = new Map(clients.map((c) => [c.id, c]));

  const projectStatus = () => {
    const r = rand();
    if (r < 0.7) return "COMPLETED" as const;
    if (r < 0.82) return "SCHEDULED" as const;
    if (r < 0.92) return "IN_PROGRESS" as const;
    return "CANCELLED" as const;
  };

  const projects = Array.from({ length: N_PROJECTS }, (_, i) => {
    const lead = converted[i];
    const createdAt = lead ? lead.createdAt : seasonalDate();
    const status = projectStatus();
    const scheduledDate = addDays(createdAt, int(2, 30));
    const client = (lead?.clientId ? clientById.get(lead.clientId) : undefined) ?? pick(clients);
    return {
      id: idOf("pr", i),
      tenantId,
      leadId: lead ? lead.id : null,
      clientId: client.id,
      clientName: client.name,
      phone: client.phone,
      email: client.email,
      address: client.address,
      title: `${pick(JOB_TYPES)} — ${client.address}`,
      description: "Booked off the quiz landing page. Crew of two, 26ft truck.",
      jobType: pick(JOB_TYPES),
      status,
      scheduledDate,
      completedDate: status === "COMPLETED" ? addDays(scheduledDate, int(0, 2)) : null,
      assignedToId: chance(0.85) ? pick(workerIds) : null,
      createdAt,
      updatedAt: addDays(createdAt, int(1, 40)),
    };
  });
  await insert("projects", projects, (chunk) => prisma.project.createMany({ data: chunk }));

  /* Estimates ------------------------------------------------------------- */

  const lineJson = (count: number, rate: number) =>
    JSON.stringify(
      Array.from({ length: count }, (_, k) => ({
        description: k === 0 ? "Crew and truck" : pick(["Packing materials", "Stairs surcharge", "Disposal", "Extra stop"]),
        qty: int(1, 12),
        unit: k === 0 ? "hr" : "ea",
        unitPriceCents: k === 0 ? rate : int(2500, 18000),
      }))
    );

  const estimates = Array.from({ length: N_ESTIMATES }, (_, i) => {
    const project = projects[i % projects.length];
    const subtotalCents = int(45000, 1_450_000);
    const taxCents = Math.round(subtotalCents * 0.13);
    return {
      id: idOf("es", i),
      tenantId,
      projectId: project.id,
      lineItems: lineJson(int(2, 6), int(14000, 26000)),
      subtotalCents,
      taxCents,
      totalCents: subtotalCents + taxCents,
      notes: "Valid 30 days. Deposit secures the date.",
      validUntil: addDays(project.createdAt, 30),
      status: chance(0.65) ? ("ACCEPTED" as const) : chance(0.5) ? ("SENT" as const) : ("DRAFT" as const),
      createdAt: addDays(project.createdAt, int(0, 3)),
    };
  });
  await insert("estimates", estimates, (chunk) => prisma.estimate.createMany({ data: chunk }));

  /* Invoices -------------------------------------------------------------- */

  /**
   * Numbering is per tenant per year and unique, so the counter is kept per year here
   * exactly as the route keeps it.
   */
  const yearSeq = new Map<number, number>();
  const nextNumber = (issuedAt: Date) => {
    const year = issuedAt.getFullYear();
    const n = (yearSeq.get(year) ?? 0) + 1;
    yearSeq.set(year, n);
    return `INV-${year}-${String(n).padStart(4, "0")}`;
  };

  /**
   * Most paper is settled. What matters for the desk is the minority that is not: a
   * SENT invoice past its due date is the row the chase lane, the dashboard and the
   * reminder job all go looking for.
   */
  const invoiceStatus = () => {
    const r = rand();
    if (r < 0.6) return "PAID" as const;
    if (r < 0.8) return "SENT" as const;
    if (r < 0.88) return "PARTIAL" as const;
    if (r < 0.95) return "DRAFT" as const;
    return "VOID" as const;
  };

  const invoices = Array.from({ length: N_INVOICES }, (_, i) => {
    const project = projects[i % projects.length];
    const issuedAt = addDays(project.createdAt, int(1, 20));
    const status = invoiceStatus();
    const subtotalCents = int(45000, 1_450_000);
    const taxCents = Math.round(subtotalCents * 0.13);
    // A fifth of the open paper is genuinely late, by a spread of days that walks the
    // whole chase ladder — remind, call, escalate.
    const overdue = (status === "SENT" || status === "PARTIAL") && chance(0.35);
    const dueDate = overdue ? addDays(NOW, -int(1, 75)) : addDays(issuedAt, 14);
    const kind = chance(0.25) ? (chance(0.5) ? ("DEPOSIT" as const) : ("BALANCE" as const)) : ("FULL" as const);
    return {
      id: idOf("in", i),
      tenantId,
      kind,
      projectId: project.id,
      estimateId: chance(0.6) ? idOf("es", i % N_ESTIMATES) : null,
      number: nextNumber(issuedAt),
      clientName: project.clientName,
      address: project.address,
      email: project.email,
      lineItems: lineJson(int(2, 5), int(14000, 26000)),
      subtotalCents,
      taxCents,
      totalCents: subtotalCents + taxCents,
      notes: null,
      status,
      issuedAt,
      dueDate,
      sentAt: status === "DRAFT" ? null : addDays(issuedAt, 1),
      paidAt: status === "PAID" ? addDays(issuedAt, int(2, 40)) : null,
      remindedAt: overdue && chance(0.5) ? addDays(NOW, -int(1, 10)) : null,
      reminderCount: overdue ? int(0, 3) : 0,
      createdAt: issuedAt,
      updatedAt: issuedAt,
    };
  });
  await insert("invoices", invoices, (chunk) => prisma.invoice.createMany({ data: chunk }));

  /* Payments -------------------------------------------------------------- */

  /**
   * Money is booked against an invoice and a job together — that is the pair the P&L,
   * the job card and the client balance all read back.
   */
  const payable = invoices.filter((i) => i.status === "PAID" || i.status === "PARTIAL");
  const payments = Array.from({ length: N_PAYMENTS }, (_, i) => {
    const invoice = payable[i % payable.length];
    const full = invoice.status === "PAID";
    return {
      id: idOf("pm", i),
      tenantId,
      projectId: invoice.projectId,
      invoiceId: invoice.id,
      amountCents: full
        ? Math.round(invoice.totalCents / 2)
        : Math.round(invoice.totalCents * (0.2 + rand() * 0.4)),
      method: pick(METHODS),
      date: addDays(invoice.issuedAt, int(1, 45)),
      notes: chance(0.15) ? "Deposit taken on site" : null,
    };
  });
  await insert("payments", payments, (chunk) => prisma.payment.createMany({ data: chunk }));

  /* Expenses -------------------------------------------------------------- */

  const expenses = Array.from({ length: N_EXPENSES }, (_, i) => {
    const project = chance(0.85) ? projects[i % projects.length] : null;
    return {
      id: idOf("ex", i),
      tenantId,
      projectId: project ? project.id : null,
      amountCents: int(1500, 180_000),
      category: pick(EXPENSE_CATEGORIES),
      description: pick(["Fuel", "Boxes and wrap", "Subcontract labour", "Dump fees", "Truck rental", "Blades and bits"]),
      date: project ? addDays(project.createdAt, int(0, 10)) : seasonalDate(),
      receiptUrl: null,
    };
  });
  await insert("expenses", expenses, (chunk) => prisma.expense.createMany({ data: chunk }));

  /* Tasks ----------------------------------------------------------------- */

  const tasks = Array.from({ length: N_TASKS }, (_, i) => {
    const project = projects[i % projects.length];
    const r = rand();
    return {
      id: idOf("tk", i),
      tenantId,
      projectId: chance(0.9) ? project.id : null,
      title: pick(["Confirm elevator booking", "Call client the night before", "Order materials", "Photo the damage", "Collect balance"]),
      description: null,
      assignedToId: pick(workerIds),
      createdById: adminId,
      dueDate: addDays(project.createdAt, int(1, 20)),
      status: r < 0.6 ? ("DONE" as const) : r < 0.85 ? ("TODO" as const) : ("IN_PROGRESS" as const),
      createdAt: project.createdAt,
    };
  });
  await insert("tasks", tasks, (chunk) => prisma.task.createMany({ data: chunk }));

  /* Equipment and contracts ----------------------------------------------- */

  const equipment = Array.from({ length: N_EQUIPMENT }, (_, i) => {
    const client = clients[i % clients.length];
    const installedAt = addDays(client.createdAt, -int(0, 3000));
    return {
      id: idOf("eq", i),
      tenantId,
      clientId: client.id,
      projectId: chance(0.4) ? projects[i % projects.length].id : null,
      kind: pick(EQUIPMENT_KINDS),
      brand: pick(["Carrier", "Lennox", "Goodman", "Trane", "Napoleon", "Rheem"]),
      model: `M-${int(1000, 9999)}`,
      serial: `SN${int(100000, 999999)}`,
      location: pick(["Basement", "Utility room", "Attic", "Side of house"]),
      installedAt,
      warrantyUntil: addDays(installedAt, 3650),
      notes: null,
      createdAt: client.createdAt,
      updatedAt: client.createdAt,
    };
  });
  await insert("equipment", equipment, (chunk) => prisma.equipment.createMany({ data: chunk }));

  const contracts = Array.from({ length: N_CONTRACTS }, (_, i) => {
    const client = clients[i % clients.length];
    return {
      id: idOf("sc", i),
      tenantId,
      clientId: client.id,
      equipmentId: equipment[i % equipment.length].id,
      name: pick(["Seasonal maintenance", "Spring and fall tune-up", "Annual furnace service"]),
      visitMonths: JSON.stringify(chance(0.5) ? [4, 10] : [int(1, 12)]),
      pricePerVisitCents: int(12000, 42000),
      autoInvoice: chance(0.3),
      active: chance(0.85),
      startedOn: client.createdAt,
      notes: null,
      createdAt: client.createdAt,
      updatedAt: client.createdAt,
    };
  });
  await insert("contracts", contracts, (chunk) => prisma.serviceContract.createMany({ data: chunk }));

  /* Photos ---------------------------------------------------------------- */

  // Rows only: the file route is measured separately, and 1200 real JPEGs would say
  // nothing about the query cost this script exists to expose.
  const photos = Array.from({ length: N_PHOTOS }, (_, i) => {
    const project = projects[i % projects.length];
    return {
      id: idOf("ph", i),
      tenantId,
      projectId: project.id,
      kind: pick(PHOTO_KINDS),
      path: `${tenantId}/${project.id}/${idOf("ph", i)}.jpg`,
      mime: "image/jpeg",
      sizeBytes: int(180_000, 4_200_000),
      caption: chance(0.4) ? "Condition on arrival" : null,
      uploadedById: pick(workerIds),
      createdAt: addDays(project.createdAt, int(0, 5)),
    };
  });
  await insert("photos", photos, (chunk) => prisma.jobPhoto.createMany({ data: chunk }));

  /* Journal --------------------------------------------------------------- */

  const audit = Array.from({ length: N_AUDIT }, (_, i) => {
    const invoice = invoices[i % invoices.length];
    return {
      id: idOf("au", i),
      tenantId,
      actorId: adminId,
      actorName: "Load Test Owner",
      action: pick(["invoice.issue", "invoice.pay", "invoice.status", "payment.delete", "expense.create"]),
      entity: "Invoice",
      entityId: invoice.id,
      summary: `Issued ${invoice.number} to ${invoice.clientName}`,
      meta: JSON.stringify({ totalCents: invoice.totalCents }),
      createdAt: invoice.issuedAt,
    };
  });
  await insert("journal", audit, (chunk) => prisma.auditLog.createMany({ data: chunk }));

  console.log(`\nWorkspace "${SLUG}" is ready. Sign in as ${crew[0].email}.`);
  console.log(`Remove it with:  npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/seed-load.ts --purge\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
