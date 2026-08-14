import { beforeAll, describe, expect, inject, it } from "vitest";
import { Client, anonymous, registerWorkspace, signedIn, type Workspace } from "./harness/client";

/**
 * Scenario C — chasing money, over HTTP.
 *
 * The unit tests pin the ladder; this one pins what the desk actually experiences:
 * a bill that is three days late gets a plain notice and never the word "overdue",
 * a lead with a phone and no address comes back as a call rather than a dead end,
 * pressing the button twice in one day does not mail the client twice, and the journal
 * carries a sentence about every attempt.
 *
 * The dates are set through the API in the shop's own calendar, because that is the
 * calendar the escalation counts in.
 */

/** A local YYYY-MM-DD `daysAgo` days back — the shape the due-date field posts. */
function dayInput(daysAgo: number) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

describe.sequential("Scenario C — the chase ladder and the call band", () => {
  let alpha: Workspace;
  let baseUrl: string;
  let admin: Client;

  beforeAll(async () => {
    baseUrl = inject("baseUrl");
    alpha = inject("alpha");
    admin = await signedIn(baseUrl, alpha.admin);
  });

  /** A sent invoice due `daysLate` days ago on a job carrying whatever contact is given. */
  async function sentInvoice(
    daysLate: number,
    contact: { phone?: string; email?: string } = {},
    as?: Client
  ) {
    const desk = as ?? admin;
    const job = await desk.post("/api/projects", {
      clientName: "Dave Kowalski",
      address: "12 Bank St, Ottawa",
      title: "Bathroom retile",
      ...contact,
    });
    expect(job.status).toBe(201);

    const invoice = await desk.post("/api/invoices", {
      projectId: job.body.id,
      dueDate: dayInput(daysLate),
      lineItems: [{ description: "Retile and grout", qty: 1, unit: "ea", unitPrice: 400 }],
    });
    expect(invoice.status).toBe(201);

    const sent = await desk.put(`/api/invoices/${invoice.body.id}`, { status: "SENT" });
    expect(sent.status).toBe(200);
    return invoice.body.id as string;
  }

  it("keeps the first week neutral and starts the ping on day seven", async () => {
    // ROADMAP 4.3 promised a soft ping at a week; the code opened the chase on day one,
    // so a client whose cheque was in the post read "you are overdue" the next morning.
    const young = await sentInvoice(3, { email: "dave@example.com" });
    const week = await sentInvoice(8, { email: "dave@example.com" });
    const month = await sentInvoice(41, { email: "dave@example.com" });

    const first = await admin.post(`/api/invoices/${young}/remind`);
    expect(first.status).toBe(200);
    expect(first.body.stage).toBe("notice");
    expect(`${first.body.subject} ${first.body.body.join(" ")}`.toLowerCase()).not.toContain("overdue");

    const second = await admin.post(`/api/invoices/${week}/remind`);
    expect(second.body.stage).toBe("nudge");

    const third = await admin.post(`/api/invoices/${month}/remind`);
    expect(third.body.stage).toBe("final");
    expect(third.body.body.join(" ")).toMatch(/paused further work/i);
  });

  it("hands an invoice with no address to the phone, with the number attached", async () => {
    // Both quiz landings collect a phone and nothing else, so this is the ordinary
    // shape of an advertising lead — «no email on file» used to be the end of it.
    const id = await sentInvoice(9, { phone: "613-555-0134" });

    const res = await admin.post(`/api/invoices/${id}/remind`);
    expect(res.status).toBe(200);
    expect(res.body.sent).toBe(false);
    expect(res.body.channel).toBe("phone");
    expect(res.body.reason).toBe("no email on file");
    expect(res.body.phone).toBe("613-555-0134");
    // The letter is still written — it is the script for the call.
    expect(res.body.body.join(" ")).toContain("$452.00");

    const log = await admin.get(`/api/audit?entity=Invoice&entityId=${id}`);
    const chased = log.body.entries.find((e: { action: string }) => e.action === "invoice.remind");
    expect(chased.summary).toContain("9 days late");
    expect(chased.summary).toContain("613-555-0134");
    expect(JSON.parse(chased.meta)).toMatchObject({ channel: "phone", sent: false, stage: "nudge" });
  });

  /**
   * The once-a-day lock protects the CLIENT'S INBOX, so it is spent by a letter that
   * left and by nothing else. It used to be spent by any press: with no address on file
   * the answer was «handed to the call list», and the moment the owner typed the address
   * in, the button refused him until midnight — the day's chase burned on a letter that
   * was never written to anybody.
   *
   * This server has no SMTP, so every send here honestly fails and the door stays open.
   * `remindedAt` therefore means «last one that actually reached the client»; the daily
   * gate reads it through `sameCalendarDay`, which has its own unit coverage.
   */
  it("does not spend the day on a reminder that never reached anyone", async () => {
    const id = await sentInvoice(10, { email: "dave@example.com" });

    const first = await admin.post(`/api/invoices/${id}/remind`);
    expect(first.status).toBe(200);
    expect(first.body.sent, "no SMTP on this server").toBe(false);

    // Nothing landed in the client's inbox, so nothing is being protected from a second
    // attempt — the owner fixes the mail settings and presses again.
    const again = await admin.post(`/api/invoices/${id}/remind`);
    expect(again.status).toBe(200);

    // Both attempts are on the record, because the desk reads that count to know how
    // hard this client has been chased.
    const invoice = await admin.get(`/api/invoices/${id}`);
    expect(invoice.body.reminderCount).toBe(2);

    const log = await admin.get(`/api/audit?entity=Invoice&entityId=${id}`);
    const chases = log.body.entries.filter((e: { action: string }) => e.action === "invoice.remind");
    expect(chases).toHaveLength(2);
    for (const line of chases) expect(JSON.parse(line.meta).sent).toBe(false);
  });

  it("refuses to chase paper that is not overdue", async () => {
    const id = await sentInvoice(-5, { email: "dave@example.com" });
    const res = await admin.post(`/api/invoices/${id}/remind`);
    expect(res.status).toBe(400);

    const settled = await sentInvoice(12, { email: "dave@example.com" });
    expect((await admin.put(`/api/invoices/${settled}`, { action: "pay", amount: 452 })).status).toBe(200);
    // Settled is settled: the lane and the letter both read what is owed, not the status.
    expect((await admin.post(`/api/invoices/${settled}/remind`)).status).toBe(400);
  });

  it("draws the desk in two bands — one to write to, one to phone", async () => {
    // A workspace of its own: the lane shows the five oldest debts, and the point of
    // this check is which BAND each one lands in, not which ones made the cut.
    const shop = await registerWorkspace(baseUrl, "Chase");
    const owner = await signedIn(baseUrl, shop.admin);

    const writable = await sentInvoice(9, { email: "dave@example.com" }, owner);
    const dialable = await sentInvoice(4, { phone: "613-555-0134" }, owner);
    expect(writable).not.toBe(dialable);

    const desk = await owner.get("/");
    expect(desk.status).toBe(200);
    const html = String(desk.body);

    expect(html).toContain("Chase list");
    expect(html).toContain("Chase by hand");
    // The number is a real link: the dispatcher taps it instead of copying it out.
    expect(html).toContain("tel:613-555-0134");
    // What they ordered, so the call opens with the job rather than with the number.
    expect(html).toContain("Bathroom retile");
  });

  it("throttles the integration hooks before they read a body or a table", async () => {
    // The hooks are the only endpoints a stranger may call at will. The refusal costs a
    // map lookup — no multipart parse, no HMAC, no query for the workspace.
    const stranger = anonymous(baseUrl);
    let last = { status: 0, headers: new Headers() } as { status: number; headers: Headers };

    for (let i = 0; i < 65; i++) {
      last = await stranger.post("/api/webhooks/instagram", { entry: [] }, { tenant: null });
      if (last.status === 429) break;
    }

    expect(last.status).toBe(429);
    expect(Number(last.headers.get("retry-after"))).toBeGreaterThan(0);
  });

  it("answers the subscribe handshake only with the configured token", async () => {
    // An empty META_WEBHOOK_VERIFY_TOKEN compared equal to an empty hub.verify_token,
    // so a deployment that left the variable blank handed the challenge to anyone.
    const stranger = anonymous(baseUrl);
    const res = await stranger.get(
      "/api/webhooks/facebook?hub.mode=subscribe&hub.verify_token=&hub.challenge=1234",
      { tenant: null }
    );
    expect(res.status).toBe(403);
  });
});
