import { describe, it, expect } from "vitest";
import { jobMoney, marginTone, marginVerdict, SPLIT_PLANS } from "@/lib/margin";
import { toCents } from "@/lib/money";

/**
 * Job economics. The one rule worth a test suite: margin is measured against what was
 * COLLECTED. Every regression here reads as "this job made money" while the cash is
 * still on the street.
 *
 * Amounts are cents, so the dollars a shop would say out loud are written through
 * `toCents` — the same door the API uses.
 */

describe("jobMoney", () => {
  it("measures margin against collected, never against invoiced", () => {
    const m = jobMoney({
      estimates: [{ totalCents: toCents(10_000), status: "ACCEPTED" }],
      invoices: [{ totalCents: toCents(10_000), status: "SENT" }],
      payments: [{ amountCents: toCents(4_000) }],
      expenses: [{ amountCents: toCents(3_000) }],
    });
    expect(m.invoicedCents).toBe(toCents(10_000));
    expect(m.collectedCents).toBe(toCents(4_000));
    expect(m.marginCents).toBe(toCents(1_000));
    expect(m.marginPct).toBeCloseTo(25, 10);
    // Invoiced-based margin would read 7000 / 70% here.
  });

  it("reports no percentage when nothing has been collected", () => {
    const m = jobMoney({ invoices: [{ totalCents: toCents(5_000), status: "SENT" }], expenses: [{ amountCents: toCents(900) }] });
    expect(m.collectedCents).toBe(toCents(0));
    expect(m.marginCents).toBe(toCents(-900));
    expect(m.marginPct).toBeNull();
  });

  it("returns zeroes for an empty job instead of NaN", () => {
    const m = jobMoney({});
    expect(m).toMatchObject({
      quotedCents: 0,
      invoicedCents: 0,
      collectedCents: 0,
      costsCents: 0,
      marginCents: 0,
      marginPct: null,
    });
  });

  it("keeps a void invoice out of the billed total", () => {
    const m = jobMoney({
      invoices: [
        { totalCents: toCents(3_000), status: "VOID" },
        { totalCents: toCents(2_800), status: "SENT" },
      ],
      payments: [{ amountCents: toCents(2_800) }],
    });
    expect(m.invoicedCents).toBe(toCents(2_800));
    expect(m.outstandingCents).toBe(toCents(0));
  });

  it("signals money billed but not banked", () => {
    const m = jobMoney({
      invoices: [{ totalCents: toCents(6_000), status: "SENT" }],
      payments: [{ amountCents: toCents(2_000) }],
    });
    expect(m.outstandingCents).toBe(toCents(4_000));
  });

  it("never shows negative outstanding when a client overpays", () => {
    const m = jobMoney({
      invoices: [{ totalCents: toCents(1_000), status: "PAID" }],
      payments: [{ amountCents: toCents(1_050) }],
    });
    expect(m.outstandingCents).toBe(toCents(0));
    expect(m.marginCents).toBe(toCents(1_050));
  });

  it("signals work quoted and accepted but never billed", () => {
    const m = jobMoney({
      estimates: [{ totalCents: toCents(5_000), status: "ACCEPTED" }],
      invoices: [{ totalCents: toCents(2_000), status: "SENT" }],
    });
    expect(m.quotedCents).toBe(toCents(5_000));
    expect(m.unbilledCents).toBe(toCents(3_000));
  });

  it("shows no unbilled leak when a change order billed above the quote", () => {
    const m = jobMoney({
      estimates: [{ totalCents: toCents(5_000), status: "ACCEPTED" }],
      invoices: [{ totalCents: toCents(6_200), status: "SENT" }],
    });
    expect(m.unbilledCents).toBe(toCents(0));
  });

  it("quotes from the accepted estimate, ignoring drafts and rejects", () => {
    const m = jobMoney({
      estimates: [
        { totalCents: toCents(9_000), status: "DRAFT" },
        { totalCents: toCents(5_000), status: "ACCEPTED" },
        { totalCents: toCents(7_500), status: "REJECTED" },
      ],
    });
    expect(m.quotedCents).toBe(toCents(5_000));
  });

  it("quotes one accepted estimate, not the sum of every accepted revision", () => {
    // A revised estimate accepted without rejecting the old one used to double the
    // quote and invent an "unbilled" leak the size of the whole job.
    const m = jobMoney({
      estimates: [
        { totalCents: toCents(6_400), status: "ACCEPTED" },
        { totalCents: toCents(5_000), status: "ACCEPTED" },
      ],
      invoices: [{ totalCents: toCents(6_400), status: "SENT" }],
    });
    expect(m.quotedCents).toBe(toCents(6_400));
    expect(m.unbilledCents).toBe(toCents(0));
  });

  it("does not count a draft invoice as billed", () => {
    // A draft is paper nobody has seen. Counted as invoiced, it hid the "quoted but
    // never billed" signal and reported money on the street that was never sent.
    const m = jobMoney({
      estimates: [{ totalCents: toCents(5_000), status: "ACCEPTED" }],
      invoices: [{ totalCents: toCents(5_000), status: "DRAFT" }],
    });
    expect(m.invoicedCents).toBe(toCents(0));
    expect(m.unbilledCents).toBe(toCents(5_000));
    expect(m.outstandingCents).toBe(toCents(0));
  });

  it("falls back to the first estimate in the list when none was accepted", () => {
    // The API sends estimates newest-first (api/projects/[id]/route.ts orders desc),
    // which is what makes index 0 mean "latest". Reordering that query silently
    // changes the quoted number on the job card.
    const m = jobMoney({
      estimates: [
        { totalCents: toCents(7_500), status: "SENT" },
        { totalCents: toCents(4_000), status: "DRAFT" },
      ],
    });
    expect(m.quotedCents).toBe(toCents(7_500));
  });

  it("counts every payment on the job, including a deposit paid before the balance", () => {
    const m = jobMoney({
      invoices: [
        { totalCents: toCents(2_000), status: "PAID" },
        { totalCents: toCents(8_000), status: "SENT" },
      ],
      payments: [{ amountCents: toCents(2_000) }, { amountCents: toCents(3_000) }],
      expenses: [{ amountCents: toCents(1_200) }, { amountCents: toCents(800) }],
    });
    expect(m.collectedCents).toBe(toCents(5_000));
    expect(m.costsCents).toBe(toCents(2_000));
    expect(m.marginCents).toBe(toCents(3_000));
    expect(m.outstandingCents).toBe(toCents(5_000));
  });
});

describe("marginTone", () => {
  it("changes colour exactly on the trade thresholds", () => {
    expect(marginTone(null)).toBe("var(--ink-3)");
    expect(marginTone(-0.1)).toBe("var(--rose-ink)");
    expect(marginTone(0)).toBe("var(--amber-ink)");
    expect(marginTone(14.99)).toBe("var(--amber-ink)");
    expect(marginTone(15)).toBe("var(--emerald-ink)");
  });
});

describe("marginVerdict", () => {
  const verdict = (input: Parameters<typeof jobMoney>[0]) => marginVerdict(jobMoney(input));

  it("distinguishes an untouched job from one that is underwater", () => {
    expect(verdict({})).toMatch(/Nothing booked/);
    expect(verdict({ expenses: [{ amountCents: toCents(400) }] })).toMatch(/underwater/);
  });

  it("calls out costs above collections", () => {
    expect(verdict({ payments: [{ amountCents: toCents(1_000) }], expenses: [{ amountCents: toCents(1_400) }] })).toMatch(
      /Costs exceed/
    );
  });

  it("separates a thin margin from a healthy one at 15%", () => {
    expect(verdict({ payments: [{ amountCents: toCents(1_000) }], expenses: [{ amountCents: toCents(860) }] })).toMatch(/Thin/);
    expect(verdict({ payments: [{ amountCents: toCents(1_000) }], expenses: [{ amountCents: toCents(850) }] })).toBe("Healthy");
  });
});

describe("SPLIT_PLANS", () => {
  it("stays inside the deposit rate the invoice route will accept", () => {
    // api/invoices/route.ts clamps depositRate to 0.9; a plan above it would bill a
    // different split than the label promises.
    for (const plan of SPLIT_PLANS) {
      expect(plan.deposit).toBeGreaterThanOrEqual(0);
      expect(plan.deposit).toBeLessThanOrEqual(0.9);
    }
  });

  it("uses whole-percent rates, so the label on the invoice is exact", () => {
    // The deposit line reads `${Math.round(depositRate * 100)}%`; a rate like 0.335
    // would print 34% on paper while charging 33.5%.
    for (const plan of SPLIT_PLANS) {
      expect(plan.deposit * 100).toBe(Math.round(plan.deposit * 100));
    }
  });

  it("offers the three splits the shop quotes plus a single invoice", () => {
    expect(SPLIT_PLANS.map((p) => p.deposit)).toEqual([0, 0.5, 0.3, 0.25]);
  });
});
