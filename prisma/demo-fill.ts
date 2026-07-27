/**
 * Fills the dev database with a realistic HVAC/moving week so the dispatch deck,
 * the day rail and the invoice flow can actually be looked at. Idempotent-ish:
 * it only adds rows, so run it once per fresh dev.db.
 */
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const prisma = new PrismaClient({
  adapter: new PrismaBetterSqlite3({ url: process.env.DATABASE_URL ?? "file:./dev.db" }),
});

function dayOfThisWeek(offsetFromSunday: number, hour = 9) {
  const d = new Date();
  d.setHours(hour, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay() + offsetFromSunday);
  return d;
}

async function main() {
  const tenant = await prisma.tenant.findFirst();
  if (!tenant) throw new Error("No tenant — run the seed first");
  const admin = await prisma.user.findFirst({ where: { tenantId: tenant.id, role: "ADMIN" } });
  const workers = await prisma.user.findMany({ where: { tenantId: tenant.id, role: "WORKER" } });
  if (!admin) throw new Error("No admin user");

  const leads = [
    { name: "Dave Kowalski", city: "Ottawa", jobType: "Furnace replacement", source: "GOOGLE", status: "NEW", phone: "613-555-0142" },
    { name: "Priya Raman", city: "Kanata", jobType: "AC not cooling", source: "FACEBOOK", status: "CONTACTED", phone: "613-555-0188" },
    { name: "Marc Tremblay", city: "Gatineau", jobType: "3-bedroom move", source: "KIJIJI", status: "VERIFIED", phone: "819-555-0114" },
    { name: "Helen Okafor", city: "Barrhaven", jobType: "Ductwork cleaning", source: "HOMESTARS", status: "NEW", phone: "613-555-0176" },
    { name: "Tomasz Nowak", city: "Orleans", jobType: "Office relocation", source: "INSTAGRAM", status: "REJECTED", phone: "613-555-0155" },
  ];

  for (const l of leads) {
    await prisma.lead.create({
      data: { tenantId: tenant.id, ...l, source: l.source as never, status: l.status as never },
    });
  }

  const jobs = [
    { title: "Furnace swap — 2-stage 96%", clientName: "Ruth Delgado", address: "18 Larkspur Cres, Ottawa", jobType: "HVAC install", status: "IN_PROGRESS", scheduledDate: dayOfThisWeek(1) },
    { title: "Rooftop unit service call", clientName: "Bayline Dental", address: "440 Preston St, Ottawa", jobType: "HVAC service", status: "SCHEDULED", scheduledDate: dayOfThisWeek(2, 8) },
    { title: "2-bed apartment move", clientName: "Alina Petrova", address: "77 Bronson Ave, Ottawa", jobType: "Moving", status: "SCHEDULED", scheduledDate: dayOfThisWeek(3, 7) },
    { title: "Heat pump commissioning", clientName: "Greg Sandhu", address: "9 Ridgeline Way, Stittsville", jobType: "HVAC install", status: "SCHEDULED", scheduledDate: dayOfThisWeek(4) },
    { title: "Warehouse relocation — phase 1", clientName: "Northline Supply", address: "1200 Industrial Ave", jobType: "Moving", status: "SCHEDULED", scheduledDate: dayOfThisWeek(5, 6) },
    { title: "Duct cleaning + filter swap", clientName: "Ken Whitfield", address: "3 Maple Grove Rd, Nepean", jobType: "HVAC service", status: "COMPLETED", scheduledDate: dayOfThisWeek(0) },
  ];

  const created = [];
  for (const j of jobs) {
    created.push(
      await prisma.project.create({
        data: { tenantId: tenant.id, ...j, status: j.status as never },
      })
    );
  }

  // A full paper trail on the first job: accepted estimate → issued invoice → part payment.
  const lineItems = [
    { description: "Carrier 96% two-stage furnace", qty: 1, unit: "ea", unitPrice: 3450 },
    { description: "Installation labour", qty: 8, unit: "hr", unitPrice: 115 },
    { description: "Venting + fittings", qty: 1, unit: "lot", unitPrice: 380 },
    { description: "Old unit removal & disposal", qty: 1, unit: "ea", unitPrice: 175 },
  ];
  const subtotal = lineItems.reduce((s, i) => s + i.qty * i.unitPrice, 0);
  const tax = subtotal * 0.13;

  const estimate = await prisma.estimate.create({
    data: {
      projectId: created[0].id,
      lineItems: JSON.stringify(lineItems),
      subtotal,
      tax,
      total: subtotal + tax,
      notes: "50% deposit on booking, balance on completion. 10-year parts warranty.",
      status: "ACCEPTED",
    },
  });

  const invoice = await prisma.invoice.create({
    data: {
      tenantId: tenant.id,
      projectId: created[0].id,
      estimateId: estimate.id,
      number: `INV-${new Date().getFullYear()}-0001`,
      clientName: created[0].clientName,
      address: created[0].address,
      lineItems: JSON.stringify(lineItems),
      subtotal,
      tax,
      total: subtotal + tax,
      notes: "50% deposit on booking, balance on completion.",
      status: "PARTIAL",
      sentAt: new Date(),
      dueDate: new Date(Date.now() + 9 * 24 * 60 * 60 * 1000),
    },
  });

  await prisma.payment.create({
    data: {
      tenantId: tenant.id,
      projectId: created[0].id,
      invoiceId: invoice.id,
      amount: 2600,
      method: "E_TRANSFER",
      notes: "Deposit",
    },
  });

  // A second invoice that is sitting past its due date.
  const moveItems = [
    { description: "Crew of 3 + 26ft truck", qty: 6, unit: "hr", unitPrice: 165 },
    { description: "Packing materials", qty: 1, unit: "lot", unitPrice: 140 },
  ];
  const moveSub = moveItems.reduce((s, i) => s + i.qty * i.unitPrice, 0);
  await prisma.invoice.create({
    data: {
      tenantId: tenant.id,
      projectId: created[5].id,
      number: `INV-${new Date().getFullYear()}-0002`,
      clientName: created[5].clientName,
      address: created[5].address,
      lineItems: JSON.stringify(moveItems),
      subtotal: moveSub,
      tax: moveSub * 0.13,
      total: moveSub * 1.13,
      status: "SENT",
      sentAt: new Date(Date.now() - 21 * 24 * 60 * 60 * 1000),
      dueDate: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000),
    },
  });

  const taskSpecs = [
    { title: "Pull permit for furnace swap", status: "DONE", projectId: created[0].id },
    { title: "Order 3-ton condenser", status: "IN_PROGRESS", projectId: created[3].id },
    { title: "Confirm elevator booking with building", status: "TODO", projectId: created[2].id },
    { title: "Load dollies + straps for Fri", status: "TODO", projectId: created[4].id },
    { title: "Call Bayline back re: access code", status: "IN_PROGRESS", projectId: created[1].id },
    { title: "Invoice Northline for phase 1", status: "TODO", projectId: created[5].id },
  ];

  for (let i = 0; i < taskSpecs.length; i++) {
    const t = taskSpecs[i];
    await prisma.task.create({
      data: {
        tenantId: tenant.id,
        title: t.title,
        status: t.status as never,
        projectId: t.projectId,
        assignedToId: (workers[i % Math.max(workers.length, 1)] ?? admin).id,
        createdById: admin.id,
        dueDate: dayOfThisWeek(2 + (i % 4)),
      },
    });
  }

  const expenses = [
    { amount: 3450, category: "MATERIALS", description: "Carrier furnace unit", projectId: created[0].id },
    { amount: 214.5, category: "VEHICLE", description: "Fuel — week", projectId: null },
    { amount: 380, category: "MATERIALS", description: "Venting + fittings", projectId: created[0].id },
    { amount: 96, category: "TOOLS", description: "Replacement manifold gauges", projectId: null },
  ];
  for (const e of expenses) {
    await prisma.expense.create({
      data: {
        tenantId: tenant.id,
        amount: e.amount,
        category: e.category as never,
        description: e.description,
        projectId: e.projectId ?? undefined,
      },
    });
  }

  await prisma.payment.create({
    data: {
      tenantId: tenant.id,
      projectId: created[5].id,
      amount: 890,
      method: "CASH",
      notes: "Duct cleaning — paid on site",
    },
  });

  console.log("Demo week filled.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
