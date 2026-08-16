import { beforeAll, describe, expect, inject, it } from "vitest";
import { jobMoney } from "@/lib/margin";
import { Client, cents, inCents, signedIn, toDollars, type Workspace } from "./harness/client";

/**
 * Scenario A — the money chain, one workspace, over HTTP.
 *
 * lead → job → estimate → invoice → part payment → settlement, then the two numbers a
 * contractor actually argues about: the margin on the job card and the month's books.
 *
 * Four cent-level defects were found here and pinned as failing assertions; they are
 * closed and the assertions now stand as regression guards. Their docblocks keep the
 * story of what went wrong, because that is what a reader needs when one turns red.
 *
 * The API speaks dollars — that is its contract. Every assertion converts through the
 * application's own door (`cents`, `inCents`) rather than doing its own arithmetic.
 */

/** An amount a client can actually transfer: whole cents, nothing hiding underneath. */
const isPayable = (dollars: number) => toDollars(cents(dollars)) === dollars;

const YEAR = new Date().getFullYear();
const seq = (number: string) => Number(number.slice(-4));

/** The job billed through the main chain: clean cent amounts on purpose. */
const LINES = [
  { description: "Demolition and haul-out", qty: 12, unit: "sq ft", unitPrice: 85 },
  { description: "Disposal bin", qty: 1, unit: "ea", unitPrice: 480 },
];
const SUBTOTAL = 1500;
const TAX_RATE = 0.13;
const TAX = 195;
const TOTAL = 1695;
const FIRST_PAYMENT = 500;
const MATERIALS = 620.4;

describe.sequential("Scenario A — lead to settled invoice", () => {
  let alpha: Workspace;
  let admin: Client;
  let baseline: number;

  const state = {
    leadId: "",
    projectId: "",
    estimateId: "",
    invoiceId: "",
    invoiceNumber: "",
  };

  const month = () => ({ year: new Date().getFullYear(), month: new Date().getMonth() + 1 });

  async function revenueThisMonth() {
    const { year, month: m } = month();
    const res = await admin.get(`/api/finance/summary?year=${year}&month=${m}`);
    expect(res.status).toBe(200);
    return res.body as {
      totalRevenue: number;
      totalExpenses: number;
      netProfit: number;
      payments: Array<{ amount: number }>;
      expenses: Array<{ amount: number }>;
    };
  }

  beforeAll(async () => {
    alpha = inject("alpha");
    admin = await signedIn(inject("baseUrl"), alpha.admin);
    baseline = (await revenueThisMonth()).totalRevenue;
  });

  it("takes a lead from the landing form's shape", async () => {
    const res = await admin.post("/api/leads", {
      name: "Vlad Korvex",
      phone: "613-555-0166",
      email: "vlad@korvex.test",
      address: "44 Bank St",
      city: "Ottawa",
      source: "FACEBOOK",
      jobType: "Kitchen renovation",
      notes: "Full gut, cabinets and counters",
    });
    expect(res.status).toBe(201);
    state.leadId = res.body.id;

    const list = await admin.get("/api/leads");
    expect(list.body.map((l: { id: string }) => l.id)).toContain(state.leadId);
  });

  it("converts the lead into a work order exactly once", async () => {
    const res = await admin.post(`/api/leads/${state.leadId}/convert`, {
      title: "Kitchen renovation — Bank St",
      description: "Gut and rebuild",
    });
    expect(res.status).toBe(201);
    state.projectId = res.body.id;
    expect(res.body.clientName).toBe("Vlad Korvex");

    const lead = await admin.get(`/api/leads/${state.leadId}`);
    expect(lead.body.status).toBe("CONVERTED");

    const again = await admin.post(`/api/leads/${state.leadId}/convert`, {});
    expect(again.status).toBe(400);
  });

  it("converts with the exact body the «Open a job» dialog sends", async () => {
    // The dialog holds assignedToId as "" until somebody is picked. Passed through to
    // Prisma the empty string hit the foreign key, so every press of the button
    // answered 500 while the same call without the field answered 201 — which is why
    // curl checks kept missing it.
    const lead = await admin.post("/api/leads", {
      name: "Dialog Shape",
      phone: "613-555-0188",
      jobType: "Bathroom renovation",
    });
    const res = await admin.post(`/api/leads/${lead.body.id}/convert`, {
      title: "Bathroom renovation for Dialog Shape",
      description: "",
      address: "",
      scheduledDate: "",
      assignedToId: "",
    });
    expect(res.status).toBe(201);
    expect(res.body.assignedToId).toBeNull();
  });

  it("prices the estimate: subtotal, tax and total agree with the lines", async () => {
    const res = await admin.post(`/api/projects/${state.projectId}/estimate`, {
      lineItems: LINES,
      taxRate: TAX_RATE,
      notes: "Valid 30 days",
    });
    expect(res.status).toBe(201);
    state.estimateId = res.body.id;

    expect(cents(res.body.subtotal)).toBe(cents(SUBTOTAL));
    expect(cents(res.body.tax)).toBe(cents(TAX));
    expect(cents(res.body.total)).toBe(cents(TOTAL));
    expect(res.body.status).toBe("DRAFT");
  });

  it("accepts the estimate", async () => {
    const res = await admin.put(`/api/projects/${state.projectId}/estimate`, {
      id: state.estimateId,
      status: "ACCEPTED",
    });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ACCEPTED");
  });

  it("tears an invoice off the accepted estimate, lines and totals verbatim", async () => {
    const res = await admin.post("/api/invoices", {
      projectId: state.projectId,
      estimateId: state.estimateId,
    });
    expect(res.status).toBe(201);
    state.invoiceId = res.body.id;
    state.invoiceNumber = res.body.number;

    expect(res.body.number).toMatch(new RegExp(`^INV-${YEAR}-\\d{4}$`));
    expect(res.body.status).toBe("DRAFT");
    expect(cents(res.body.total)).toBe(cents(TOTAL));
    expect(JSON.parse(res.body.lineItems)).toEqual(LINES);
    expect(res.body.estimateId).toBe(state.estimateId);
  });

  it("marks the invoice sent and stamps the date", async () => {
    const res = await admin.put(`/api/invoices/${state.invoiceId}`, { status: "SENT" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("SENT");
    expect(res.body.sentAt).toBeTruthy();
  });

  it("a part payment leaves the invoice PARTIAL with no paid date", async () => {
    const res = await admin.put(`/api/invoices/${state.invoiceId}`, {
      action: "pay",
      amount: FIRST_PAYMENT,
      method: "E_TRANSFER",
    });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("PARTIAL");
    expect(res.body.paidAt).toBeNull();

    const invoice = await admin.get(`/api/invoices/${state.invoiceId}`);
    expect(cents(invoice.body.amountPaid)).toBe(cents(FIRST_PAYMENT));
  });

  it("settling the last cent flips it to PAID and stamps paidAt", async () => {
    const owing = toDollars(cents(TOTAL) - cents(FIRST_PAYMENT));
    const res = await admin.put(`/api/invoices/${state.invoiceId}`, {
      action: "pay",
      amount: owing,
      method: "CASH",
    });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("PAID");
    expect(res.body.paidAt).toBeTruthy();

    const invoice = await admin.get(`/api/invoices/${state.invoiceId}`);
    expect(cents(invoice.body.amountPaid)).toBe(cents(TOTAL));
    expect(invoice.body.payments).toHaveLength(2);
  });

  it("job economics read back what was really collected", async () => {
    const expense = await admin.post("/api/finance/expenses", {
      projectId: state.projectId,
      amount: MATERIALS,
      category: "MATERIALS",
      description: "Cabinets and counter",
    });
    expect(expense.status).toBe(201);

    const project = await admin.get(`/api/projects/${state.projectId}`);
    expect(project.status).toBe(200);

    // The same function the job card renders from, fed the API's own payload through
    // the same conversion the card does.
    const money = jobMoney(inCents(project.body));
    expect(money.quotedCents).toBe(cents(TOTAL));
    expect(money.invoicedCents).toBe(cents(TOTAL));
    expect(money.collectedCents).toBe(cents(TOTAL));
    expect(money.costsCents).toBe(cents(MATERIALS));
    expect(money.marginCents).toBe(cents(TOTAL) - cents(MATERIALS));
    expect(money.outstandingCents).toBe(0);
    expect(money.unbilledCents).toBe(0);
  });

  it("the month's books move by exactly what was received", async () => {
    const summary = await revenueThisMonth();
    expect(cents(summary.totalRevenue) - cents(baseline)).toBe(cents(TOTAL));
    expect(cents(summary.totalRevenue)).toBe(
      summary.payments.reduce((s, p) => s + cents(p.amount), 0),
    );
    expect(cents(summary.netProfit)).toBe(cents(summary.totalRevenue) - cents(summary.totalExpenses));
    expect(summary.expenses.some((e) => cents(e.amount) === cents(MATERIALS))).toBe(true);
  });

  /**
   * Was E2E-M3 — a payment dated the first of the month landed in the previous one.
   * `new Date("2026-08-01")` is UTC midnight, July 31st at 20:00 in Toronto, while
   * /api/finance/summary cuts months on local boundaries. Both sides read the same
   * calendar now (src/lib/dates.ts).
   */
  it("a payment dated the 1st belongs to that month", async () => {
    const first = `${YEAR}-${String(new Date().getMonth() + 1).padStart(2, "0")}-01`;
    const res = await admin.post("/api/finance/payments", {
      projectId: state.projectId,
      amount: 3.21,
      method: "CASH",
      date: first,
      notes: "first of the month",
    });
    expect(res.status).toBe(201);

    const summary = await revenueThisMonth();
    expect(summary.payments.some((p) => cents(p.amount) === cents(3.21))).toBe(true);
  });
});

describe.sequential("Scenario A — deposit splits", () => {
  let admin: Client;
  let projectId = "";

  beforeAll(async () => {
    admin = await signedIn(inject("baseUrl"), inject("alpha").admin);
    const lead = await admin.post("/api/leads", {
      name: "Deposit Client",
      phone: "613-555-0177",
      jobType: "Furnace replacement",
    });
    const project = await admin.post(`/api/leads/${lead.body.id}/convert`, {
      title: "Furnace replacement — deposit terms",
    });
    projectId = project.body.id;
  });

  /** One estimate, two invoices; returns the whole and both halves. */
  async function split(unitPrice: number, depositRate: number) {
    const estimate = await admin.post(`/api/projects/${projectId}/estimate`, {
      lineItems: [{ description: "Supply and install", qty: 1, unit: "lot", unitPrice }],
      taxRate: TAX_RATE,
    });
    const res = await admin.post("/api/invoices", {
      projectId,
      estimateId: estimate.body.id,
      depositRate,
    });
    expect(res.status).toBe(201);
    expect(res.body.split).toBe(true);
    return {
      whole: estimate.body.total as number,
      deposit: res.body as { id: string; number: string; kind: string; total: number },
      balance: res.body.balance as { id: string; number: string; kind: string; total: number },
    };
  }

  for (const [label, rate] of [
    ["50 / 50", 0.5],
    ["30 / 70", 0.3],
  ] as const) {
    it(`${label} halves add up to the whole job, to the cent`, async () => {
      const { whole, deposit, balance } = await split(2400, rate);

      expect(deposit.kind).toBe("DEPOSIT");
      expect(balance.kind).toBe("BALANCE");
      expect(deposit.number).not.toBe(balance.number);
      expect(seq(balance.number)).toBe(seq(deposit.number) + 1);

      expect(cents(deposit.total)).toBe(Math.round(cents(whole) * rate));
      expect(cents(deposit.total) + cents(balance.total)).toBe(cents(whole));
      // Each half has to be a sum a client can actually transfer.
      expect(isPayable(deposit.total)).toBe(true);
      expect(isPayable(balance.total)).toBe(true);
    });
  }

  /**
   * Was E2E-M1 — the split and the single invoice disagreed by a cent, so the same job
   * cost a different amount depending on how it was paperworked. The halves are cut out
   * of the whole in cents and the balance takes the remainder.
   */
  it("split halves match the single invoice for the same job", async () => {
    const { whole, deposit, balance } = await split(242.5, 0.5);
    expect(cents(deposit.total) + cents(balance.total)).toBe(cents(whole));
  });

  it("both halves can be settled and the job shows the whole amount collected", async () => {
    const { whole, deposit, balance } = await split(1800, 0.5);
    for (const invoice of [deposit, balance]) {
      const res = await admin.put(`/api/invoices/${invoice.id}`, {
        action: "pay",
        amount: invoice.total,
        method: "E_TRANSFER",
      });
      expect(res.body.status).toBe("PAID");
    }

    const project = await admin.get(`/api/projects/${projectId}`);
    const collectedCents = (project.body.payments as Array<{ amount: number }>).reduce(
      (s, p) => s + cents(p.amount),
      0,
    );
    expect(collectedCents).toBe(cents(whole));
  });
});

describe.sequential("Scenario A — voiding and numbering", () => {
  let admin: Client;
  let projectId = "";

  beforeAll(async () => {
    admin = await signedIn(inject("baseUrl"), inject("alpha").admin);
    const lead = await admin.post("/api/leads", {
      name: "Void Client",
      phone: "613-555-0188",
      jobType: "Deck repair",
    });
    const project = await admin.post(`/api/leads/${lead.body.id}/convert`, {
      title: "Deck repair — voided paper",
    });
    projectId = project.body.id;
  });

  async function invoice(unitPrice: number) {
    const estimate = await admin.post(`/api/projects/${projectId}/estimate`, {
      lineItems: [{ description: "Boards", qty: 1, unit: "lot", unitPrice }],
      taxRate: TAX_RATE,
    });
    const res = await admin.post("/api/invoices", { projectId, estimateId: estimate.body.id });
    expect(res.status).toBe(201);
    return res.body as { id: string; number: string; total: number };
  }

  it("a voided invoice keeps its number and the next one carries on", async () => {
    const first = await invoice(300);
    const voided = await admin.del(`/api/invoices/${first.id}`);
    expect(voided.status).toBe(200);
    expect(voided.body.status).toBe("VOID");

    const second = await invoice(400);
    expect(seq(second.number)).toBe(seq(first.number) + 1);

    const stored = await admin.get(`/api/invoices/${first.id}`);
    expect(stored.body.number).toBe(first.number);
    expect(stored.body.status).toBe("VOID");

    const all = await admin.get("/api/invoices");
    const numbers = (all.body as Array<{ number: string }>).map((i) => i.number);
    expect(new Set(numbers).size).toBe(numbers.length);
  });

  it("only issued paper counts as billed — a void and a draft do not", async () => {
    // Billed means the client has it in hand. A void is cancelled paper and a draft is
    // paper nobody has seen; counting either one hid the "quoted but never invoiced"
    // signal and reported money on the street that was never asked for.
    const drafted = await invoice(500);
    await admin.put(`/api/invoices/${drafted.id}`, { status: "SENT" });

    const project = await admin.get(`/api/projects/${projectId}`);
    const all = project.body.invoices as Array<{ status: string; total: number }>;
    const issued = all.filter((i) => i.status !== "VOID" && i.status !== "DRAFT");

    expect(all.some((i) => i.status === "VOID")).toBe(true);
    expect(all.some((i) => i.status === "DRAFT")).toBe(true);

    const money = jobMoney(inCents(project.body));
    expect(money.invoicedCents).toBe(issued.reduce((s, i) => s + cents(i.total), 0));
  });
});

describe.sequential("Scenario A — money that must survive the round trip", () => {
  let admin: Client;
  let projectId = "";

  beforeAll(async () => {
    admin = await signedIn(inject("baseUrl"), inject("alpha").admin);
    const lead = await admin.post("/api/leads", {
      name: "Cent Client",
      phone: "613-555-0199",
      jobType: "Bathroom tile",
    });
    const project = await admin.post(`/api/leads/${lead.body.id}/convert`, {
      title: "Bathroom tile — fractional cents",
    });
    projectId = project.body.id;
  });

  it("a cent short of the total keeps the invoice open, the last cent closes it", async () => {
    const estimate = await admin.post(`/api/projects/${projectId}/estimate`, {
      lineItems: [{ description: "Punch list", qty: 1, unit: "lot", unitPrice: 100 }],
      taxRate: TAX_RATE,
    });
    const invoice = await admin.post("/api/invoices", { projectId, estimateId: estimate.body.id });
    expect(cents(invoice.body.total)).toBe(cents(113));

    const short = await admin.put(`/api/invoices/${invoice.body.id}`, {
      action: "pay",
      amount: toDollars(cents(invoice.body.total) - 1),
      method: "CASH",
    });
    expect(short.body.status).toBe("PARTIAL");
    expect(short.body.paidAt).toBeNull();

    const closed = await admin.put(`/api/invoices/${invoice.body.id}`, {
      action: "pay",
      amount: 0.01,
      method: "CASH",
    });
    expect(closed.body.status).toBe("PAID");
    expect(closed.body.paidAt).toBeTruthy();
  });

  /**
   * Was E2E-M2 — an invoice could be issued for an amount nobody can pay.
   * 242.50 at 13% stores total 274.025 and tax 31.525000000000002. The client is
   * billed a third of a cent, the CSV export prints 274.03 (toFixed) while the row
   * holds 274.025, and the settled invoice still shows a cent owing.
   */
  it("an issued invoice is a whole number of cents", async () => {
    const estimate = await admin.post(`/api/projects/${projectId}/estimate`, {
      lineItems: [{ description: "Tile", qty: 1, unit: "lot", unitPrice: 242.5 }],
      taxRate: TAX_RATE,
    });
    const created = await admin.post("/api/invoices", {
      projectId,
      estimateId: estimate.body.id,
    });
    expect(isPayable(created.body.total)).toBe(true);
    expect(isPayable(created.body.tax)).toBe(true);
  });

  /**
   * The column that moved to Int, over HTTP.
   *
   * A thousand lines at a rate that is not a round cent: the subtotal on the saved
   * estimate has to equal the sum of the amounts printed against those lines, and the
   * invoice torn off it has to carry the same number. Summed as floats, the two drift
   * apart and no screen agrees with any other.
   */
  it("a thousand lines still add up to the invoice they are billed on", async () => {
    const lineItems = Array.from({ length: 1000 }, (_, i) => ({
      description: `Board run ${i + 1}`,
      qty: 1,
      unit: "lf",
      unitPrice: 1.85,
    }));

    const estimate = await admin.post(`/api/projects/${projectId}/estimate`, {
      lineItems,
      taxRate: TAX_RATE,
    });
    expect(estimate.status).toBe(201);

    const lines = JSON.parse(estimate.body.lineItems) as Array<{ qty: number; unitPrice: number }>;
    const linesCents = lines.reduce((s, l) => s + Math.round(l.qty * cents(l.unitPrice)), 0);

    expect(linesCents).toBe(cents(1850));
    expect(cents(estimate.body.subtotal)).toBe(linesCents);
    expect(cents(estimate.body.total)).toBe(
      cents(estimate.body.subtotal) + cents(estimate.body.tax),
    );

    const invoice = await admin.post("/api/invoices", {
      projectId,
      estimateId: estimate.body.id,
    });
    expect(cents(invoice.body.subtotal)).toBe(linesCents);
    expect(cents(invoice.body.total)).toBe(cents(estimate.body.total));
    expect(isPayable(invoice.body.total)).toBe(true);
  });

  /**
   * Was E2E-M2b — the accountant's export did not add up.
   * The same fractional cents reach the CSV through `toFixed(2)` one column at a time:
   * the 242.50 job exports as subtotal 242.50, tax 31.53, total 274.02. Read the row
   * and the tax is a cent more than the difference between the other two numbers.
   */
  it("every exported invoice row adds up", async () => {
    const estimate = await admin.post(`/api/projects/${projectId}/estimate`, {
      lineItems: [{ description: "Grout", qty: 1, unit: "lot", unitPrice: 242.5 }],
      taxRate: TAX_RATE,
    });
    const invoice = await admin.post("/api/invoices", {
      projectId,
      estimateId: estimate.body.id,
    });

    const csv = await admin.get(`/api/export/invoices?year=${YEAR}`);
    expect(csv.status).toBe(200);
    const row = String(csv.body)
      .split("\n")
      .find((line) => line.startsWith(invoice.body.number));
    expect(row, `no export row for ${invoice.body.number}`).toBeTruthy();

    const cell = row!.split(",");
    const [subtotal, tax, total] = [cell[7], cell[8], cell[9]].map(Number);
    expect(cents(subtotal + tax)).toBe(cents(total));
  });
});

describe.sequential("Scenario A — money guardrails", () => {
  let admin: Client;
  let projectId = "";

  beforeAll(async () => {
    admin = await signedIn(inject("baseUrl"), inject("alpha").admin);
    const lead = await admin.post("/api/leads", {
      name: "Guardrail Client",
      phone: "613-555-0210",
      jobType: "Roof repair",
    });
    const project = await admin.post(`/api/leads/${lead.body.id}/convert`, {
      title: "Roof repair — money guardrails",
    });
    projectId = project.body.id;
  });

  /**
   * A payment past the remaining balance used to book straight in: owing went negative,
   * the month's revenue inflated by the overage, and the printed invoice clamped OWING
   * back to $0.00 — so the API said the books were short and the paper the client held
   * said settled. The pay branch now refuses the overage, and no negative-owing state is
   * ever written for any surface to disagree over.
   */
  it("refuses a payment larger than the whole balance and books nothing", async () => {
    const estimate = await admin.post(`/api/projects/${projectId}/estimate`, {
      lineItems: [{ description: "Shingles and labour", qty: 1, unit: "lot", unitPrice: 100 }],
      taxRate: TAX_RATE,
    });
    const invoice = await admin.post("/api/invoices", { projectId, estimateId: estimate.body.id });
    expect(cents(invoice.body.total)).toBe(cents(113));
    await admin.put(`/api/invoices/${invoice.body.id}`, { status: "SENT" });

    const over = await admin.put(`/api/invoices/${invoice.body.id}`, {
      action: "pay",
      amount: 200,
      method: "E_TRANSFER",
    });
    expect(over.status).toBe(400);
    expect(over.body.error).toContain("owing");

    // The refusal wrote no Payment: the invoice is still SENT with nothing collected.
    const after = await admin.get(`/api/invoices/${invoice.body.id}`);
    expect(after.body.status).toBe("SENT");
    expect(cents(after.body.amountPaid)).toBe(0);
    expect(after.body.payments).toHaveLength(0);
  });

  /**
   * The overage that hides best is the one just past a part payment: $50 down on a $113
   * bill leaves $63, and a $100 second payment reads as generous until owing turns −$37.
   * The remainder, not the whole total, is the ceiling — and settling it to the cent
   * still closes the invoice.
   */
  it("caps the second payment at what is left, then settles on the exact remainder", async () => {
    const estimate = await admin.post(`/api/projects/${projectId}/estimate`, {
      lineItems: [{ description: "Flashing", qty: 1, unit: "lot", unitPrice: 100 }],
      taxRate: TAX_RATE,
    });
    const invoice = await admin.post("/api/invoices", { projectId, estimateId: estimate.body.id });
    const totalCents = cents(invoice.body.total);
    await admin.put(`/api/invoices/${invoice.body.id}`, { status: "SENT" });

    const partial = await admin.put(`/api/invoices/${invoice.body.id}`, {
      action: "pay",
      amount: 50,
      method: "CASH",
    });
    expect(partial.body.status).toBe("PARTIAL");

    const remainingCents = totalCents - cents(50);
    const over = await admin.put(`/api/invoices/${invoice.body.id}`, {
      action: "pay",
      amount: toDollars(remainingCents + 1),
      method: "CASH",
    });
    expect(over.status).toBe(400);

    // Owing stayed positive throughout — nothing negative reached the ledger.
    const held = await admin.get(`/api/invoices/${invoice.body.id}`);
    expect(cents(held.body.total) - cents(held.body.amountPaid)).toBe(remainingCents);

    const settle = await admin.put(`/api/invoices/${invoice.body.id}`, {
      action: "pay",
      amount: toDollars(remainingCents),
      method: "CASH",
    });
    expect(settle.body.status).toBe("PAID");
    expect(cents(settle.body.total)).toBe(totalCents);
  });

  /**
   * An invoice totals to what the client owes, so a sub-zero total is not a bill. It used
   * to save as an ordinary DRAFT and pull the revenue rollup down by its own amount; the
   * create route now refuses it, since a refund or credit is a separate document.
   */
  it("refuses an invoice whose total comes out below zero", async () => {
    const res = await admin.post("/api/invoices", {
      projectId,
      lineItems: [{ description: "Manual credit", qty: 1, unit: "ea", unitPrice: -500 }],
      taxRate: TAX_RATE,
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("below zero");

    // A positive bill on the same route still issues, so the guard only bites sub-zero.
    const ok = await admin.post("/api/invoices", {
      projectId,
      lineItems: [{ description: "Repair", qty: 1, unit: "lot", unitPrice: 300 }],
      taxRate: TAX_RATE,
    });
    expect(ok.status).toBe(201);
    expect(cents(ok.body.total)).toBeGreaterThan(0);
  });
});
