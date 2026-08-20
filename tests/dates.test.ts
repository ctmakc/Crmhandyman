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

/**
 * The day rail builds its seven columns from a server-decided week-start STAMP and lights
 * today from a server-decided today STAMP, instead of reading `new Date()` while it
 * renders. This is the exact pure math the component runs — a bare calendar stamp carries
 * no instant, so the same seven days and the same lit column come out on the UTC server
 * and in the Toronto browser, which is what stopped React #423 from discarding the first
 * paint and the amber glow from landing a day off.
 */
describe("the day rail rebuilds its week off a server stamp", () => {
  const weekFrom = (weekStartStamp: string) => {
    const start = parseDayInput(weekStartStamp) as Date;
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  };

  it("lays out seven consecutive local days from the Sunday stamp", () => {
    expect(weekFrom("2026-08-16").map(dayStamp)).toEqual([
      "2026-08-16",
      "2026-08-17",
      "2026-08-18",
      "2026-08-19",
      "2026-08-20",
      "2026-08-21",
      "2026-08-22",
    ]);
  });

  it("lights exactly the column whose stamp equals the server's today", () => {
    // The bug: near midnight ET the box (UTC) said one day and the browser (Toronto)
    // another, so the lit column disagreed between the two renders. Handed one stamp,
    // findIndex is unambiguous — one match inside the week, none outside it.
    const days = weekFrom("2026-08-16");
    const lit = (todayKey: string) => days.findIndex((d) => dayStamp(d) === todayKey);
    expect(lit("2026-08-20")).toBe(4);
    expect(lit("2026-08-16")).toBe(0);
    expect(lit("2026-08-23")).toBe(-1); // next week — nothing lit, no false Sunday glow
  });

  it("crosses a DST boundary without dropping or doubling a day", () => {
    // Toronto springs forward on 2026-03-08. Walking the week with setDate (not a fixed
    // 24h step) keeps seven distinct calendar days across the 23-hour night.
    expect(weekFrom("2026-03-08").map(dayStamp)).toEqual([
      "2026-03-08",
      "2026-03-09",
      "2026-03-10",
      "2026-03-11",
      "2026-03-12",
      "2026-03-13",
      "2026-03-14",
    ]);
  });
});
