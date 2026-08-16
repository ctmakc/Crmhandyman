/**
 * Fills ONE workspace with a believable, current HVAC + moving contractor's world — the
 * data an owner shows a prospect over their shoulder without having to apologise for a
 * screen. It is the presentation cousin of `demo-fill.ts`: that one dresses the dev
 * database (first tenant it finds, sample-grade), this one dresses a NAMED workspace to
 * production polish so it can be walked through live on `<slug>.agintent.com`.
 *
 * The difference that matters to a prospect is coherence. Every job points at a real
 * client, the iron on that client's card is the iron the job replaces, the estimate that
 * was accepted is the estimate the invoice was cut from, and the money on the ledger is
 * the money the payments add up to — to the cent, priced through the same `money.ts`
 * helpers the live app prices with. Nothing here is a number typed twice.
 *
 * Run (from the repository root, so DATABASE_URL's relative path lands on ./dev.db):
 *
 *   npx ts-node --compiler-options '{"module":"CommonJS"}' prisma/present-fill.ts --slug northwind
 *
 * The workspace must already exist — open it first with `scripts/provision-tenant.ts`.
 * Slug resolution: `--slug <slug>` wins, then `PRESENT_SLUG`, then the dev default `demo`.
 *
 * Idempotent-ish. The first run stamps the workspace's own journal with a
 * `present.fill` entry; a second run sees the stamp and refuses, so a nervous operator
 * cannot double the leads an hour before the meeting. Re-seed a wiped workspace with
 * `PRESENT_FORCE=1`.
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import {
  DEFAULT_TAX_RATE,
  formatCents,
  lineItemsFromInput,
  lineItemsToJson,
  quoteTotals,
  shareOfCents,
  toCents,
} from "../src/lib/money";

const prisma = new PrismaClient({
  adapter: new PrismaBetterSqlite3({ url: process.env.DATABASE_URL ?? "file:./dev.db" }),
});

/** A demo crew signs in with this if the workspace had no workers of its own (see DEMO.md). */
const DEMO_CREW_PASSWORD = "crew-demo-4821";
const BCRYPT_ROUNDS = 12;

function argOf(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/** A day of the CURRENT week, so the board a prospect sees is always "this week". */
function dayOfThisWeek(offsetFromSunday: number, hour = 9) {
  const d = new Date();
  d.setHours(hour, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay() + offsetFromSunday);
  return d;
}

/** N days back from now — for lead age on the call sheet and for the older, overdue paper. */
function daysAgo(n: number, hour = 10) {
  const d = new Date();
  d.setHours(hour, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return d;
}

/** N days ahead — invoice due dates that have not lapsed yet. */
function daysAhead(n: number) {
  return new Date(Date.now() + n * 24 * 60 * 60 * 1000);
}

/**
 * Empty a workspace of everything a visitor could have touched, so a fresh presentation
 * world can be laid over it. Deleted from the leaves inward: money before the paper before
 * the job, so no foreign key ever blocks. The tenant, its admin and its crew stay — only
 * the demonstrable content and any invites/keys a curious visitor made are cleared. This is
 * for the demo workspace ONLY; run against a real shop and it erases their books.
 */
async function wipe(tenantId: string) {
  const t = { tenantId };
  await prisma.payment.deleteMany({ where: t });
  await prisma.expense.deleteMany({ where: t });
  await prisma.invoice.deleteMany({ where: t });
  await prisma.estimate.deleteMany({ where: t });
  await prisma.task.deleteMany({ where: t });
  await prisma.jobPhoto.deleteMany({ where: t });
  await prisma.project.deleteMany({ where: t });
  await prisma.lead.deleteMany({ where: t });
  await prisma.equipment.deleteMany({ where: t });
  await prisma.serviceContract.deleteMany({ where: t });
  await prisma.client.deleteMany({ where: t });
  await prisma.invite.deleteMany({ where: t });
  await prisma.intakeKey.deleteMany({ where: t });
  await prisma.channelIntegration.deleteMany({ where: t });
  await prisma.auditLog.deleteMany({ where: t });
}

async function main() {
  const slug = (argOf("slug") || process.env.PRESENT_SLUG || "demo").trim().toLowerCase();
  const reset = process.env.PRESENT_RESET === "1" || process.argv.includes("--reset");
  const force = reset || process.env.PRESENT_FORCE === "1" || process.argv.includes("--force");

  const tenant = await prisma.tenant.findUnique({ where: { slug } });
  if (!tenant) {
    throw new Error(
      `No workspace with slug "${slug}". Open it first:\n` +
        `  npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/provision-tenant.ts ` +
        `--business "Northwind Mechanical & Movers" --slug ${slug} --owner owner@example.ca`
    );
  }

  // --reset wipes the workspace clean first, so a demo a visitor poked at comes back pristine
  // on the next cron run. It also implies --force, so the fill proceeds over the wiped world.
  if (reset) {
    await wipe(tenant.id);
    console.log(`Wiped «${tenant.businessName}» (${slug}) — re-dressing.`);
  }

  // The guard. A workspace already dressed for a demo carries this stamp in its own journal;
  // running twice would only double the pipeline the day of the meeting.
  const already = await prisma.auditLog.findFirst({
    where: { tenantId: tenant.id, action: "present.fill" },
  });
  if (already && !force) {
    console.log(
      `«${tenant.businessName}» (${slug}) is already dressed for a demo ` +
        `(stamped ${already.createdAt.toISOString().slice(0, 10)}). ` +
        `Nothing changed — set PRESENT_FORCE=1 to seed it again over a wipe.`
    );
    return;
  }

  const admin = await prisma.user.findFirst({ where: { tenantId: tenant.id, role: "ADMIN" } });
  if (!admin) throw new Error(`«${tenant.businessName}» has no ADMIN account to own the journal`);

  // The crew. A provisioned workspace already carries its own workers; a bare one (the dev
  // "demo" tenant with only the seed's crew, say) gets a two-person shop so the board can
  // show who is out. New accounts are minted only when they are missing, so a re-run over a
  // real workspace never rotates a tech's password.
  let workers = await prisma.user.findMany({ where: { tenantId: tenant.id, role: "WORKER" } });
  if (workers.length < 2) {
    const crewSeed = [
      { name: "Sam Carrière", email: `sam.hvac@${slug}.demo` },
      { name: "Dylan Roy", email: `dylan.moves@${slug}.demo` },
    ];
    const hash = await bcrypt.hash(DEMO_CREW_PASSWORD, BCRYPT_ROUNDS);
    for (const c of crewSeed) {
      const exists = await prisma.user.findUnique({
        where: { email_tenantId: { email: c.email, tenantId: tenant.id } },
      });
      if (!exists) {
        await prisma.user.create({
          data: { tenantId: tenant.id, name: c.name, email: c.email, password: hash, role: "WORKER" },
        });
      }
    }
    workers = await prisma.user.findMany({ where: { tenantId: tenant.id, role: "WORKER" } });
  }
  // The HVAC hand and the mover — jobs are assigned along the trade so the load lines read
  // like a real shop's week, and nobody is double-booked (a clean board, not an angry one).
  const hvac = workers[0] ?? admin;
  const mover = workers[1] ?? workers[0] ?? admin;

  // The letterhead. An invoice with no HST number is one a business client sends back, so a
  // presentation workspace needs a complete top-of-page — but only if the operator has not
  // already typed the real shop's details in Settings. Untouched fields only.
  await prisma.tenant.update({
    where: { id: tenant.id },
    data: {
      businessName: tenant.businessName || "Northwind Mechanical & Movers",
      businessAddress: tenant.businessAddress ?? "24 Colonnade Rd, Unit 5, Ottawa, ON  K2E 7J6",
      businessPhone: tenant.businessPhone ?? "613-555-0170",
      businessEmail: tenant.businessEmail ?? `office@${slug}.agintent.com`,
      hstNumber: tenant.hstNumber ?? "81974 2203 RT0001",
      paymentInstructions:
        tenant.paymentInstructions ??
        "e-Transfer to office@northwind.ca (auto-deposit). Cheques payable to Northwind " +
          "Mechanical & Movers. Net 15 on service; 50% deposit on installs.",
    },
  });

  /* --------------------------------------------------------------------- *
   * Clients — the customers the jobs and the iron hang off.
   * --------------------------------------------------------------------- */
  const client = {
    liam: await prisma.client.create({
      data: {
        tenantId: tenant.id, name: "Liam O'Doherty", phone: "613-555-0142",
        email: "liam.od@example.ca", address: "9 Fescue Cres", city: "Kanata",
        notes: "Replacing a dying gas furnace with a cold-climate heat pump. Rebate paperwork started.",
      },
    }),
    gabriela: await prisma.client.create({
      data: {
        tenantId: tenant.id, name: "Gabriela Santos", phone: "613-555-0188",
        email: "g.santos@example.ca", address: "42 Cinnamon Way", city: "Barrhaven",
        notes: "Furnace + AC both original to the 2011 build. Wants it done before the cold snap.",
      },
    }),
    aisha: await prisma.client.create({
      data: {
        tenantId: tenant.id, name: "Aisha Mahmoud", phone: "613-555-0155",
        email: "aisha.m@example.ca", address: "15 Sparkle Lane", city: "Orleans",
        notes: "3-bed move within Orleans. Piano on the main floor, ground-floor destination.",
      },
    }),
    meadowbrook: await prisma.client.create({
      data: {
        tenantId: tenant.id, name: "Meadowbrook Dental", phone: "613-555-0199",
        email: "office@meadowbrookdental.ca", address: "220 Greenbank Rd, Suite 3", city: "Nepean",
        notes: "Commercial rooftop unit. Spring/fall service contract, invoices to the practice.",
      },
    }),
    ferndale: await prisma.client.create({
      data: {
        tenantId: tenant.id, name: "The Ferndale Residence", phone: "613-555-0121",
        email: "ferndale.home@example.ca", address: "88 Birchwood Ave", city: "Ottawa",
        notes: "Annual furnace maintenance plan. Duct cleaning add-on this visit.",
      },
    }),
    nadia: await prisma.client.create({
      data: {
        tenantId: tenant.id, name: "Nadia Volkov", phone: "613-555-0108",
        email: "n.volkov@example.ca", address: "3 Maple Grove Rd", city: "Nepean",
        notes: "Pre-season furnace tune-up. Invoice went out; still chasing payment.",
      },
    }),
    northgate: await prisma.client.create({
      data: {
        tenantId: tenant.id, name: "Northgate Logistics", phone: "819-555-0114",
        email: "facilities@northgate-logistics.ca", address: "1200 Industrial Ave", city: "Ottawa",
        notes: "Warehouse relocation, phased. Phase 1 quoted; awaiting sign-off from facilities.",
      },
    }),
  };

  /* --------------------------------------------------------------------- *
   * The iron on site. Warranty dates carry meaning on the client dossier —
   * an active plate reads emerald, an expired one rose — so the set is mixed
   * on purpose: the furnace being replaced is out of warranty, the units the
   * shop installed are years inside theirs.
   * --------------------------------------------------------------------- */
  await prisma.equipment.create({
    data: {
      tenantId: tenant.id, clientId: client.liam.id, kind: "FURNACE", brand: "Goodman",
      model: "GMS8-060", serial: "0904-118722", location: "Basement mechanical room",
      installedAt: new Date("2009-11-03"), warrantyUntil: new Date("2019-11-03"),
      notes: "Cracked heat exchanger suspected. Being removed on this install.",
    },
  });
  await prisma.equipment.create({
    data: {
      tenantId: tenant.id, clientId: client.gabriela.id, kind: "AC", brand: "Lennox",
      model: "13ACX-030", serial: "5811G-40277", location: "Side yard pad",
      installedAt: new Date("2011-06-18"), warrantyUntil: new Date("2021-06-18"),
      notes: "R-22 system, low on charge. Replaced with the new condenser.",
    },
  });
  const rtu = await prisma.equipment.create({
    data: {
      tenantId: tenant.id, clientId: client.meadowbrook.id, kind: "HEAT_PUMP", brand: "Carrier",
      model: "50TCQ-A05", serial: "2109C-88301", location: "Rooftop, north bay",
      installedAt: new Date("2021-05-12"), warrantyUntil: new Date("2031-05-12"),
      notes: "5-ton packaged rooftop unit serving the front practice.",
    },
  });
  const ferndaleFurnace = await prisma.equipment.create({
    data: {
      tenantId: tenant.id, clientId: client.ferndale.id, kind: "FURNACE", brand: "Trane",
      model: "S9V2-080", serial: "2003T-51190", location: "Basement",
      installedAt: new Date("2020-10-02"), warrantyUntil: new Date("2030-10-02"),
      notes: "Under the annual maintenance plan.",
    },
  });
  await prisma.equipment.create({
    data: {
      tenantId: tenant.id, clientId: client.nadia.id, kind: "FURNACE", brand: "Napoleon",
      model: "9600-120", serial: "2201N-20884", location: "Utility closet",
      installedAt: new Date("2022-09-14"), warrantyUntil: new Date("2032-09-14"),
    },
  });

  /* --------------------------------------------------------------------- *
   * Service contracts — the recurring revenue an HVAC shop lives on.
   * --------------------------------------------------------------------- */
  const meadowbrookContract = await prisma.serviceContract.create({
    data: {
      tenantId: tenant.id, clientId: client.meadowbrook.id, equipmentId: rtu.id,
      name: "Commercial RTU — spring & fall service", visitMonths: JSON.stringify([4, 10]),
      pricePerVisitCents: toCents(340), autoInvoice: true, active: true,
      startedOn: new Date("2024-04-08"),
      notes: "Two visits a year, invoiced to the practice on completion.",
    },
  });
  await prisma.serviceContract.create({
    data: {
      tenantId: tenant.id, clientId: client.ferndale.id, equipmentId: ferndaleFurnace.id,
      name: "Annual furnace maintenance", visitMonths: JSON.stringify([10]),
      pricePerVisitCents: toCents(189), autoInvoice: false, active: true,
      startedOn: new Date("2021-10-05"),
    },
  });

  /* --------------------------------------------------------------------- *
   * The call sheet — a dozen leads across every channel and stage, aged so the
   * "on the phone" side has fresh ones and ones going rose past three days.
   * --------------------------------------------------------------------- */
  const leadSpecs: Array<{
    key?: string; name: string; city: string; jobType: string; phone: string;
    source: string; status: string; ageDays: number; notes?: string; email?: string;
  }> = [
    { name: "Robert Chen", city: "Ottawa", jobType: "Water heater replacement", phone: "613-555-0231", source: "EMAIL", status: "NEW", ageDays: 0, email: "r.chen@example.ca", notes: "Tank leaking. Wants a quote for a tankless swap." },
    { name: "Priya Raman", city: "Kanata", jobType: "AC not cooling", phone: "613-555-0244", source: "GOOGLE", status: "NEW", ageDays: 0 },
    { name: "Marc Tremblay", city: "Gatineau", jobType: "2-bed apartment move", phone: "819-555-0117", source: "FACEBOOK", status: "NEW", ageDays: 1 },
    { name: "Ingrid Sørensen", city: "Stittsville", jobType: "Heat pump — interested", phone: "613-555-0262", source: "INSTAGRAM", status: "CONTACTED", ageDays: 1, notes: "[10 AUG 09:12] Left voicemail, sent rebate one-pager.\n[11 AUG 14:40] Called back — booking a site visit next week." },
    { name: "Helen Okafor", city: "Barrhaven", jobType: "Ductwork cleaning", phone: "613-555-0176", source: "HOMESTARS", status: "CONTACTED", ageDays: 2 },
    { name: "Dave Kowalski", city: "Ottawa", jobType: "Furnace replacement quote", phone: "613-555-0281", source: "GOOGLE", status: "VERIFIED", ageDays: 3, notes: "Site measured. Quote to follow this week." },
    { name: "Tomasz Nowak", city: "Orleans", jobType: "Furnace making noise", phone: "613-555-0155", source: "GOOGLE", status: "CONTACTED", ageDays: 4, notes: "Aging — needs a callback." },
    { name: "Sandra Bélanger", city: "Nepean", jobType: "Office relocation", phone: "613-555-0293", source: "KIJIJI", status: "VERIFIED", ageDays: 5 },
    { name: "Fatima Al-Sayed", city: "Kanata", jobType: "Whole-home humidifier", phone: "613-555-0207", source: "FACEBOOK", status: "VERIFIED", ageDays: 6 },
    { name: "Greg Sandhu", city: "Stittsville", jobType: "AC maintenance plan", phone: "613-555-0313", source: "HOMESTARS", status: "REJECTED", ageDays: 8, notes: "Went with a cheaper quote. Keep on file for the fall." },
    { key: "liam", name: "Liam O'Doherty", city: "Kanata", jobType: "Heat pump install", phone: "613-555-0142", source: "GOOGLE", status: "CONVERTED", ageDays: 12, email: "liam.od@example.ca" },
    { key: "aisha", name: "Aisha Mahmoud", city: "Orleans", jobType: "3-bedroom move", phone: "613-555-0155", source: "KIJIJI", status: "CONVERTED", ageDays: 10, email: "aisha.m@example.ca" },
  ];

  const leadByKey: Record<string, string> = {};
  for (const l of leadSpecs) {
    const created = await prisma.lead.create({
      data: {
        tenantId: tenant.id, name: l.name, phone: l.phone, email: l.email, city: l.city,
        jobType: l.jobType, notes: l.notes, source: l.source as never, status: l.status as never,
        // Two of them are the same person as a client — link them so the dossier shows the
        // lead that became the job.
        clientId: l.key === "liam" ? client.liam.id : l.key === "aisha" ? client.aisha.id : undefined,
        createdAt: daysAgo(l.ageDays, 8 + (leadSpecs.indexOf(l) % 6)),
        updatedAt: daysAgo(Math.max(l.ageDays - 1, 0), 9),
      },
    });
    if (l.key) leadByKey[l.key] = created.id;
  }

  /* --------------------------------------------------------------------- *
   * The week board — jobs booked, one in progress, a couple done. Assigned
   * along the trade, non-overlapping, all dated inside this week (the older
   * tune-up sits a month back to carry the overdue invoice).
   * --------------------------------------------------------------------- */
  const job = {
    heatPump: await prisma.project.create({
      data: {
        tenantId: tenant.id, clientId: client.liam.id, leadId: leadByKey.liam,
        clientName: client.liam.name, address: `${client.liam.address}, ${client.liam.city}`,
        phone: client.liam.phone, title: "Heat pump install — 3-ton cold-climate",
        jobType: "HVAC install", status: "IN_PROGRESS",
        scheduledDate: dayOfThisWeek(2, 7), durationMinutes: 480, assignedToId: hvac.id,
        description: "Remove gas furnace, install Mitsubishi hyper-heat system + air handler.",
      },
    }),
    furnaceAc: await prisma.project.create({
      data: {
        tenantId: tenant.id, clientId: client.gabriela.id,
        clientName: client.gabriela.name, address: `${client.gabriela.address}, ${client.gabriela.city}`,
        phone: client.gabriela.phone, title: "Furnace + AC replacement",
        jobType: "HVAC install", status: "SCHEDULED",
        scheduledDate: dayOfThisWeek(4, 8), durationMinutes: 360, assignedToId: hvac.id,
        description: "Carrier 96% furnace and 16-SEER condenser. Deposit received.",
      },
    }),
    rooftop: await prisma.project.create({
      data: {
        tenantId: tenant.id, clientId: client.meadowbrook.id,
        contractId: meadowbrookContract.id, contractCycle: `${new Date().getFullYear()}-10`,
        clientName: client.meadowbrook.name, address: `${client.meadowbrook.address}, ${client.meadowbrook.city}`,
        phone: client.meadowbrook.phone, title: "Rooftop unit — fall service", jobType: "HVAC service",
        status: "SCHEDULED", scheduledDate: dayOfThisWeek(3, 9), durationMinutes: 120, assignedToId: hvac.id,
        description: "Contract visit: coil clean, belts, filters, refrigerant check.",
      },
    }),
    move: await prisma.project.create({
      data: {
        tenantId: tenant.id, clientId: client.aisha.id, leadId: leadByKey.aisha,
        clientName: client.aisha.name, address: `${client.aisha.address}, ${client.aisha.city}`,
        phone: client.aisha.phone, title: "3-bedroom move — Orleans", jobType: "Moving",
        status: "COMPLETED", scheduledDate: dayOfThisWeek(1, 8), durationMinutes: 420,
        completedDate: dayOfThisWeek(1, 15), assignedToId: mover.id,
        description: "Crew of 3, 26ft truck. Piano handled, no damage.",
      },
    }),
    warehouse: await prisma.project.create({
      data: {
        tenantId: tenant.id, clientId: client.northgate.id,
        clientName: client.northgate.name, address: `${client.northgate.address}, ${client.northgate.city}`,
        phone: client.northgate.phone, title: "Warehouse relocation — phase 1", jobType: "Moving",
        status: "SCHEDULED", scheduledDate: dayOfThisWeek(5, 6), durationMinutes: 600, assignedToId: mover.id,
        description: "Crew of 4 + truck. Awaiting facilities sign-off on the quote.",
      },
    }),
    ductClean: await prisma.project.create({
      data: {
        tenantId: tenant.id, clientId: client.ferndale.id,
        clientName: client.ferndale.name, address: `${client.ferndale.address}, ${client.ferndale.city}`,
        phone: client.ferndale.phone, title: "Duct cleaning + filter swap", jobType: "HVAC service",
        status: "COMPLETED", scheduledDate: dayOfThisWeek(1, 13), durationMinutes: 150,
        completedDate: dayOfThisWeek(1, 15), assignedToId: hvac.id,
        description: "Whole-home duct cleaning, MERV-11 filter. Paid on site.",
      },
    }),
    tuneUp: await prisma.project.create({
      data: {
        tenantId: tenant.id, clientId: client.nadia.id,
        clientName: client.nadia.name, address: `${client.nadia.address}, ${client.nadia.city}`,
        phone: client.nadia.phone, title: "Furnace tune-up — pre-season", jobType: "HVAC service",
        status: "COMPLETED", scheduledDate: daysAgo(30, 9), durationMinutes: 90,
        completedDate: daysAgo(30, 11), assignedToId: hvac.id,
        description: "Annual safety inspection and tune-up. Invoice sent; now overdue.",
      },
    }),
  };

  /* --------------------------------------------------------------------- *
   * The paper. Each record prices its own lines through `quoteTotals`, and
   * every payment is written against the total the invoice actually stored —
   * read back, never re-typed — so the ledger reconciles to the cent.
   * --------------------------------------------------------------------- */
  const year = new Date().getFullYear();

  // ── Heat pump: accepted estimate, then a deposit invoice (PAID) and a balance
  //    invoice (still out) — the two-invoice pattern a shop bills an install with.
  const heatPumpLines = lineItemsFromInput([
    { description: "Mitsubishi hyper-heat pump, 3-ton", qty: 1, unit: "ea", unitPrice: 6200 },
    { description: "Air handler + evaporator coil", qty: 1, unit: "ea", unitPrice: 1450 },
    { description: "Installation labour", qty: 12, unit: "hr", unitPrice: 120 },
    { description: "Line set, pad, electrical", qty: 1, unit: "lot", unitPrice: 780 },
    { description: "Old furnace removal & disposal", qty: 1, unit: "ea", unitPrice: 195 },
  ]);
  const heatPumpTotals = quoteTotals(heatPumpLines, DEFAULT_TAX_RATE);
  await prisma.estimate.create({
    data: {
      tenantId: tenant.id, projectId: job.heatPump.id, lineItems: lineItemsToJson(heatPumpLines),
      ...heatPumpTotals, status: "ACCEPTED", validUntil: daysAhead(20),
      notes: "50% deposit on booking, balance on commissioning. 12-year parts warranty.",
    },
  });
  // The deposit and the balance are each their own document, each pricing half the
  // pre-tax subtotal (which halves evenly to the cent here) plus its own tax.
  const depositLines = lineItemsFromInput([
    { description: "50% deposit — heat pump install (per accepted estimate)", qty: 1, unit: "lot", unitPrice: 5032.5 },
  ]);
  const depositTotals = quoteTotals(depositLines, DEFAULT_TAX_RATE);
  const deposit = await prisma.invoice.create({
    data: {
      tenantId: tenant.id, projectId: job.heatPump.id, kind: "DEPOSIT",
      number: `INV-${year}-0101`, clientName: client.liam.name,
      address: `${client.liam.address}, ${client.liam.city}`, email: client.liam.email,
      lineItems: lineItemsToJson(depositLines), ...depositTotals, status: "PAID",
      issuedAt: daysAgo(6), sentAt: daysAgo(6), dueDate: daysAgo(6), paidAt: daysAgo(5),
      notes: "Deposit on booking. Balance invoiced on commissioning.",
    },
  });
  await prisma.payment.create({
    data: {
      tenantId: tenant.id, projectId: job.heatPump.id, invoiceId: deposit.id,
      amountCents: deposit.totalCents, method: "E_TRANSFER", date: daysAgo(5), notes: "Deposit",
    },
  });
  const balanceLines = lineItemsFromInput([
    { description: "Balance on commissioning — heat pump install", qty: 1, unit: "lot", unitPrice: 5032.5 },
  ]);
  const balanceTotals = quoteTotals(balanceLines, DEFAULT_TAX_RATE);
  const balance = await prisma.invoice.create({
    data: {
      tenantId: tenant.id, projectId: job.heatPump.id, kind: "BALANCE",
      number: `INV-${year}-0102`, clientName: client.liam.name,
      address: `${client.liam.address}, ${client.liam.city}`, email: client.liam.email,
      lineItems: lineItemsToJson(balanceLines), ...balanceTotals, status: "SENT",
      issuedAt: daysAgo(1), sentAt: daysAgo(1), dueDate: daysAhead(20),
      notes: "Due on completion of commissioning.",
    },
  });

  // ── Furnace + AC: accepted estimate → one FULL invoice, half paid (PARTIAL).
  const furnaceLines = lineItemsFromInput([
    { description: "Carrier 96% two-stage furnace, 60k BTU", qty: 1, unit: "ea", unitPrice: 3450 },
    { description: "Carrier 16-SEER condenser, 2.5-ton", qty: 1, unit: "ea", unitPrice: 2980 },
    { description: "Evaporator coil + line set", qty: 1, unit: "lot", unitPrice: 690 },
    { description: "Installation labour", qty: 10, unit: "hr", unitPrice: 115 },
    { description: "Old units removal & disposal", qty: 1, unit: "ea", unitPrice: 250 },
  ]);
  const furnaceTotals = quoteTotals(furnaceLines, DEFAULT_TAX_RATE);
  await prisma.estimate.create({
    data: {
      tenantId: tenant.id, projectId: job.furnaceAc.id, lineItems: lineItemsToJson(furnaceLines),
      ...furnaceTotals, status: "ACCEPTED", validUntil: daysAhead(14),
      notes: "50% deposit received. Balance on completion.",
    },
  });
  const furnaceInvoice = await prisma.invoice.create({
    data: {
      tenantId: tenant.id, projectId: job.furnaceAc.id, number: `INV-${year}-0103`,
      clientName: client.gabriela.name, address: `${client.gabriela.address}, ${client.gabriela.city}`,
      email: client.gabriela.email, lineItems: lineItemsToJson(furnaceLines), ...furnaceTotals,
      status: "PARTIAL", issuedAt: daysAgo(3), sentAt: daysAgo(3), dueDate: daysAhead(9),
      notes: "50% deposit received on booking; balance due on completion.",
    },
  });
  await prisma.payment.create({
    data: {
      tenantId: tenant.id, projectId: job.furnaceAc.id, invoiceId: furnaceInvoice.id,
      // Exactly half the stored total, cut to the cent — leaves a clean balance owing.
      amountCents: shareOfCents(furnaceInvoice.totalCents, 0.5), method: "E_TRANSFER",
      date: daysAgo(3), notes: "Deposit — 50%",
    },
  });

  // ── Move: accepted estimate → invoice paid in full.
  const moveLines = lineItemsFromInput([
    { description: "Crew of 3 + 26ft truck", qty: 7, unit: "hr", unitPrice: 170 },
    { description: "Packing materials & wardrobe boxes", qty: 1, unit: "lot", unitPrice: 185 },
    { description: "Piano / appliance handling", qty: 1, unit: "ea", unitPrice: 120 },
  ]);
  const moveTotals = quoteTotals(moveLines, DEFAULT_TAX_RATE);
  await prisma.estimate.create({
    data: {
      tenantId: tenant.id, projectId: job.move.id, lineItems: lineItemsToJson(moveLines),
      ...moveTotals, status: "ACCEPTED",
    },
  });
  const moveInvoice = await prisma.invoice.create({
    data: {
      tenantId: tenant.id, projectId: job.move.id, number: `INV-${year}-0104`,
      clientName: client.aisha.name, address: `${client.aisha.address}, ${client.aisha.city}`,
      email: client.aisha.email, lineItems: lineItemsToJson(moveLines), ...moveTotals,
      status: "PAID", issuedAt: dayOfThisWeek(1, 16), sentAt: dayOfThisWeek(1, 16),
      dueDate: daysAhead(13), paidAt: dayOfThisWeek(1, 17),
      notes: "Paid in full on completion — thank you.",
    },
  });
  await prisma.payment.create({
    data: {
      tenantId: tenant.id, projectId: job.move.id, invoiceId: moveInvoice.id,
      amountCents: moveInvoice.totalCents, method: "E_TRANSFER", date: dayOfThisWeek(1, 17),
      notes: "Paid in full",
    },
  });

  // ── Duct cleaning: small invoice, paid cash on site.
  const ductLines = lineItemsFromInput([
    { description: "Whole-home duct cleaning (12 vents)", qty: 1, unit: "job", unitPrice: 420 },
    { description: "Furnace filter (MERV 11)", qty: 1, unit: "ea", unitPrice: 45 },
  ]);
  const ductTotals = quoteTotals(ductLines, DEFAULT_TAX_RATE);
  const ductInvoice = await prisma.invoice.create({
    data: {
      tenantId: tenant.id, projectId: job.ductClean.id, number: `INV-${year}-0105`,
      clientName: client.ferndale.name, address: `${client.ferndale.address}, ${client.ferndale.city}`,
      email: client.ferndale.email, lineItems: lineItemsToJson(ductLines), ...ductTotals,
      status: "PAID", issuedAt: dayOfThisWeek(1, 15), sentAt: dayOfThisWeek(1, 15),
      dueDate: dayOfThisWeek(1, 15), paidAt: dayOfThisWeek(1, 16), notes: "Paid on site.",
    },
  });
  await prisma.payment.create({
    data: {
      tenantId: tenant.id, projectId: job.ductClean.id, invoiceId: ductInvoice.id,
      amountCents: ductInvoice.totalCents, method: "CASH", date: dayOfThisWeek(1, 16),
      notes: "Duct cleaning — paid on site",
    },
  });

  // ── Tune-up: the one overdue bill. Sent a month ago, lapsed a fortnight ago, nothing
  //    paid — status SENT + a past due date is all `isOverdue` needs, no stored flag.
  const tuneLines = lineItemsFromInput([
    { description: "Furnace tune-up & safety inspection", qty: 1, unit: "job", unitPrice: 189 },
  ]);
  const tuneTotals = quoteTotals(tuneLines, DEFAULT_TAX_RATE);
  await prisma.invoice.create({
    data: {
      tenantId: tenant.id, projectId: job.tuneUp.id, number: `INV-${year}-0100`,
      clientName: client.nadia.name, address: `${client.nadia.address}, ${client.nadia.city}`,
      email: client.nadia.email, lineItems: lineItemsToJson(tuneLines), ...tuneTotals,
      status: "SENT", issuedAt: daysAgo(30), sentAt: daysAgo(30), dueDate: daysAgo(15),
      remindedAt: daysAgo(7), reminderCount: 1,
      notes: "Net 15. Second reminder sent.",
    },
  });

  // ── Warehouse: a live quote out, not yet accepted — the top of the pipeline.
  const warehouseLines = lineItemsFromInput([
    { description: "Moving crew (4) + 26ft truck — phase 1", qty: 10, unit: "hr", unitPrice: 240 },
    { description: "Packing & shrink-wrap materials", qty: 1, unit: "lot", unitPrice: 360 },
    { description: "Equipment handling (pallet jack, dollies)", qty: 1, unit: "lot", unitPrice: 180 },
  ]);
  const warehouseTotals = quoteTotals(warehouseLines, DEFAULT_TAX_RATE);
  await prisma.estimate.create({
    data: {
      tenantId: tenant.id, projectId: job.warehouse.id, lineItems: lineItemsToJson(warehouseLines),
      ...warehouseTotals, status: "SENT", validUntil: daysAhead(14),
      notes: "Phase 1 of a phased relocation. Awaiting sign-off from facilities.",
    },
  });

  /* --------------------------------------------------------------------- *
   * Tasks — the open-work lamp on the dashboard and each tech's own list.
   * --------------------------------------------------------------------- */
  const taskSpecs: Array<{ title: string; status: string; projectId: string | null; who: string; due: number }> = [
    { title: "Order Mitsubishi 3-ton heat pump", status: "DONE", projectId: job.heatPump.id, who: hvac.id, due: -3 },
    { title: "Pull mechanical permit — Santos furnace/AC", status: "IN_PROGRESS", projectId: job.furnaceAc.id, who: hvac.id, due: 1 },
    { title: "Confirm dock access + COI with Northgate", status: "TODO", projectId: job.warehouse.id, who: mover.id, due: 2 },
    { title: "Book crew of 4 for Friday warehouse move", status: "TODO", projectId: job.warehouse.id, who: mover.id, due: 3 },
    { title: "Send balance invoice when heat pump commissioned", status: "TODO", projectId: job.heatPump.id, who: admin.id, due: 1 },
    { title: "Chase overdue tune-up invoice — Volkov", status: "IN_PROGRESS", projectId: job.tuneUp.id, who: admin.id, due: 0 },
    { title: "Order case of MERV-11 filters", status: "TODO", projectId: null, who: hvac.id, due: 4 },
  ];
  for (const t of taskSpecs) {
    await prisma.task.create({
      data: {
        tenantId: tenant.id, title: t.title, status: t.status as never, projectId: t.projectId ?? undefined,
        assignedToId: t.who, createdById: admin.id,
        dueDate: t.due >= 0 ? daysAhead(t.due) : daysAgo(-t.due),
      },
    });
  }

  /* --------------------------------------------------------------------- *
   * Expenses — what the week cost, so Finance has both columns of the T-account.
   * --------------------------------------------------------------------- */
  const expenseSpecs: Array<{ amount: number; category: string; description: string; projectId: string | null; days: number }> = [
    { amount: 6200, category: "MATERIALS", description: "Mitsubishi heat pump unit", projectId: job.heatPump.id, days: 4 },
    { amount: 6430, category: "MATERIALS", description: "Carrier furnace + AC condenser", projectId: job.furnaceAc.id, days: 2 },
    { amount: 228.4, category: "VEHICLE", description: "Fuel — week", projectId: null, days: 1 },
    { amount: 145, category: "TOOLS", description: "Refrigerant recovery machine — service", projectId: null, days: 5 },
    { amount: 60, category: "MATERIALS", description: "Duct cleaning consumables", projectId: job.ductClean.id, days: 1 },
  ];
  for (const e of expenseSpecs) {
    await prisma.expense.create({
      data: {
        tenantId: tenant.id, amountCents: toCents(e.amount), category: e.category as never,
        description: e.description, projectId: e.projectId ?? undefined, date: daysAgo(e.days),
      },
    });
  }

  // The workspace's own journal records that it was dressed for a demo — this is the guard
  // a second run reads, and the honest answer to "where did all this come from".
  await prisma.auditLog.create({
    data: {
      tenantId: tenant.id, actorId: admin.id, actorName: "platform operator",
      action: "present.fill", entity: "Tenant", entityId: tenant.id,
      summary: `Filled «${tenant.businessName}» with a presentation HVAC + moving world`,
      meta: JSON.stringify({ slug, clients: 7, jobs: 7, leads: leadSpecs.length, invoices: 6 }),
    },
  });

  /* --------------------------------------------------------------------- *
   * Reconciliation proof — read every invoice and its payments back and print
   * total vs paid, so the operator SEES the ledger balance before the meeting.
   * --------------------------------------------------------------------- */
  const invoices = await prisma.invoice.findMany({
    where: { tenantId: tenant.id }, include: { payments: true }, orderBy: { number: "asc" },
  });
  console.log(`\nPresentation world filled for «${tenant.businessName}» (${slug}).`);
  console.log(`Crew: ${workers.map((w) => w.name).join(", ")}`);
  console.log(`\nLedger (invoice → paid / total → owing):`);
  for (const inv of invoices) {
    const paid = inv.payments.reduce((s, p) => s + p.amountCents, 0);
    const owing = inv.totalCents - paid;
    console.log(
      `  ${inv.number}  ${inv.status.padEnd(7)} ` +
        `${formatCents(paid).padStart(11)} / ${formatCents(inv.totalCents).padStart(11)} ` +
        `→ ${formatCents(owing).padStart(11)} owing`
    );
  }
  console.log(
    `\nWalk it at https://${slug}.agintent.com — Dispatch → Leads → Jobs → ` +
      `a record → Invoices → Finance.\n`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
