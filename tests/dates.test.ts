import { describe, it, expect } from "vitest";
import { dayStamp, parseDayInput } from "@/lib/dates";

/**
 * The date every money row carries, on the way in and on the way out. The amount on
 * that row is guarded in tests/money.test.ts.
 *
 * Both readings were silently wrong at once: a payment typed as "the 1st" was stored as the
 * last evening of the previous month, and the export printed it in UTC, so the book,
 * the P&L and the accountant's CSV each disagreed with the screen the owner read.
 *
 * The suite runs pinned to America/Toronto (vitest.config.ts) — in UTC these
 * assertions would pass for the wrong reason.
 */

describe("parseDayInput", () => {
  it("reads a form's day as a local day, not as UTC midnight", () => {
    const d = parseDayInput("2026-08-01") as Date;
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(7);
    expect(d.getDate()).toBe(1);
    expect(d.getHours()).toBe(0);
  });

  it("keeps the first of the month inside that month", () => {
    // The whole point: new Date("2026-08-01") is July 31, 20:00 in Toronto, which put
    // the payment in the previous month's summary and the previous month's export.
    const august = new Date(2026, 7, 1);
    const septemberEve = new Date(2026, 7, 31, 23, 59, 59);
    const d = parseDayInput("2026-08-01") as Date;
    expect(d >= august && d <= septemberEve).toBe(true);
  });

  it("passes a full timestamp through as the instant it already is", () => {
    const iso = "2026-08-01T15:30:00.000Z";
    expect((parseDayInput(iso) as Date).toISOString()).toBe(iso);
  });

  it("returns undefined for blank and unusable input so callers can default", () => {
    expect(parseDayInput("")).toBeUndefined();
    expect(parseDayInput("   ")).toBeUndefined();
    expect(parseDayInput(undefined)).toBeUndefined();
    expect(parseDayInput(null)).toBeUndefined();
    expect(parseDayInput("not a date")).toBeUndefined();
    expect(parseDayInput(new Date("nope"))).toBeUndefined();
  });
});

describe("dayStamp", () => {
  it("prints the local day, so an evening entry stays on its own date", () => {
    // 21:00 in Toronto is already tomorrow in UTC — the UTC stamp moved evening cash
    // to the next day, and cash taken on the 31st to the next month.
    expect(dayStamp(new Date(2026, 7, 31, 21, 0))).toBe("2026-08-31");
    expect(dayStamp(new Date(2026, 7, 1, 0, 30))).toBe("2026-08-01");
  });

  it("survives a missing or broken date instead of printing 1970", () => {
    expect(dayStamp(null)).toBe("");
    expect(dayStamp(undefined)).toBe("");
    expect(dayStamp("not a date")).toBe("");
  });

  it("round-trips what parseDayInput accepted", () => {
    expect(dayStamp(parseDayInput("2026-03-08"))).toBe("2026-03-08");
  });
});
