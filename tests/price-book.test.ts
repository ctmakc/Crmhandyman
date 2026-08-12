import { describe, it, expect } from "vitest";
import { crewFor, baseHoursFor, quoteMove, PRICE_ITEMS, JOB_TEMPLATES } from "@/lib/price-book";

/**
 * The moving calculator is the quote a mover gives on the phone. Wrong crew size or
 * wrong hours is a job sold below cost — the estimate goes out in two clicks and
 * nobody re-checks the arithmetic.
 */

const priceOf = (description: string) =>
  PRICE_ITEMS.find((i) => i.description === description)?.unitPrice;

const lineTotal = (items: ReturnType<typeof quoteMove>) =>
  items.reduce((s, i) => s + i.qty * i.unitPrice, 0);

describe("crewFor", () => {
  it("steps the crew at 1 and 3 bedrooms", () => {
    expect(crewFor(0)).toMatchObject({ size: 2, truck: "20ft" });
    expect(crewFor(1)).toMatchObject({ size: 2, truck: "20ft", rate: 135 });
    expect(crewFor(2)).toMatchObject({ size: 3, truck: "26ft", rate: 165 });
    expect(crewFor(3)).toMatchObject({ size: 3, truck: "26ft", rate: 165 });
    expect(crewFor(4)).toMatchObject({ size: 4, truck: "26ft", rate: 205 });
    expect(crewFor(6)).toMatchObject({ size: 4, rate: 205 });
  });

  it("charges the rate the price book publishes for that crew", () => {
    // The calculator hard-codes 135/165/205; a price change in PRICE_ITEMS alone
    // would quote one number on the line picker and another in the calculator.
    expect(crewFor(1).rate).toBe(priceOf("Crew of 2 + 20ft truck"));
    expect(crewFor(3).rate).toBe(priceOf("Crew of 3 + 26ft truck"));
    expect(crewFor(4).rate).toBe(priceOf("Crew of 4 + 26ft truck"));
  });
});

describe("baseHoursFor", () => {
  it("scales at 2.5 hours a bedroom plus an hour of setup", () => {
    expect(baseHoursFor(1)).toBe(4);
    expect(baseHoursFor(2)).toBe(6);
    expect(baseHoursFor(3)).toBe(9);
    expect(baseHoursFor(5)).toBe(14);
  });

  it("never quotes a move under the 3-hour minimum", () => {
    // A studio still costs a crew half a day of dispatch.
    expect(baseHoursFor(0)).toBe(3);
  });
});

describe("quoteMove", () => {
  const quote = quoteMove({ bedrooms: 3, flights: 2, travelHours: 1.5, packing: true });

  it("puts a 3-bedroom move on a crew of 3 for 9 hours", () => {
    expect(quote[0]).toEqual({
      description: "Crew of 3 + 26ft truck",
      qty: 9,
      unit: "hr",
      unitPrice: 165,
    });
  });

  it("bills travel at the crew rate, not the price-book default", () => {
    // Travel is the same three people sitting in the same truck; charging the 2-man
    // list rate of 135 for a 3-man crew loses money on every long haul.
    const travel = quote.find((i) => i.description.startsWith("Travel time"));
    expect(travel).toMatchObject({ qty: 1.5, unitPrice: 165 });
  });

  it("charges stairs per flight at the published surcharge", () => {
    const stairs = quote.find((i) => i.description.startsWith("Stair carry"));
    expect(stairs).toMatchObject({ qty: 2, unitPrice: 45 });
    expect(stairs?.unitPrice).toBe(priceOf("Stair carry surcharge (per flight)"));
  });

  it("scales packing kits with the home, one per two bedrooms", () => {
    const kit = quote.find((i) => i.description.startsWith("Packing materials"));
    expect(kit).toMatchObject({ qty: 2, unitPrice: 140 });
    expect(quoteMove({ bedrooms: 1, flights: 0, travelHours: 0, packing: true }).at(-1)).toMatchObject({
      qty: 1,
    });
  });

  it("adds up to the price quoted on the phone", () => {
    // 9×165 + 1.5×165 + 2×45 + 2×140
    expect(lineTotal(quote)).toBeCloseTo(2102.5, 2);
  });

  it("leaves out lines the customer did not ask for", () => {
    // A zero-qty "Stair carry" line on a quote reads as a charge and starts an argument.
    const bare = quoteMove({ bedrooms: 2, flights: 0, travelHours: 0, packing: false });
    expect(bare).toHaveLength(1);
    expect(bare[0]).toMatchObject({ description: "Crew of 3 + 26ft truck", qty: 6 });
  });

  it("quotes a studio as a 2-man crew at the 3-hour floor", () => {
    const studio = quoteMove({ bedrooms: 0, flights: 0, travelHours: 2, packing: false });
    expect(studio[0]).toMatchObject({ qty: 3, unitPrice: 135 });
    expect(studio[1]).toMatchObject({ description: "Travel time (yard to yard)", unitPrice: 135 });
    expect(lineTotal(studio)).toBe(675);
  });
});

describe("JOB_TEMPLATES", () => {
  it("keeps ids unique — the picker selects by id", () => {
    const ids = JOB_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("ships no template that would total zero or negative", () => {
    for (const t of JOB_TEMPLATES) {
      const total = t.lineItems.reduce((s, i) => s + i.qty * i.unitPrice, 0);
      expect(total).toBeGreaterThan(0);
      for (const item of t.lineItems) {
        expect(item.qty).toBeGreaterThanOrEqual(0);
        expect(item.unitPrice).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
