import { describe, it, expect } from "vitest";
import {
  dollarText,
  formatCents,
  inCents,
  inDollars,
  lineItemsFromInput,
  lineItemsJsonInDollars,
  lineItemsToJson,
  lineTotalCents,
  parseCents,
  parseLineItems,
  parseTaxRate,
  DEFAULT_TAX_RATE,
  quoteTotals,
  shareOfCents,
  toCents,
  toDollars,
  type LineItem,
} from "@/lib/money";

/**
 * The cent discipline itself.
 *
 * Money is stored and added as whole cents; dollars exist at the edges only. These
 * tests pin the two things that decide whether that holds: the conversion at each
 * edge, and the arithmetic in between staying integer all the way through.
 */

describe("toCents", () => {
  it("scales dollars to whole cents", () => {
    expect(toCents(1234.5)).toBe(123_450);
    expect(toCents(0)).toBe(0);
    expect(toCents(242.5)).toBe(24_250);
  });

  it("survives amounts a float cannot hold", () => {
    // 1.005 is stored as 1.00499999999999989, so a naive Math.round(x * 100) says 100.
    // The paper says 1.01.
    expect(toCents(1.005)).toBe(101);
    expect(toCents(0.1 + 0.2)).toBe(30);
    expect(toCents(1695.0000000001)).toBe(169_500);
  });

  it("rounds a credit away from zero, like the amount it reverses", () => {
    expect(toCents(-1300)).toBe(-130_000);
    expect(toCents(-1.005)).toBe(-101);
  });

  it("never leaves a fraction of a cent behind", () => {
    for (const dollars of [0.001, 33.333, 274.025, 1e6 + 0.005]) {
      expect(Number.isInteger(toCents(dollars))).toBe(true);
    }
  });
});

describe("parseCents", () => {
  it("takes what a form actually posts", () => {
    expect(parseCents("242.50")).toBe(24_250);
    expect(parseCents(" 100 ")).toBe(10_000);
    expect(parseCents(100)).toBe(10_000);
  });

  it("answers null for anything that is not an amount, so the route can say 400", () => {
    for (const raw of ["", "  ", null, undefined, "abc", {}, NaN]) {
      expect(parseCents(raw)).toBeNull();
    }
  });
});

describe("formatCents and dollarText", () => {
  it("always prints two decimals with a thousands separator", () => {
    expect(formatCents(123_450)).toBe("$1,234.50");
    expect(formatCents(0)).toBe("$0.00");
    expect(formatCents(210_250)).toBe("$2,102.50");
  });

  it("prints a credit as negative — the deposit line on a balance invoice", () => {
    expect(formatCents(-130_000)).toBe("-$1,300.00");
  });

  it("gives the bookkeeper a bare number, still to the cent", () => {
    expect(dollarText(27_402)).toBe("274.02");
    expect(dollarText(-130_000)).toBe("-1300.00");
    expect(dollarText(5)).toBe("0.05");
  });
});

describe("quoteTotals", () => {
  const line = (qty: number, unitPriceCents: number): LineItem => ({
    description: "Line",
    qty,
    unit: "ea",
    unitPriceCents,
  });

  it("adds a thousand lines to exactly their own total", () => {
    // The reason the column moved to Int: a thousand stored amounts of $0.10 summed as
    // floats land on 99.99999999999986, and the sheet disagrees with its own lines.
    const lines = Array.from({ length: 1000 }, () => line(1, 10));
    const { subtotalCents, taxCents, totalCents } = quoteTotals(lines, 0.13);

    expect(subtotalCents).toBe(10_000);
    expect(subtotalCents).toBe(lines.reduce((s, l) => s + lineTotalCents(l), 0));
    expect(totalCents).toBe(subtotalCents + taxCents);
  });

  it("keeps a thousand awkward lines adding up, printed line by line", () => {
    // $1.855 a foot: the rate is stored as the cent it is billed at, so the amount on
    // each line and the subtotal under them come from the same number.
    const lines = Array.from({ length: 1000 }, (_, i) => line(i + 1, toCents(1.855)));
    const { subtotalCents } = quoteTotals(lines, 0.13);

    const printed = lines.reduce((s, l) => s + lineTotalCents(l), 0);
    expect(subtotalCents).toBe(printed);
    expect(Number.isInteger(subtotalCents)).toBe(true);
  });

  it("charges 13% on an odd number of cents, to the cent", () => {
    // 24 251 cents at 13% is 3152.63 cents — the half-cent question a Float column
    // used to answer differently depending on which screen asked.
    const odd = quoteTotals([line(1, 24_251)], 0.13);
    expect(odd.taxCents).toBe(3153);
    expect(odd.totalCents).toBe(27_404);

    // The invoice that started this: $242.50 at 13% billed 274.025 before.
    const known = quoteTotals([line(1, 24_250)], 0.13);
    expect(known.taxCents).toBe(3153);
    expect(known.totalCents).toBe(27_403);
    expect(formatCents(known.totalCents)).toBe("$274.03");
  });

  it("rounds a half cent away from zero, on both signs", () => {
    // 5 cents at 13% is exactly 0.65 of a cent up, 50 at 13% exactly 6.5.
    expect(quoteTotals([line(1, 50)], 0.13).taxCents).toBe(7);
    expect(quoteTotals([line(1, -50)], 0.13).taxCents).toBe(-7);
  });

  it("prices a fractional quantity to a whole cent", () => {
    const half = quoteTotals([line(1.5, 11_500)], 0);
    expect(half.subtotalCents).toBe(17_250);
    expect(Number.isInteger(half.subtotalCents)).toBe(true);
  });
});

describe("shareOfCents — the deposit split", () => {
  /** How the invoice route cuts a job in two: the balance takes what the deposit left. */
  const split = (totalCents: number, rate: number) => {
    const deposit = shareOfCents(totalCents, rate);
    return { deposit, balance: totalCents - deposit };
  };

  it("30 / 70 of an amount that does not divide evenly still adds up", () => {
    // $274.03 is the awkward one: 30% is 82.209 — no such coin.
    const { deposit, balance } = split(27_403, 0.3);
    expect(deposit).toBe(8221);
    expect(balance).toBe(19_182);
    expect(deposit + balance).toBe(27_403);
    expect(Number.isInteger(deposit) && Number.isInteger(balance)).toBe(true);
  });

  it("adds back up to the whole for every split the shop offers, on awkward money", () => {
    for (const totalCents of [27_403, 1, 3, 99_999, 12_345_67]) {
      for (const rate of [0.25, 0.3, 0.5]) {
        const { deposit, balance } = split(totalCents, rate);
        expect(deposit + balance).toBe(totalCents);
      }
    }
  });

  it("halves of one job cost the same as billing it whole", () => {
    const { subtotalCents, taxCents, totalCents } = quoteTotals(
      [{ description: "Tile", qty: 1, unit: "lot", unitPriceCents: 24_250 }],
      0.13
    );
    const depositSubtotal = shareOfCents(subtotalCents, 0.5);
    const depositTax = shareOfCents(depositSubtotal, 0.13);
    const balanceSubtotal = subtotalCents - depositSubtotal;
    const balanceTax = taxCents - depositTax;

    expect(depositSubtotal + depositTax + (balanceSubtotal + balanceTax)).toBe(totalCents);
  });
});

describe("crossing the API boundary", () => {
  it("serves dollars and takes them back as the same cents", () => {
    const stored = {
      number: "INV-2026-0007",
      subtotalCents: 24_250,
      taxCents: 3153,
      totalCents: 27_403,
      payments: [{ amountCents: 1 }, { amountCents: 27_402 }],
    };

    const served = inDollars(stored);
    expect(served.total).toBe(274.03);
    expect(served.payments[1].amount).toBe(274.02);
    expect("totalCents" in served).toBe(false);

    expect(inCents(served)).toEqual(stored);
  });

  it("does not lose a cent through JSON, which is how it actually travels", () => {
    const stored = { totalCents: 27_403, taxCents: 3153, amountCents: 1 };
    const overTheWire = JSON.parse(JSON.stringify(inDollars(stored)));
    expect(inCents(overTheWire)).toEqual(stored);
  });

  it("holds the cent through a round trip on every awkward amount", () => {
    for (let cents = -250; cents <= 250; cents++) {
      const trip = inCents(JSON.parse(JSON.stringify(inDollars({ amountCents: cents }))));
      expect(trip.amountCents).toBe(cents);
    }
    for (const cents of [1, 5, 33, 8221, 27_403, 99_999_99, 1_234_567_89]) {
      const trip = inCents(JSON.parse(JSON.stringify(inDollars({ amountCents: cents }))));
      expect(trip.amountCents).toBe(cents);
    }
  });

  it("leaves dates, strings and counts alone", () => {
    const issuedAt = new Date(2026, 7, 1);
    const served = inDollars({ number: "INV-1", reminderCount: 2, issuedAt, totalCents: 100 });
    expect(served.number).toBe("INV-1");
    expect(served.reminderCount).toBe(2);
    expect(served.issuedAt).toBe(issuedAt);
    expect(served.total).toBe(1);
  });

  it("keeps a missing amount missing instead of calling it zero", () => {
    // "Never quoted" and "quoted at nothing" are different answers on a job card.
    expect(inDollars({ quotedCents: null }).quoted).toBeNull();
  });

  it("converts at any depth, which is the shape a job payload actually has", () => {
    const served = inDollars({
      title: "Kitchen",
      invoices: [{ totalCents: 27_403, payments: [{ amountCents: 27_403 }] }],
      totals: { collectedCents: 27_403 },
    });
    expect(served.invoices[0].total).toBe(274.03);
    expect(served.invoices[0].payments[0].amount).toBe(274.03);
    expect(served.totals.collected).toBe(274.03);
  });
});

describe("line items", () => {
  const dollarLines = [
    { description: "Demolition", qty: 12, unit: "sq ft", unitPrice: 85 },
    { description: "Bin", qty: 1, unit: "ea", unitPrice: 480 },
  ];

  it("takes dollars from a form and stores cents", () => {
    const lines = lineItemsFromInput(dollarLines);
    expect(lines[0].unitPriceCents).toBe(8500);
    expect(JSON.parse(lineItemsToJson(lines))[1].unitPriceCents).toBe(48_000);
  });

  it("gives the same lines back in dollars for the API and the paper", () => {
    const json = lineItemsToJson(lineItemsFromInput(dollarLines));
    expect(JSON.parse(lineItemsJsonInDollars(json))).toEqual(dollarLines);
  });

  it("still reads a line written before the column moved to cents", () => {
    // Paper printed last month has to print today: a pre-migration row carries dollars.
    const legacy = JSON.stringify([{ description: "Tile", qty: 2, unit: "sq ft", unitPrice: 22.5 }]);
    expect(parseLineItems(legacy)[0].unitPriceCents).toBe(2250);
  });

  it("answers with no lines rather than throwing on a broken row", () => {
    expect(parseLineItems("not json")).toEqual([]);
    expect(parseLineItems('{"description":"lonely"}')).toEqual([]);
  });
});

describe("toDollars", () => {
  it("is the exact inverse of the door it came through", () => {
    for (const cents of [0, 1, 99, 100, 27_403, -130_000]) {
      expect(toCents(toDollars(cents))).toBe(cents);
    }
  });
});

describe("parseTaxRate", () => {
  /**
   * A contractor says «thirteen percent» out loud, and `13` is the shape that mistake
   * arrives in. It once put $1,300.00 of tax on $100.00 of work and the invoice went out
   * under a real number — the deposit share beside it had been clamped for months and
   * this one had nothing at all between the body and the ledger. The estimate screen is
   * a four-item select and could never produce it; the API is the door that could.
   */
  it("takes a fraction and refuses a percentage", () => {
    expect(parseTaxRate(0.13)).toBe(0.13);
    expect(parseTaxRate("0.14975")).toBe(0.14975);
    expect(parseTaxRate(0)).toBe(0);

    expect(parseTaxRate(13)).toBeNull();
    expect(parseTaxRate(1)).toBeNull();
    expect(parseTaxRate(-0.13)).toBeNull();
    expect(parseTaxRate("thirteen")).toBeNull();
    expect(parseTaxRate(NaN)).toBeNull();
  });

  it("treats a missing rate as the province's own", () => {
    expect(parseTaxRate(undefined)).toBe(DEFAULT_TAX_RATE);
    expect(parseTaxRate(null)).toBe(DEFAULT_TAX_RATE);
    expect(parseTaxRate("")).toBe(DEFAULT_TAX_RATE);
  });
});
