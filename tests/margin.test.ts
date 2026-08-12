import { describe, it, expect } from "vitest";
import { jobMoney, marginTone, marginVerdict, SPLIT_PLANS } from "@/lib/margin";

/**
 * Job economics. The one rule worth a test suite: margin is measured against what was
 * COLLECTED. Every regression here reads as "this job made money" while the cash is
 * still on the street.
 */

describe("jobMoney", () => {
  it("measures margin against collected, never against invoiced", () => {
    const m = jobMoney({
      estimates: [{ total: 10_000, status: "ACCEPTED" }],
      invoices: [{ total: 10_000, status: "SENT" }],
      payments: [{ amount: 4_000 }],
      expenses: [{ amount: 3_000 }],
    });
    expect(m.invoiced).toBe(10_000);
    expect(m.collected).toBe(4_000);
    expect(m.margin).toBe(1_000);
    expect(m.marginPct).toBeCloseTo(25, 10);
    // Invoiced-based margin would read 7000 / 70% here.
  });

  it("reports no percentage when nothing has been collected", () => {
    const m = jobMoney({ invoices: [{ total: 5_000, status: "SENT" }], expenses: [{ amount: 900 }] });
    expect(m.collected).toBe(0);
    expect(m.margin).toBe(-900);
    expect(m.marginPct).toBeNull();
  });

  it("returns zeroes for an empty job instead of NaN", () => {
    const m = jobMoney({});
    expect(m).toMatchObject({ quoted: 0, invoiced: 0, collected: 0, costs: 0, margin: 0, marginPct: null });
  });

  it("keeps a void invoice out of the billed total", () => {
    const m = jobMoney({
      invoices: [
        { total: 3_000, status: "VOID" },
        { total: 2_800, status: "SENT" },
      ],
      payments: [{ amount: 2_800 }],
    });
    expect(m.invoiced).toBe(2_800);
    expect(m.outstanding).toBe(0);
  });

  it("signals money billed but not banked", () => {
    const m = jobMoney({
      invoices: [{ total: 6_000, status: "SENT" }],
      payments: [{ amount: 2_000 }],
    });
    expect(m.outstanding).toBe(4_000);
  });

  it("never shows negative outstanding when a client overpays", () => {
    const m = jobMoney({
      invoices: [{ total: 1_000, status: "PAID" }],
      payments: [{ amount: 1_050 }],
    });
    expect(m.outstanding).toBe(0);
    expect(m.margin).toBe(1_050);
  });

  it("signals work quoted and accepted but never billed", () => {
    const m = jobMoney({
      estimates: [{ total: 5_000, status: "ACCEPTED" }],
      invoices: [{ total: 2_000, status: "SENT" }],
    });
    expect(m.quoted).toBe(5_000);
    expect(m.unbilled).toBe(3_000);
  });

  it("shows no unbilled leak when a change order billed above the quote", () => {
    const m = jobMoney({
      estimates: [{ total: 5_000, status: "ACCEPTED" }],
      invoices: [{ total: 6_200, status: "SENT" }],
    });
    expect(m.unbilled).toBe(0);
  });

  it("quotes from the accepted estimate, ignoring drafts and rejects", () => {
    const m = jobMoney({
      estimates: [
        { total: 9_000, status: "DRAFT" },
        { total: 5_000, status: "ACCEPTED" },
        { total: 7_500, status: "REJECTED" },
      ],
    });
    expect(m.quoted).toBe(5_000);
  });

  it("quotes one accepted estimate, not the sum of every accepted revision", () => {
    // A revised estimate accepted without rejecting the old one used to double the
    // quote and invent an "unbilled" leak the size of the whole job.
    const m = jobMoney({
      estimates: [
        { total: 6_400, status: "ACCEPTED" },
        { total: 5_000, status: "ACCEPTED" },
      ],
      invoices: [{ total: 6_400, status: "SENT" }],
    });
    expect(m.quoted).toBe(6_400);
    expect(m.unbilled).toBe(0);
  });

  it("does not count a draft invoice as billed", () => {
    // A draft is paper nobody has seen. Counted as invoiced, it hid the "quoted but
    // never billed" signal and reported money on the street that was never sent.
    const m = jobMoney({
      estimates: [{ total: 5_000, status: "ACCEPTED" }],
      invoices: [{ total: 5_000, status: "DRAFT" }],
    });
    expect(m.invoiced).toBe(0);
    expect(m.unbilled).toBe(5_000);
    expect(m.outstanding).toBe(0);
  });

  it("falls back to the first estimate in the list when none was accepted", () => {
    // The API sends estimates newest-first (api/projects/[id]/route.ts orders desc),
    // which is what makes index 0 mean "latest". Reordering that query silently
    // changes the quoted number on the job card.
    const m = jobMoney({
      estimates: [
        { total: 7_500, status: "SENT" },
        { total: 4_000, status: "DRAFT" },
      ],
    });
    expect(m.quoted).toBe(7_500);
  });

  it("counts every payment on the job, including a deposit paid before the balance", () => {
    const m = jobMoney({
      invoices: [
        { total: 2_000, status: "PAID" },
        { total: 8_000, status: "SENT" },
      ],
      payments: [{ amount: 2_000 }, { amount: 3_000 }],
      expenses: [{ amount: 1_200 }, { amount: 800 }],
    });
    expect(m.collected).toBe(5_000);
    expect(m.costs).toBe(2_000);
    expect(m.margin).toBe(3_000);
    expect(m.outstanding).toBe(5_000);
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
    expect(verdict({ expenses: [{ amount: 400 }] })).toMatch(/underwater/);
  });

  it("calls out costs above collections", () => {
    expect(verdict({ payments: [{ amount: 1_000 }], expenses: [{ amount: 1_400 }] })).toMatch(
      /Costs exceed/
    );
  });

  it("separates a thin margin from a healthy one at 15%", () => {
    expect(verdict({ payments: [{ amount: 1_000 }], expenses: [{ amount: 860 }] })).toMatch(/Thin/);
    expect(verdict({ payments: [{ amount: 1_000 }], expenses: [{ amount: 850 }] })).toBe("Healthy");
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
