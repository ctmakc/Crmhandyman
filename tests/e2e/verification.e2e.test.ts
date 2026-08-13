import { beforeAll, describe, expect, inject, it } from "vitest";
import { Client, anonymous, cents, inCents, signedIn, type Workspace } from "./harness/client";
import { jobMoney } from "@/lib/margin";
import { oldCents, oldFormatCurrency, oldJobMoney, oldPay, oldQuote, oldSplit } from "./harness/legacy-money";
import { CHASE_DAYS } from "@/lib/invoice-state";

/**
 * Scenario D — the second verification pass.
 *
 * Three questions this file exists to answer, all against the running application:
 *
 *   1. Did moving money to whole cents change any number the desk had already seen?
 *      Every amount the server hands back is compared with what the Float code at
 *      commit 57beaca would have computed for the same input (`./harness/legacy-money`).
 *   2. Does an advertising lead survive the whole journey — landing quiz to the report
 *      that tells the owner which channel paid for itself?
 *   3. Do the surfaces added in this wave hold the tenant and role lines the audit drew?
 *
 * Amounts are read as the API serves them, in dollars, and converted through the
 * application's own door. The workspaces are the ones the harness opened, so the
 * channel report is checked as a DELTA — other files in this suite bill money into the
 * same books, and an absolute assertion would be a bet on test ordering.
 */

/** A local YYYY-MM-DD `daysAgo` days back — the shape the due-date field posts. */
function dayInput(daysAgo: number) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * The awkward job. Three lines a renovator would actually write, priced so the tax and
 * the deposit both fall between two cents: $2,927.31 of work, 13% on top.
 */
const AWKWARD_LINES = [
  { description: "Framing labour", qty: 17, unit: "hr", unitPrice: 68.75 },
  { description: "Drywall and compound", qty: 43, unit: "sq ft", unitPrice: 12.37 },
  { description: "Dump run", qty: 3, unit: "trip", unitPrice: 85.55 },
];
const TAX_RATE = 0.13;

describe.sequential("Scenario D — the money chain against the code it replaced", () => {
  let admin: Client;
  const state = {
    projectId: "",
    estimateId: "",
    invoiceId: "",
    invoiceNumber: "",
    depositId: "",
    balanceId: "",
  };

  beforeAll(async () => {
    admin = await signedIn(inject("baseUrl"), inject("alpha").admin);
  });

  it("prices an estimate exactly where the Float code priced it", async () => {
    const job = await admin.post("/api/projects", {
      clientName: "Korvex Verification",
      address: "44 Bank St, Ottawa",
      email: "vlad@korvex.test",
      phone: "613-555-0166",
      title: "Basement rebuild",
      jobType: "Renovation",
    });
    expect(job.status).toBe(201);
    state.projectId = job.body.id;

    const res = await admin.post(`/api/projects/${state.projectId}/estimate`, {
      lineItems: AWKWARD_LINES,
      taxRate: TAX_RATE,
    });
    expect(res.status).toBe(201);
    state.estimateId = res.body.id;

    const before = oldQuote(AWKWARD_LINES, TAX_RATE);
    expect(res.body.subtotal).toBe(before.subtotal);
    expect(res.body.tax).toBe(before.tax);
    expect(res.body.total).toBe(before.total);

    // And it is an amount a client can transfer, which 274.025 was not.
    expect(cents(res.body.total)).toBe(oldCents(before.total));
    expect(res.body.total * 100).toBeCloseTo(Math.round(res.body.total * 100), 6);
  });

  it("tears off a 30/70 split whose halves are the whole job, as before", async () => {
    expect((await admin.put(`/api/projects/${state.projectId}/estimate`, {
      id: state.estimateId,
      status: "ACCEPTED",
    })).status).toBe(200);

    const res = await admin.post("/api/invoices", {
      projectId: state.projectId,
      estimateId: state.estimateId,
      taxRate: TAX_RATE,
      depositRate: 0.3,
      dueDate: dayInput(-14),
    });
    expect(res.status).toBe(201);
    state.depositId = res.body.id;
    state.balanceId = res.body.balance.id;

    const before = oldSplit(AWKWARD_LINES, TAX_RATE, 0.3);
    expect(res.body.subtotal).toBe(before.deposit.subtotal);
    expect(res.body.tax).toBe(before.deposit.tax);
    expect(res.body.total).toBe(before.deposit.total);
    expect(res.body.balance.subtotal).toBe(before.balance.subtotal);
    expect(res.body.balance.tax).toBe(before.balance.tax);
    expect(res.body.balance.total).toBe(before.balance.total);

    // The property the split exists to keep: paying in two never costs a cent more.
    const whole = oldQuote(AWKWARD_LINES, TAX_RATE);
    expect(cents(res.body.total) + cents(res.body.balance.total)).toBe(cents(whole.total));
  });

  it("takes a part payment and closes on the same cent the Float code closed on", async () => {
    const invoice = await admin.post("/api/invoices", {
      projectId: state.projectId,
      lineItems: AWKWARD_LINES,
      taxRate: TAX_RATE,
      dueDate: dayInput(-14),
    });
    expect(invoice.status).toBe(201);
    state.invoiceId = invoice.body.id;
    state.invoiceNumber = invoice.body.number;
    const total = invoice.body.total as number;
    expect((await admin.put(`/api/invoices/${state.invoiceId}`, { status: "SENT" })).status).toBe(200);

    // A round part payment, then the rest to the cent — the way a deposit and a balance
    // actually land in the bank.
    const first = 1_000;
    const rest = Math.round((total - first) * 100) / 100;

    const partial = await admin.put(`/api/invoices/${state.invoiceId}`, {
      action: "pay",
      amount: first,
      method: "E_TRANSFER",
    });
    expect(partial.status).toBe(200);
    expect(partial.body.status).toBe("PARTIAL");
    expect(partial.body.paidAt).toBeNull();
    expect(oldPay(total, [], first).settled).toBe(false);

    const read = await admin.get(`/api/invoices/${state.invoiceId}`);
    expect(read.body.amountPaid).toBe(first);
    expect(cents(read.body.total - read.body.amountPaid)).toBe(
      oldCents(oldPay(total, [], first).owing)
    );

    const settle = await admin.put(`/api/invoices/${state.invoiceId}`, {
      action: "pay",
      amount: rest,
      method: "CASH",
    });
    expect(settle.status).toBe(200);
    expect(settle.body.status).toBe("PAID");
    expect(settle.body.paidAt).not.toBeNull();
    expect(oldPay(total, [first], rest).settled).toBe(true);
  });

  it("reads the same job economics the Float margin reported", async () => {
    const costs = [
      { amount: 412.9, category: "MATERIALS" },
      { amount: 88.15, category: "VEHICLE" },
    ];
    for (const cost of costs) {
      const res = await admin.post("/api/finance/expenses", {
        projectId: state.projectId,
        description: `${cost.category} for the basement`,
        ...cost,
      });
      expect(res.status).toBe(201);
    }

    const job = await admin.get(`/api/projects/${state.projectId}`);
    expect(job.status).toBe(200);

    const before = oldJobMoney({
      estimates: job.body.estimates.map((e: { total: number; status: string }) => ({
        total: e.total,
        status: e.status,
      })),
      invoices: job.body.invoices.map((i: { total: number; status: string }) => ({
        total: i.total,
        status: i.status,
      })),
      payments: job.body.payments.map((p: { amount: number }) => ({ amount: p.amount })),
      expenses: job.body.expenses.map((e: { amount: number }) => ({ amount: e.amount })),
    });

    // The card is priced in the browser out of this payload, through the same door the
    // screen uses — so this is the number the owner reads, not a second opinion.
    const after = jobMoney(inCents(job.body));

    expect(after.collectedCents).toBe(oldCents(before.collected));
    expect(after.costsCents).toBe(oldCents(before.costs));
    expect(after.marginCents).toBe(oldCents(before.margin));
    expect(after.invoicedCents).toBe(oldCents(before.invoiced));
    expect(after.quotedCents).toBe(oldCents(before.quoted));
    expect(after.outstandingCents).toBe(oldCents(before.outstanding));
    expect(after.unbilledCents).toBe(oldCents(before.unbilled));
    expect(after.marginPct?.toFixed(1)).toBe(before.marginPct?.toFixed(1));
  });

  it("exports a bookkeeper's row that adds up and reads as it always did", async () => {
    const csv = await admin.get("/api/export/invoices");
    expect(csv.status).toBe(200);

    // Rows are CRLF-joined behind a BOM, both of which Excel needs and a naive split
    // carries into the last column of every row.
    const rows = String(csv.body).replace(/^\ufeff/, "").split(/\r?\n/).filter(Boolean);
    // By number: this job carries three invoices — the deposit, its balance and this one.
    const mine = rows.find((r) => r.startsWith(state.invoiceNumber));
    expect(mine).toBeTruthy();

    const cell = (line: string) =>
      line.split(",").map((c) => c.replace(/^"|"$/g, "").replace(/""/g, '"'));
    const columns = cell(mine as string);
    const header = cell(rows[0]);
    for (const name of ["Subtotal", "Tax", "Total", "Paid", "Owing"]) {
      expect(header).toContain(name);
    }
    const at = (name: string) => Number(columns[header.indexOf(name)]);

    const before = oldQuote(AWKWARD_LINES, TAX_RATE);
    expect(at("Subtotal")).toBe(before.subtotal);
    expect(at("Tax")).toBe(before.tax);
    expect(at("Total")).toBe(before.total);
    // The complaint that started the cents work: the columns must be their own total.
    expect(cents(at("Subtotal")) + cents(at("Tax"))).toBe(cents(at("Total")));
    expect(cents(at("Paid")) + cents(at("Owing"))).toBe(cents(at("Total")));

    // Two decimals, always — a bookkeeper pasting this into a spreadsheet reads text.
    for (const name of ["Subtotal", "Tax", "Total", "Paid", "Owing"]) {
      expect(columns[header.indexOf(name)]).toMatch(/^-?\d+\.\d{2}$/);
    }
  });

  it("prints a page carrying the same money strings the Float renderer wrote", async () => {
    const page = await admin.get(`/api/invoices/${state.invoiceId}/pdf`);
    expect(page.status).toBe(200);
    expect(page.headers.get("content-type")).toContain("text/html");

    const html = String(page.body);
    const before = oldQuote(AWKWARD_LINES, TAX_RATE);
    expect(html).toContain(oldFormatCurrency(before.subtotal));
    expect(html).toContain(oldFormatCurrency(before.tax));
    expect(html).toContain(oldFormatCurrency(before.total));
    for (const line of AWKWARD_LINES) {
      expect(html).toContain(oldFormatCurrency(line.unitPrice));
      expect(html).toContain(oldFormatCurrency(line.qty * line.unitPrice));
    }
    // Settled in full: the page says nothing is owed.
    expect(html).toContain("$0.00");
  });

  it("adds the printed lines up to the printed subtotal, which the old page did not", async () => {
    // $1.855 a square foot: the old sheet printed a rate of $1.86, a line of $3,710.00
    // and a subtotal of $3,710.00 — three numbers with no arithmetic between them.
    const job = await admin.post("/api/projects", {
      clientName: "Duct Rate",
      address: "9 Industrial Ave, Ottawa",
      title: "Duct cleaning at a fractional rate",
    });
    const invoice = await admin.post("/api/invoices", {
      projectId: job.body.id,
      lineItems: [{ description: "Duct", qty: 2_000, unit: "sq ft", unitPrice: 1.855 }],
      taxRate: TAX_RATE,
    });
    expect(invoice.status).toBe(201);

    // The rate is stored at the cent it prints at, so the line follows from it.
    expect(invoice.body.subtotal).toBe(3_720);
    expect(oldQuote([{ description: "", qty: 2_000, unit: "", unitPrice: 1.855 }], TAX_RATE).subtotal)
      .toBe(3_710);

    const html = String((await admin.get(`/api/invoices/${invoice.body.id}/pdf`)).body);
    expect(html).toContain("$1.86");
    expect(html).toContain("$3,720.00");
    expect(html).not.toContain("$3,710.00");
  });
});

describe.sequential("Scenario D — an advertising lead, landing quiz to channel report", () => {
  let admin: Client;
  let worker: Client;
  let alpha: Workspace;
  let beta: Workspace;
  let baseUrl: string;

  const state = { key: "", keyId: "", leadId: "", projectId: "", invoiceId: "" };
  const CHANNEL = "FACEBOOK";
  const TICKET = 2_260;

  /** The FACEBOOK row of the current month, or a zeroed one when it is not there yet. */
  async function facebookRow() {
    const now = new Date();
    const res = await admin.get(
      `/api/reports/channels?year=${now.getFullYear()}&month=${now.getMonth() + 1}`
    );
    expect(res.status).toBe(200);
    const row = (res.body.channels as Array<{ channel: string }>).find(
      (c) => c.channel === CHANNEL
    );
    return {
      leads: 0,
      jobs: 0,
      reached: 0,
      collected: 0,
      unanswered: 0,
      ...(row ?? {}),
    } as { leads: number; jobs: number; reached: number; collected: number; unanswered: number };
  }

  let before: Awaited<ReturnType<typeof facebookRow>>;

  beforeAll(async () => {
    baseUrl = inject("baseUrl");
    alpha = inject("alpha");
    beta = inject("beta");
    admin = await signedIn(baseUrl, alpha.admin);
    worker = await signedIn(baseUrl, alpha.worker);
    before = await facebookRow();
  });

  it("issues a landing key that names its channel and shows the key exactly once", async () => {
    const res = await admin.post("/api/settings/intake-keys", {
      label: "Korvex quiz — verification",
      source: CHANNEL,
    });
    expect(res.status).toBe(201);
    expect(res.body.key).toMatch(/\S{20,}/);
    state.key = res.body.key;
    state.keyId = res.body.id;

    const list = await admin.get("/api/settings/intake-keys");
    const stored = list.body.find((k: { id: string }) => k.id === state.keyId);
    expect(stored).toBeTruthy();
    expect(JSON.stringify(stored)).not.toContain(state.key);
  });

  it("reads the alert shelf without a credential ever coming back", async () => {
    /**
     * Read-only on purpose. Alerts coalesce every lead inside a minute into one message
     * and remember when they last spoke, in the workspace row — switching them on here
     * would swallow the alert another file in this suite is waiting for. The delivery
     * path itself is proved in `notify.e2e.test.ts`; what belongs here is that the shelf
     * hands out no credential and that pressing «Send a test» is written down.
     */
    const res = await admin.get("/api/settings/notifications");
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toMatch(/\d{5,}:[A-Za-z0-9_-]{30,}/);
    if (res.body.telegramTokenHint) expect(res.body.telegramTokenHint).toMatch(/^••••/);
  });

  it("takes the quiz submission and answers the landing page, not the desk", async () => {
    const visitor = anonymous(baseUrl);
    const res = await visitor.post(
      `/api/intake/${state.key}`,
      {
        name: "Sarah Connor",
        phone: "613-555-0100",
        email: "sarah@example.com",
        city: "Ottawa",
        jobType: "Kitchen renovation",
        // A quiz posts its answers flat, one field per question — that is the shape both
        // landing pages send and the only shape the transcript is built from.
        timing: "ASAP",
        budget: "20-30k",
        rooms: "Kitchen + hallway",
        event_id: `verify-${Date.now()}`,
      },
      { tenant: null }
    );
    expect(res.status).toBe(201);

    const leads = await admin.get("/api/leads");
    const lead = leads.body.find((l: { phone: string }) => l.phone === "613-555-0100");
    expect(lead).toBeTruthy();
    state.leadId = lead.id;
    expect(lead.source).toBe(CHANNEL);
    expect(lead.status).toBe("NEW");
    // The quiz answers arrive as the shop can read them on the phone.
    expect(lead.notes).toContain("ASAP");
    expect(lead.notes).toContain("20-30k");
  });

  it("writes down every press of «Send a test», delivered or not", async () => {
    // Whatever the shelf currently holds, the owner asking «does this reach me» leaves a
    // line in the book. Silence about a broken bot token is worse than the broken token.
    const res = await admin.post("/api/settings/notifications");
    expect(res.status).toBe(200);
    expect(typeof res.body.ok).toBe("boolean");
    expect(String(res.body.detail).length).toBeGreaterThan(0);

    const log = await admin.get("/api/audit?entity=Tenant&take=50");
    const line = log.body.entries.find((e: { action: string }) => e.action === "notify.test");
    expect(line, "the journal has to carry the attempt").toBeTruthy();
    expect(line.summary).toMatch(/Test lead alert/i);
  });

  it("shows the lead unanswered on the report until somebody moves it", async () => {
    const mid = await facebookRow();
    expect(mid.leads).toBe(before.leads + 1);
    expect(mid.unanswered).toBe(before.unanswered + 1);
    expect(mid.reached).toBe(before.reached);
  });

  it("turns the lead into a job, bills it and collects", async () => {
    const job = await admin.post(`/api/leads/${state.leadId}/convert`, {
      title: "Kitchen renovation — Sarah Connor",
      description: "From the quiz",
    });
    expect(job.status).toBe(201);
    state.projectId = job.body.id;

    const invoice = await admin.post("/api/invoices", {
      projectId: state.projectId,
      lineItems: [{ description: "Kitchen renovation", qty: 1, unit: "ea", unitPrice: 2_000 }],
      taxRate: TAX_RATE,
    });
    expect(invoice.status).toBe(201);
    expect(invoice.body.total).toBe(TICKET);
    state.invoiceId = invoice.body.id;

    expect((await admin.put(`/api/invoices/${state.invoiceId}`, { status: "SENT" })).status).toBe(200);
    const paid = await admin.put(`/api/invoices/${state.invoiceId}`, {
      action: "pay",
      amount: TICKET,
    });
    expect(paid.body.status).toBe("PAID");
  });

  it("puts the money against the channel that brought it", async () => {
    const after = await facebookRow();
    expect(after.leads).toBe(before.leads + 1);
    expect(after.jobs).toBe(before.jobs + 1);
    expect(after.reached).toBe(before.reached + 1);
    expect(after.unanswered).toBe(before.unanswered);
    expect(cents(after.collected)).toBe(cents(before.collected) + cents(TICKET));
  });

  it("counts the ad invoice against the same channel and answers «did it pay for itself»", async () => {
    // Ad spend is an overhead expense with a channel in its description — no schema for it.
    const spend = await admin.post("/api/finance/expenses", {
      description: `Ad spend: ${CHANNEL}`,
      amount: 400,
      category: "OTHER",
    });
    expect(spend.status).toBe(201);

    const now = new Date();
    const res = await admin.get(
      `/api/reports/channels?year=${now.getFullYear()}&month=${now.getMonth() + 1}`
    );
    const row = (res.body.channels as Array<Record<string, number | string | null>>).find(
      (c) => c.channel === CHANNEL
    ) as Record<string, number>;

    expect(row.adSpend).toBe(400);
    expect(cents(row.cpl)).toBe(Math.round(40_000 / row.leads));
    expect(cents(row.netAfterAds)).toBe(cents(row.margin) - 40_000);
    expect(row.returnPerAdDollar).toBeCloseTo(row.collected / 400, 6);
    expect(res.body.spendBooked).toBe(true);
    expect(res.body.spendShown).toBe(true);
  });

  it("hands the same numbers to the CSV the owner mails his accountant", async () => {
    const csv = await admin.get("/api/export/channels");
    expect(csv.status).toBe(200);
    const rows = String(csv.body).split("\n").filter(Boolean);
    // The sheet is written for a human, so the channel appears under its label.
    const now = new Date();
    const report = await admin.get(`/api/reports/channels?year=${now.getFullYear()}`);
    const label = (report.body.channels as Array<{ channel: string; label: string }>).find(
      (c) => c.channel === CHANNEL
    )?.label as string;
    expect(label).toBeTruthy();

    const line = rows.find((r) => r.includes(label));
    expect(line).toBeTruthy();
    expect(line).toContain("400.00");
  });

  it("keeps the report and the alert shelf on the owner's side of the desk", async () => {
    for (const path of ["/api/reports/channels", "/api/export/channels", "/api/settings/notifications"]) {
      expect((await worker.get(path)).status).toBe(403);
      expect((await anonymous(baseUrl).get(path, { tenant: alpha.slug })).status).toBe(401);
    }
    expect((await worker.put("/api/settings/notifications", { isActive: false })).status).toBe(403);
    expect((await worker.post("/api/settings/notifications")).status).toBe(403);

    // And the screens behind them bounce a field hand back to his board.
    const page = await worker.get("/reports");
    expect(page.status).toBe(307);
    expect(page.headers.get("location")).toContain("/today");
  });

  it("keeps one shop's channels out of another shop's report", async () => {
    const theirs = await signedIn(baseUrl, beta.admin);
    const now = new Date();
    const mine = await admin.get(
      `/api/reports/channels?year=${now.getFullYear()}&month=${now.getMonth() + 1}`
    );
    const other = await theirs.get(
      `/api/reports/channels?year=${now.getFullYear()}&month=${now.getMonth() + 1}`
    );
    expect(other.status).toBe(200);

    const facebookOf = (body: { channels: Array<{ channel: string; collected: number }> }) =>
      body.channels.find((c) => c.channel === CHANNEL)?.collected ?? 0;
    expect(facebookOf(mine.body)).toBeGreaterThan(0);
    expect(facebookOf(other.body)).not.toBe(facebookOf(mine.body));

    // Reaching for the neighbour's workspace by address is refused before the handler.
    const reach = await admin.get(`/api/reports/channels?year=${now.getFullYear()}`, {
      tenant: beta.slug,
    });
    expect(reach.status).toBe(403);
  });

  it("refuses a report of a month or a trade that does not exist", async () => {
    expect((await admin.get("/api/reports/channels?year=2026&month=13")).status).toBe(400);
    expect((await admin.get("/api/reports/channels?year=1900")).status).toBe(400);
    expect((await admin.get("/api/reports/channels?year=2026&vertical=PLUMBING")).status).toBe(400);
  });

  it("stops another shop's landing page from filing into this one", async () => {
    const theirs = await signedIn(baseUrl, beta.admin);
    // Their key, their leads. The workspace comes from the key and from nowhere else.
    const theirKey = await theirs.post("/api/settings/intake-keys", {
      label: "Beta landing",
      source: "GOOGLE",
    });
    expect(theirKey.status).toBe(201);

    const visitor = anonymous(baseUrl);
    const res = await visitor.post(
      `/api/intake/${theirKey.body.key}`,
      { name: "Filed To Beta", phone: "613-555-0777", jobType: "Move" },
      { tenant: null }
    );
    expect(res.status).toBe(201);

    const mine = await admin.get("/api/leads");
    expect(mine.body.some((l: { phone: string }) => l.phone === "613-555-0777")).toBe(false);

    // A worker cannot mint a landing credential for the workspace he works in.
    expect((await worker.post("/api/settings/intake-keys", { label: "x", source: "OTHER" })).status)
      .toBe(403);
    // Nor delete somebody else's.
    expect((await admin.del(`/api/settings/intake-keys?id=${theirKey.body.id}`)).status).toBe(404);
  });
});

describe.sequential("Scenario D — the chase ladder at its boundaries", () => {
  let admin: Client;

  beforeAll(async () => {
    admin = await signedIn(inject("baseUrl"), inject("alpha").admin);
  });

  /** A SENT invoice due `daysLate` days ago, with an address to write to. */
  async function sentInvoice(daysLate: number) {
    const job = await admin.post("/api/projects", {
      clientName: `Ladder ${daysLate}`,
      address: "12 Bank St, Ottawa",
      email: "ladder@example.com",
      title: `Ladder check ${daysLate}`,
    });
    const invoice = await admin.post("/api/invoices", {
      projectId: job.body.id,
      dueDate: dayInput(daysLate),
      lineItems: [{ description: "Work", qty: 1, unit: "ea", unitPrice: 400 }],
    });
    expect((await admin.put(`/api/invoices/${invoice.body.id}`, { status: "SENT" })).status).toBe(200);
    return invoice.body.id as string;
  }

  /**
   * ROADMAP 4.3 promised the ping at a week, the call at two and the final notice at a
   * month. The code used to open the chase on day one, so a client whose cheque was in
   * the post read "you are overdue" the next morning. These are the exact days either
   * side of each rung, driven through the same button the desk presses.
   */
  const rungs: Array<[number, string]> = [
    [CHASE_DAYS.watch, "notice"],
    [CHASE_DAYS.nudge - 1, "notice"],
    [CHASE_DAYS.nudge, "nudge"],
    [CHASE_DAYS.call - 1, "nudge"],
    [CHASE_DAYS.call, "call"],
    [CHASE_DAYS.final - 1, "call"],
    [CHASE_DAYS.final, "final"],
  ];

  for (const [days, stage] of rungs) {
    it(`day ${days} overdue is the "${stage}" rung`, async () => {
      const id = await sentInvoice(days);
      const res = await admin.post(`/api/invoices/${id}/remind`);
      expect(res.status).toBe(200);
      expect(res.body.stage).toBe(stage);

      // The lateness the ladder was read at — the response carries the letter, the
      // journal carries the reasoning.
      const log = await admin.get(`/api/audit?entity=Invoice&entityId=${id}`);
      const chased = log.body.entries.find((e: { action: string }) => e.action === "invoice.remind");
      expect(JSON.parse(chased.meta)).toMatchObject({ stage, daysOverdue: days });

      /**
       * The words escalate with the rung, and only the last two carry pressure:
       * a copy «for your records» in the first week, a soft reminder at seven days,
       * «past due» and a question at two weeks, «overdue» and stopped work at a month.
       * Nothing before day fourteen tells a client he is late.
       */
      const wording = `${res.body.subject} ${res.body.body.join(" ")}`.toLowerCase();
      if (days < CHASE_DAYS.call) {
        expect(wording).not.toContain("overdue");
        expect(wording).not.toContain("past due");
      }
      if (stage === "notice") expect(wording).toContain("for your records");
      if (stage === "nudge") expect(wording).toContain("a quick reminder");
      if (stage === "call") expect(wording).toContain("past due");
      if (stage === "final") {
        expect(wording).toContain(`${days} days overdue`);
        expect(wording).toContain("paused further work");
      }
    });
  }

  it("says nothing at all about paper that is due today or not yet due", async () => {
    for (const days of [0, -1, -7]) {
      const id = await sentInvoice(days);
      const res = await admin.post(`/api/invoices/${id}/remind`);
      expect(res.status).toBe(400);
    }
  });
});

describe.sequential("Scenario D — defects found by this pass, since closed", () => {
  let admin: Client;
  let worker: Client;
  let baseUrl: string;

  beforeAll(async () => {
    baseUrl = inject("baseUrl");
    admin = await signedIn(baseUrl, inject("alpha").admin);
    worker = await signedIn(baseUrl, inject("alpha").worker);
  });

  async function job(title: string) {
    const res = await admin.post("/api/projects", {
      clientName: "Enum Probe",
      address: "1 Bank St, Ottawa",
      title,
    });
    expect(res.status).toBe(201);
    return res.body.id as string;
  }

  /**
   * A value the desk did not offer, sent to a column that is an enum, used to reach
   * Prisma unchecked and answer 500. On a screen that reads as a button that does
   * nothing — the exact shape of the «Open a job» defect an earlier audit closed, on
   * four more doors. The lists now live in `src/lib/enums.ts` and each door answers 400
   * naming the field.
   */
  it("rejects an expense category the shop does not have", async () => {
    const res = await admin.post("/api/finance/expenses", {
      projectId: await job("Expense enum probe"),
      description: "Diesel",
      amount: 42,
      category: "FUEL",
    });
    expect(res.status).toBe(400);
  });

  it("rejects a payment method the shop does not take", async () => {
    const res = await admin.post("/api/finance/payments", {
      projectId: await job("Payment enum probe"),
      amount: 42,
      method: "CRYPTO",
    });
    expect(res.status).toBe(400);
  });

  it("rejects a lead source that is not on the list", async () => {
    const res = await admin.post("/api/leads", {
      name: "Enum Probe",
      phone: "613-555-0999",
      source: "TIKTOK",
    });
    expect(res.status).toBe(400);
  });

  it("rejects a job status that does not exist", async () => {
    const id = await job("Status enum probe");
    const res = await admin.put(`/api/projects/${id}`, { status: "ON_FIRE" });
    expect(res.status).toBe(400);
  });

  /**
   * `/api/settings/integrations/[channel]` used to check that somebody was signed in and
   * nothing else, then serve the whole row — `accessToken` and `webhookSecret` included.
   * The shop's Facebook page token and the secret its webhook is verified with were
   * readable by any hired hand with a login. It is admin-only now, and answers with a
   * masked hint rather than a secret. A probe channel is used so nothing real is written.
   */
  it("keeps a channel credential off the crew's screen", async () => {
    const written = await admin.put("/api/settings/integrations/verifyprobe", {
      accessToken: "PROBE-TOKEN-must-not-leak",
      webhookSecret: "PROBE-SECRET-must-not-leak",
      isActive: false,
    });
    expect(written.status).toBe(200);

    const read = await worker.get("/api/settings/integrations/verifyprobe");
    expect(read.status).toBe(403);
  });

  it("never puts a channel token in a response body", async () => {
    const read = await worker.get("/api/settings/integrations/verifyprobe");
    expect(JSON.stringify(read.body)).not.toContain("PROBE-TOKEN-must-not-leak");
  });

  /**
   * The two-week letter goes out unchanged until the thirtieth day, so it used to tell a
   * client 29 days late that he was «now two weeks past due» — over an invoice dated a
   * month ago, and the one number in the letter he could argue with was the wrong one.
   * It names the real count now.
   */
  it("tells a client 29 days late how late he actually is", async () => {
    const id = await job("Late wording probe");
    const invoice = await admin.post("/api/invoices", {
      projectId: id,
      dueDate: dayInput(29),
      email: "late@example.com",
      lineItems: [{ description: "Work", qty: 1, unit: "ea", unitPrice: 400 }],
    });
    await admin.put(`/api/invoices/${invoice.body.id}`, { status: "SENT" });

    const res = await admin.post(`/api/invoices/${invoice.body.id}/remind`);
    expect(res.body.body.join(" ")).toContain("29 days");
  });
});

describe.sequential("Scenario D — the schedule surface holds the tenant line", () => {
  let admin: Client;
  let theirs: Client;
  let beta: Workspace;

  beforeAll(async () => {
    const baseUrl = inject("baseUrl");
    beta = inject("beta");
    admin = await signedIn(baseUrl, inject("alpha").admin);
    theirs = await signedIn(baseUrl, beta.admin);
  });

  it("keeps a neighbour's work out of the week window", async () => {
    const today = new Date();
    const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

    const theirJob = await theirs.post("/api/projects", {
      clientName: "Beta Client",
      address: "2 Elgin St, Ottawa",
      title: "Beta move",
      scheduledDate: date,
      durationMinutes: 180,
    });
    expect(theirJob.status).toBe(201);

    for (const window of ["week", "day"]) {
      const mine = await admin.get(`/api/projects?window=${window}&date=${date}`);
      expect(mine.status).toBe(200);
      expect(mine.body.map((p: { id: string }) => p.id)).not.toContain(theirJob.body.id);
    }

    // And the neighbour's job cannot be reached by id, however it is addressed.
    expect((await admin.get(`/api/projects/${theirJob.body.id}`)).status).toBe(404);
    expect((await admin.put(`/api/projects/${theirJob.body.id}`, { durationMinutes: 30 })).status).toBe(404);
    expect((await admin.get(`/api/projects?window=week&date=${date}`, { tenant: beta.slug })).status).toBe(403);
  });
});
