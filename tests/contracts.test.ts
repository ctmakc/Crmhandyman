import { describe, it, expect } from "vitest";
import {
  visitMonthsOf,
  cycleKey,
  nextDueVisit,
  daysUntil,
  CONTRACT_PLANS,
  type ContractLike,
} from "@/lib/contracts";

/**
 * Contract scheduling. The stakes are double-booking: "Book all due" is a button a
 * dispatcher presses twice, and every press that re-issues a cycle puts a second truck
 * on the same driveway.
 */

const contract = (over: Partial<ContractLike> = {}): ContractLike => ({
  id: "c1",
  visitMonths: "[4,10]",
  active: true,
  startedOn: new Date(2026, 0, 15),
  ...over,
});

describe("visitMonthsOf", () => {
  it("sorts the months so the schedule walks forward", () => {
    expect(visitMonthsOf({ visitMonths: "[10,4]" })).toEqual([4, 10]);
  });

  it("accepts the numeric strings a form actually posts", () => {
    expect(visitMonthsOf({ visitMonths: '["4","10"]' })).toEqual([4, 10]);
  });

  it("drops out-of-range and unparseable entries instead of scheduling month 0 or 13", () => {
    expect(visitMonthsOf({ visitMonths: '[0,13,"abc",null,5]' })).toEqual([5]);
  });

  it("survives malformed data rather than taking down the deck", () => {
    expect(visitMonthsOf({ visitMonths: "not json" })).toEqual([]);
    expect(visitMonthsOf({ visitMonths: '{"spring":4}' })).toEqual([]);
  });
});

describe("cycleKey", () => {
  it("pads the month so keys sort chronologically as strings", () => {
    expect(cycleKey(2026, 4)).toBe("2026-04");
    expect(cycleKey(2026, 12)).toBe("2026-12");
  });
});

describe("nextDueVisit", () => {
  it("finds the next visit month from today", () => {
    const next = nextDueVisit(contract(), new Set(), new Date(2026, 1, 15));
    expect(next?.cycle).toBe("2026-04");
    expect(next?.month).toBe(4);
    expect(next?.date.getFullYear()).toBe(2026);
  });

  it("returns the current month while it is still open", () => {
    const next = nextDueVisit(contract(), new Set(), new Date(2026, 3, 22));
    expect(next?.cycle).toBe("2026-04");
  });

  it("skips a cycle that is already on the board", () => {
    const next = nextDueVisit(contract(), new Set(["2026-04"]), new Date(2026, 1, 15));
    expect(next?.cycle).toBe("2026-10");
  });

  it("never hands out the same cycle twice as visits get booked", () => {
    // This is the "press Book all due twice" path. Each booked cycle must move the
    // contract forward, never repeat.
    const booked = new Set<string>();
    const cycles: string[] = [];
    for (let i = 0; i < 3; i++) {
      const next = nextDueVisit(contract(), booked, new Date(2026, 1, 15));
      expect(next).not.toBeNull();
      cycles.push(next!.cycle);
      booked.add(next!.cycle);
    }
    expect(cycles).toEqual(["2026-04", "2026-10", "2027-04"]);
    expect(new Set(cycles).size).toBe(3);
  });

  it("is idempotent while nothing has been booked", () => {
    const now = new Date(2026, 1, 15);
    const a = nextDueVisit(contract(), new Set(), now);
    const b = nextDueVisit(contract(), new Set(), now);
    expect(a?.cycle).toBe(b?.cycle);
    expect(a?.date.getTime()).toBe(b?.date.getTime());
  });

  it("rolls an annual contract to next year once this year is booked", () => {
    const annual = contract({ visitMonths: "[9]" });
    const next = nextDueVisit(annual, new Set(["2026-09"]), new Date(2026, 8, 3));
    expect(next?.cycle).toBe("2027-09");
  });

  it("does not skip December on an annual December plan", () => {
    // The 18-month lookahead has to clear the year boundary, or a December contract
    // silently reports "nothing due" for the rest of its life.
    const december = contract({ visitMonths: "[12]" });
    expect(nextDueVisit(december, new Set(["2026-12"]), new Date(2026, 11, 10))?.cycle).toBe(
      "2027-12"
    );
    // Standing in January, the next December is this year's, not last year's.
    expect(nextDueVisit(december, new Set(["2026-12"]), new Date(2027, 0, 8))?.cycle).toBe(
      "2027-12"
    );
  });

  it("walks a quarterly plan to the nearest quarter, not the first one listed", () => {
    const quarterly = contract({ visitMonths: "[1,4,7,10]" });
    expect(nextDueVisit(quarterly, new Set(), new Date(2026, 7, 20))?.cycle).toBe("2026-10");
  });

  it("never books a visit before the contract started", () => {
    const late = contract({ startedOn: new Date(2026, 5, 1) });
    expect(nextDueVisit(late, new Set(), new Date(2026, 1, 15))?.cycle).toBe("2026-10");
  });

  it("stays silent for a cancelled contract or one with no visit months", () => {
    expect(nextDueVisit(contract({ active: false }), new Set(), new Date(2026, 1, 15))).toBeNull();
    expect(nextDueVisit(contract({ visitMonths: "[]" }), new Set(), new Date(2026, 1, 15))).toBeNull();
  });

  it("stops at the 18-month horizon instead of booking years ahead", () => {
    const annual = contract({ visitMonths: "[12]" });
    const booked = new Set(["2026-12", "2027-12"]);
    expect(nextDueVisit(annual, booked, new Date(2027, 0, 8))).toBeNull();
  });
});

describe("daysUntil", () => {
  it("counts calendar days, negative once the shop is late", () => {
    expect(daysUntil(new Date(2026, 3, 1), new Date(2026, 2, 20))).toBe(12);
    expect(daysUntil(new Date(2026, 3, 1), new Date(2026, 3, 1, 18))).toBe(0);
    expect(daysUntil(new Date(2026, 3, 1), new Date(2026, 3, 10))).toBe(-9);
  });

  it("does not lose a day across a DST change", () => {
    // The booking window (`daysUntil(next.date) > withinDays`) is compared against a
    // 45-day default; an off-by-one at the edge drops a visit off the run.
    expect(daysUntil(new Date(2026, 2, 15), new Date(2026, 2, 1))).toBe(14);
    expect(daysUntil(new Date(2026, 10, 3), new Date(2026, 9, 20))).toBe(14);
  });
});

describe("CONTRACT_PLANS", () => {
  it("ships months the scheduler can actually parse", () => {
    for (const plan of CONTRACT_PLANS) {
      const parsed = visitMonthsOf({ visitMonths: JSON.stringify(plan.months) });
      expect(parsed).toEqual([...plan.months].sort((a, b) => a - b));
      expect(parsed.length).toBe(plan.months.length);
    }
  });
});
