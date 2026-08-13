import { describe, it, expect } from "vitest";
import {
  dollarText,
  formatCents,
  lineTotalCents,
  quoteTotals,
  shareOfCents,
  toCents,
  type LineItem,
} from "@/lib/money";
import { jobMoney } from "@/lib/margin";
import { isOverdue, owingCents } from "@/lib/invoice-state";
import { renderDocument } from "@/lib/document";
import {
  oldCents,
  oldFormatCurrency,
  oldJobMoney,
  oldPay,
  oldQuote,
  oldSplit,
  oldStillOwed,
  round2,
  type OldLine,
} from "./e2e/harness/legacy-money";

/**
 * The money layer moved from Float dollars to whole cents. This file is the proof that
 * the move did not shift a single number the desk had already seen.
 *
 * The Float-era arithmetic is copied in below, VERBATIM from commit 57beaca — the last
 * commit before the migration — with its own names kept (`round2`, `subtotal`, `total`).
 * Reading it out of the old commit at test time would tie the suite to git; carrying it
 * as a frozen reference means the comparison keeps working, and any later edit to it is
 * a visible change to what "the old behaviour" means.
 *
 * Both implementations are fed the SAME inputs — every awkward number the shop actually
 * types — and every printed string, CSV column and stored amount is compared.
 *
 * One difference is expected and is the point of the migration: a line whose amount
 * falls between two cents. The old code summed the raw products and rounded the total,
 * so the printed lines did not add up to the printed subtotal underneath them. The new
 * code rounds each line, so they do. Those cases are separated out below and the old
 * behaviour is shown failing its own paper.
 */

/* ------------------------------------------------------------------------- *
 * The Float era, frozen — see tests/e2e/harness/legacy-money.ts
 * ------------------------------------------------------------------------- */

/* ------------------------------------------------------------------------- *
 * The input set
 * ------------------------------------------------------------------------- */

/** Seeded so a failure is reproducible; the shop's numbers are not random to it. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1_664_525 + 1_013_904_223) >>> 0;
    return s / 4_294_967_296;
  };
}

const TAX_RATES = [0.13, 0.05, 0.14975, 0.15, 0];
const DEPOSIT_RATES = [0.25, 0.3, 0.5, 0.9, 0.33];

/**
 * Prices a contractor actually types: two decimals, including the ones that sit on a
 * half cent when a tax or a share is taken out of them.
 */
const AWKWARD_PRICES = [
  0.01, 0.05, 1.99, 4.35, 7.77, 9.95, 12.5, 19.99, 24.25, 33.33, 49.99, 62.5, 85.0, 99.95,
  120.75, 149.99, 242.5, 275.05, 380.4, 499.99, 750.0, 1_285.65, 2_400.0, 9_999.99,
];

const UNITS = ["hr", "ea", "sq ft", "day", "trip"];

type Case = { lines: OldLine[]; taxRate: number };

/** Lines whose amount lands exactly on a cent — integer quantities on two-decimal rates. */
function wholeCentCases(): Case[] {
  const next = rng(20_260_813);
  const cases: Case[] = [];
  for (let i = 0; i < 400; i++) {
    const count = 1 + Math.floor(next() * 8);
    const lines: OldLine[] = [];
    for (let l = 0; l < count; l++) {
      lines.push({
        description: `Line ${l + 1}`,
        unit: UNITS[Math.floor(next() * UNITS.length)],
        qty: 1 + Math.floor(next() * 40),
        unitPrice: AWKWARD_PRICES[Math.floor(next() * AWKWARD_PRICES.length)],
      });
    }
    cases.push({ lines, taxRate: TAX_RATES[i % TAX_RATES.length] });
  }
  return cases;
}

/** The same shape, but with a rate carrying a fraction of a cent per unit. */
function subCentCases(): Case[] {
  const next = rng(9_071_986);
  const rates = [1.855, 0.125, 2.005, 3.3333, 0.999];
  const cases: Case[] = [];
  for (let i = 0; i < 120; i++) {
    const count = 1 + Math.floor(next() * 5);
    const lines: OldLine[] = [];
    for (let l = 0; l < count; l++) {
      lines.push({
        description: `Line ${l + 1}`,
        unit: "sq ft",
        qty: 1 + Math.floor(next() * 2_000),
        unitPrice: rates[Math.floor(next() * rates.length)],
      });
    }
    cases.push({ lines, taxRate: 0.13 });
  }
  return cases;
}

const toNewLines = (lines: OldLine[]): LineItem[] =>
  lines.map((l) => ({ ...l, unitPriceCents: toCents(l.unitPrice) }));

const WHOLE = wholeCentCases();
const SUB = subCentCases();

/**
 * Is `cents × rate` EXACTLY half a cent? Answered in integers, because the whole point
 * is that a float cannot answer it: 999.50 × 15% is 149.925 on paper and
 * 149.92499999999998 in a register, so the old code rounded that one DOWN and the new
 * one rounds it up. Every rate in this codebase has at most five decimals.
 */
function isExactHalfCent(cents: number, rate: number) {
  const scaled = Math.round(rate * 1e5);
  return Math.abs((cents * scaled) % 1e5) === 50_000;
}

/**
 * The two implementations agree, or they land on opposite sides of an exact half cent.
 * That is the only gap between them and it is never wider than one cent — the new code
 * rounds a half away from zero on purpose, the old one rounded wherever the float dust
 * had already fallen. Returns true when the two answers differ, so callers can count.
 */
function agreesOrHalfCent(newCents: number, oldDollars: number, source: number, rate: number) {
  const gap = newCents - oldCents(oldDollars);
  if (gap === 0) return false;
  expect({ gap, halfCent: isExactHalfCent(source, rate) }).toEqual({ gap: 1, halfCent: true });
  return true;
}

/* ------------------------------------------------------------------------- *
 * Surface by surface
 * ------------------------------------------------------------------------- */

describe("estimate and invoice totals", () => {
  it("reaches the same subtotal on every one of them", () => {
    for (const { lines, taxRate } of WHOLE) {
      const before = oldQuote(lines, taxRate);
      const after = quoteTotals(toNewLines(lines), taxRate);
      expect(after.subtotalCents).toBe(oldCents(before.subtotal));
      expect(dollarText(after.subtotalCents)).toBe(before.subtotal.toFixed(2));
      expect(formatCents(after.subtotalCents)).toBe(oldFormatCurrency(before.subtotal));
      // taxRate is read only by the tax cases below; named here so the loop reads whole.
      expect(taxRate).toBeGreaterThanOrEqual(0);
    }
  });

  it("charges the same HST at 13% — the rate both live shops bill at", () => {
    // Ontario's rate never lands on an exact half cent: 13 × s ≡ 50 (mod 100) needs a
    // subtotal ending in .50, and 13% of any such amount is a whole cent already.
    // Swept below over every subtotal to $100,000 rather than argued.
    for (let c = 50; c <= 10_000_000; c += 100) {
      expect(quoteTotals([{ description: "", qty: 1, unit: "", unitPriceCents: c }], 0.13).taxCents)
        .toBe(oldCents(round2((c / 100) * 0.13)));
    }
  });

  it("charges the same tax at every other rate, bar an exact half cent", () => {
    let split = 0;
    for (const { lines, taxRate } of WHOLE) {
      const before = oldQuote(lines, taxRate);
      const after = quoteTotals(toNewLines(lines), taxRate);

      if (agreesOrHalfCent(after.taxCents, before.tax, after.subtotalCents, taxRate)) {
        split++;
        continue;
      }
      expect(after.totalCents).toBe(oldCents(before.total));
      expect(formatCents(after.taxCents)).toBe(oldFormatCurrency(before.tax));
      expect(formatCents(after.totalCents)).toBe(oldFormatCurrency(before.total));
      expect(dollarText(after.taxCents)).toBe(before.tax.toFixed(2));
      expect(dollarText(after.totalCents)).toBe(before.total.toFixed(2));
    }
    // $999.50 at 15% is the one in this set: $149.925, printed $149.92 then, $149.93 now.
    expect(split).toBe(1);
  });

  it("still bills the worked example from the audit: 242.50 + 31.53 = 274.03", () => {
    const lines = [{ description: "Move", unit: "hr", qty: 1, unitPrice: 242.5 }];
    const before = oldQuote(lines, 0.13);
    const after = quoteTotals(toNewLines(lines), 0.13);

    expect(before).toEqual({ subtotal: 242.5, tax: 31.53, total: 274.03 });
    expect(after).toEqual({ subtotalCents: 24_250, taxCents: 3_153, totalCents: 27_403 });
  });
});

describe("deposit split", () => {
  it("cuts 30/70 and its neighbours where the Float code cut them", () => {
    let split = 0;
    let checked = 0;

    for (const { lines, taxRate } of WHOLE) {
      for (const rate of DEPOSIT_RATES) {
        checked++;
        const before = oldSplit(lines, taxRate, rate);
        const whole = quoteTotals(toNewLines(lines), taxRate);

        const depositSubtotalCents = shareOfCents(whole.subtotalCents, rate);
        const depositTaxCents = shareOfCents(depositSubtotalCents, taxRate);
        const balanceSubtotalCents = whole.subtotalCents - depositSubtotalCents;
        const balanceTaxCents = whole.taxCents - depositTaxCents;

        // Either half of the cut can inherit the half-cent the whole quote already
        // moved, so the whole is checked first and the halves only where it held.
        const wholeMoved = whole.taxCents !== oldCents(oldQuote(lines, taxRate).tax);
        const moved =
          wholeMoved ||
          agreesOrHalfCent(depositSubtotalCents, before.deposit.subtotal, whole.subtotalCents, rate) ||
          depositTaxCents !== oldCents(before.deposit.tax);
        if (moved) split++;
        else {
          expect(depositTaxCents).toBe(oldCents(before.deposit.tax));
          expect(depositSubtotalCents + depositTaxCents).toBe(oldCents(before.deposit.total));
          expect(balanceSubtotalCents).toBe(oldCents(before.balance.subtotal));
          expect(balanceTaxCents).toBe(oldCents(before.balance.tax));
          expect(balanceSubtotalCents + balanceTaxCents).toBe(oldCents(before.balance.total));
        }

        // Whatever the cut, the property the audit bought with blood holds: the two
        // halves ARE the whole, so a cent moved into the deposit leaves the balance —
        // the client is never billed a cent more for choosing to pay in two.
        expect(
          depositSubtotalCents + depositTaxCents + balanceSubtotalCents + balanceTaxCents
        ).toBe(whole.totalCents);
        expect(depositSubtotalCents + balanceSubtotalCents).toBe(whole.subtotalCents);
      }
    }

    // A share of an exact half cent now goes to the deposit instead of the balance:
    // 38 of these 2000 cuts move a cent — 34 from the share itself, the rest inherited
    // from the one quote whose tax moved. One cent each, and never the client paying it.
    expect(split).toBe(38);
    expect(checked).toBe(2_000);
  });
});

describe("payment, partial and to the cent", () => {
  it("settles on the same instalment the Float code settled on", () => {
    for (const { lines, taxRate } of WHOLE.slice(0, 120)) {
      const before = oldQuote(lines, taxRate);
      const after = quoteTotals(toNewLines(lines), taxRate);
      if (after.totalCents <= 0) continue;

      // Three instalments: a third, another third, and whatever is left to the cent.
      const firstCents = shareOfCents(after.totalCents, 1 / 3);
      const secondCents = shareOfCents(after.totalCents, 1 / 3);
      const thirdCents = after.totalCents - firstCents - secondCents;

      const oldFirst = oldPay(before.total, [], firstCents / 100);
      const oldSecond = oldPay(before.total, [firstCents / 100], secondCents / 100);
      const oldThird = oldPay(
        before.total,
        [firstCents / 100, secondCents / 100],
        thirdCents / 100
      );

      const paidAfterFirst = firstCents;
      const paidAfterSecond = firstCents + secondCents;
      const paidAfterThird = after.totalCents;

      expect(paidAfterFirst >= after.totalCents).toBe(oldFirst.settled);
      expect(paidAfterSecond >= after.totalCents).toBe(oldSecond.settled);
      expect(paidAfterThird >= after.totalCents).toBe(oldThird.settled);
      expect(oldThird.settled).toBe(true);

      expect(after.totalCents - paidAfterSecond).toBe(oldCents(oldSecond.owing));
      expect(formatCents(after.totalCents - paidAfterSecond)).toBe(
        oldFormatCurrency(oldSecond.owing)
      );
    }
  });

  it("reads 'still owed' the same way at the boundary the old tolerance guarded", () => {
    // The Float code carried a half-cent tolerance because summed floats left dust.
    // Integers have none, so the two readings agree on every whole-cent balance.
    for (let owed = -50; owed <= 50; owed++) {
      const totalCents = 100_000;
      const paidCents = totalCents - owed;
      const inv = { status: "SENT", totalCents, amountPaidCents: paidCents, dueDate: "2026-01-01" };

      expect(owingCents(inv)).toBe(owed);
      expect(isOverdue(inv, new Date("2026-03-01T12:00:00"))).toBe(
        oldStillOwed(totalCents / 100, paidCents / 100)
      );
    }
  });
});

describe("job margin", () => {
  it("reports the same four numbers and the same verdict input", () => {
    const next = rng(4_815_162);
    for (let i = 0; i < 500; i++) {
      const pick = () => AWKWARD_PRICES[Math.floor(next() * AWKWARD_PRICES.length)];
      const oldJob = {
        estimates: [
          { total: pick(), status: "REJECTED" },
          { total: pick(), status: next() > 0.4 ? "ACCEPTED" : "DRAFT" },
        ],
        invoices: [
          { total: pick(), status: "SENT" },
          { total: pick(), status: next() > 0.5 ? "DRAFT" : "PAID" },
        ],
        payments: [{ amount: pick() }, { amount: pick() }],
        expenses: [{ amount: pick() }, { amount: pick() }, { amount: pick() }],
      };
      const newJob = {
        estimates: oldJob.estimates.map((e) => ({ totalCents: toCents(e.total), status: e.status })),
        invoices: oldJob.invoices.map((i) => ({ totalCents: toCents(i.total), status: i.status })),
        payments: oldJob.payments.map((p) => ({ amountCents: toCents(p.amount) })),
        expenses: oldJob.expenses.map((e) => ({ amountCents: toCents(e.amount) })),
      };

      const before = oldJobMoney(oldJob);
      const after = jobMoney(newJob);

      expect(after.quotedCents).toBe(oldCents(before.quoted));
      expect(after.invoicedCents).toBe(oldCents(before.invoiced));
      expect(after.collectedCents).toBe(oldCents(before.collected));
      expect(after.costsCents).toBe(oldCents(before.costs));
      expect(after.marginCents).toBe(oldCents(before.margin));
      expect(after.outstandingCents).toBe(oldCents(before.outstanding));
      expect(after.unbilledCents).toBe(oldCents(before.unbilled));

      // The percentage is the one number that was always a ratio; it must still round
      // to the same figure the CSV prints.
      expect(after.marginPct === null).toBe(before.marginPct === null);
      if (after.marginPct !== null && before.marginPct !== null) {
        expect(after.marginPct.toFixed(1)).toBe(before.marginPct.toFixed(1));
      }

      // And the CSV row itself, column by column.
      expect([
        dollarText(after.quotedCents),
        dollarText(after.invoicedCents),
        dollarText(after.collectedCents),
        dollarText(after.costsCents),
        dollarText(after.marginCents),
      ]).toEqual([
        before.quoted.toFixed(2),
        before.invoiced.toFixed(2),
        before.collected.toFixed(2),
        before.costs.toFixed(2),
        before.margin.toFixed(2),
      ]);
    }
  });

  it("sums a long float column without the drift that made the CSV disagree", () => {
    // Two hundred payments of $0.10 is exactly $20.00 to a bookkeeper. Floats say
    // 20.000000000000018, and the old CSV printed a total that its own column contradicted.
    const oldSum = Array.from({ length: 200 }, () => 0.1).reduce((s, a) => s + a, 0);
    const newSum = jobMoney({ payments: Array.from({ length: 200 }, () => ({ amountCents: 10 })) });

    expect(oldSum).not.toBe(20);
    expect(newSum.collectedCents).toBe(2_000);
    expect(dollarText(newSum.collectedCents)).toBe("20.00");
  });
});

describe("the printed page", () => {
  const sheet = (lines: OldLine[], taxRate: number, paidCents: number) => {
    const newLines = toNewLines(lines);
    const totals = quoteTotals(newLines, taxRate);
    return renderDocument({
      kind: "INVOICE",
      number: "INV-2026-0001",
      status: "SENT",
      businessName: "Korvex Developments",
      clientName: "Sarah Connor",
      jobTitle: "Kitchen renovation",
      lineItems: newLines,
      subtotalCents: totals.subtotalCents,
      taxCents: totals.taxCents,
      totalCents: totals.totalCents,
      amountPaidCents: paidCents,
      issuedAt: new Date("2026-08-12T12:00:00"),
      dueDate: new Date("2026-08-26T12:00:00"),
    });
  };

  it("carries the same money strings the Float renderer wrote", () => {
    for (const { lines, taxRate } of WHOLE.slice(0, 150)) {
      const before = oldQuote(lines, taxRate);
      const paidCents = shareOfCents(oldCents(before.total), 0.4);
      const html = sheet(lines, taxRate, paidCents);

      expect(html).toContain(oldFormatCurrency(before.subtotal));
      expect(html).toContain(oldFormatCurrency(before.tax));
      expect(html).toContain(oldFormatCurrency(before.total));
      // Paid and owing, as the old renderer derived them.
      expect(html).toContain(oldFormatCurrency(paidCents / 100));
      expect(html).toContain(oldFormatCurrency(round2(before.total - paidCents / 100)));

      for (const line of lines) {
        expect(html).toContain(oldFormatCurrency(line.unitPrice));
      }
    }
  });

  it("makes the printed lines add up to the printed subtotal", () => {
    for (const { lines, taxRate } of [...WHOLE.slice(0, 100), ...SUB]) {
      const newLines = toNewLines(lines);
      const totals = quoteTotals(newLines, taxRate);
      const printed = newLines.reduce((s, l) => s + lineTotalCents(l), 0);
      expect(printed).toBe(totals.subtotalCents);
    }
  });
});

/* ------------------------------------------------------------------------- *
 * The one difference, named
 * ------------------------------------------------------------------------- */

describe("where the answer changed on purpose", () => {
  it("rounds a rate carrying a fraction of a cent, and only there", () => {
    let differed = 0;

    for (const { lines, taxRate } of SUB) {
      const before = oldQuote(lines, taxRate);
      const after = quoteTotals(toNewLines(lines), taxRate);
      const gap = Math.abs(after.subtotalCents - oldCents(before.subtotal));
      if (gap > 0) differed++;

      // The whole gap is the rate being pulled to the cent it prints at: at most half
      // a cent per unit sold, plus the rounding at each end. Nothing else moved.
      const bound = lines.reduce((s, l) => s + l.qty * 0.5 + 0.5, 0.5);
      expect(gap).toBeLessThanOrEqual(Math.ceil(bound));
    }

    expect(differed).toBeGreaterThan(0);
  });

  it("shows the old paper contradicting itself on $1.855 a foot", () => {
    // 2000 ft at $1.855: the old sheet printed a rate of $1.86, a line of $3,710.00
    // and a subtotal of $3,710.00 — and $1.86 × 2000 is $3,720.00. Three numbers,
    // no way to get from any one of them to the next.
    const lines = [{ description: "Duct", unit: "sq ft", qty: 2_000, unitPrice: 1.855 }];
    const before = oldQuote(lines, 0.13);

    expect(oldFormatCurrency(lines[0].unitPrice)).toBe("$1.86");
    expect(before.subtotal).toBe(3_710);
    expect(oldCents(Number(oldFormatCurrency(1.855).slice(1)) * 2_000)).not.toBe(
      oldCents(before.subtotal)
    );

    const newLines = toNewLines(lines);
    const after = quoteTotals(newLines, 0.13);

    // The rate is stored at the cent it prints at, so the line and the column agree.
    expect(newLines[0].unitPriceCents).toBe(186);
    expect(lineTotalCents(newLines[0])).toBe(372_000);
    expect(after.subtotalCents).toBe(372_000);
    expect(formatCents(after.subtotalCents)).toBe("$3,720.00");

    // Named for what it is: the job got $10 more expensive because the rate the client
    // reads is now the rate the client is charged.
    expect(after.subtotalCents - oldCents(before.subtotal)).toBe(1_000);
  });
});
