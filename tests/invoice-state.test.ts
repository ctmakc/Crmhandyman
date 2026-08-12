import { describe, it, expect } from "vitest";
import {
  owingOf,
  isOverdue,
  daysOverdue,
  displayStatus,
  chaseStage,
} from "@/lib/invoice-state";

/**
 * Overdue is derived on every render, so a regression here does not corrupt data —
 * it silently changes who the shop chases and how hard. These tests pin the calendar
 * arithmetic (a DST shift must not move the escalation by a day) and the statuses
 * that can never be late.
 *
 * TZ is America/Toronto via vitest.config.ts; the March/November cases depend on it.
 */

const at = (y: number, m: number, d: number, h = 9) => new Date(y, m - 1, d, h);
const invoice = (over: Partial<Parameters<typeof isOverdue>[0]> = {}) => ({
  status: "SENT",
  total: 1000,
  amountPaid: 0,
  dueDate: at(2026, 8, 1),
  ...over,
});

describe("owingOf", () => {
  it("treats a missing amountPaid as nothing paid", () => {
    expect(owingOf({ status: "SENT", total: 500 })).toBe(500);
  });

  it("goes negative on an overpayment rather than clamping", () => {
    expect(owingOf({ status: "SENT", total: 500, amountPaid: 520 })).toBe(-20);
  });
});

describe("isOverdue", () => {
  it("flags a sent invoice past its due date", () => {
    expect(isOverdue(invoice(), at(2026, 8, 20))).toBe(true);
  });

  it("flags a partially paid invoice with a balance left", () => {
    expect(isOverdue(invoice({ status: "PARTIAL", amountPaid: 400 }), at(2026, 8, 20))).toBe(true);
  });

  it("stays quiet before the due date", () => {
    expect(isOverdue(invoice(), at(2026, 7, 20))).toBe(false);
  });

  it("never chases PAID or VOID paper, even with a past due date", () => {
    expect(isOverdue(invoice({ status: "PAID", amountPaid: 1000 }), at(2026, 9, 1))).toBe(false);
    // VOID with money still nominally owing is exactly the case a naive check gets wrong.
    expect(isOverdue(invoice({ status: "VOID", amountPaid: 0 }), at(2026, 9, 1))).toBe(false);
  });

  it("never chases a DRAFT the client has not seen", () => {
    expect(isOverdue(invoice({ status: "DRAFT" }), at(2026, 9, 1))).toBe(false);
  });

  it("stays quiet when there is no due date at all", () => {
    expect(isOverdue(invoice({ dueDate: null }), at(2027, 1, 1))).toBe(false);
  });

  it("ignores float dust but not a real cent", () => {
    // Summed Float payments leave fractions of a cent behind; chasing a client for
    // $0.004 is how a shop loses one.
    expect(isOverdue(invoice({ amountPaid: 999.996 }), at(2026, 8, 20))).toBe(false);
    expect(isOverdue(invoice({ amountPaid: 999.98 }), at(2026, 8, 20))).toBe(true);
  });

  it("accepts a date string, the shape an API response actually carries", () => {
    expect(isOverdue(invoice({ dueDate: "2026-08-01T00:00:00.000Z" }), at(2026, 8, 20))).toBe(true);
  });

  it("is not late on the day it falls due, and is late the morning after", () => {
    // The two readings share one calendar. While isOverdue compared instants, a bill
    // due today read "OVERDUE · 0D LATE" from 00:01, opened the chase lane at level 1
    // and sent the client a reminder saying it "was due today".
    const due = new Date(2026, 7, 11, 0, 0, 0);
    expect(isOverdue(invoice({ dueDate: due }), new Date(2026, 7, 11, 12))).toBe(false);
    expect(daysOverdue(invoice({ dueDate: due }), new Date(2026, 7, 11, 12))).toBe(0);

    expect(isOverdue(invoice({ dueDate: due }), new Date(2026, 7, 12, 9))).toBe(true);
    expect(daysOverdue(invoice({ dueDate: due }), new Date(2026, 7, 12, 9))).toBe(1);
  });
});

describe("daysOverdue", () => {
  it("counts whole days past the due date", () => {
    expect(daysOverdue(invoice(), at(2026, 8, 8))).toBe(7);
    expect(daysOverdue(invoice(), at(2026, 8, 15))).toBe(14);
    expect(daysOverdue(invoice(), at(2026, 8, 31))).toBe(30);
  });

  it("is 0 on the due date and negative before it", () => {
    expect(daysOverdue(invoice(), at(2026, 8, 1, 23))).toBe(0);
    expect(daysOverdue(invoice(), at(2026, 7, 25))).toBe(-7);
  });

  it("returns 0 when there is no due date", () => {
    expect(daysOverdue(invoice({ dueDate: null }), at(2027, 1, 1))).toBe(0);
  });

  it("ignores the time of day on both ends", () => {
    // An invoice due at 17:00 is one day late the next morning, not zero.
    const due = new Date(2026, 7, 1, 17, 30);
    expect(daysOverdue(invoice({ dueDate: due }), new Date(2026, 7, 2, 8, 0))).toBe(1);
  });

  it("does not lose a day across the spring-forward change", () => {
    // Raw milliseconds give 13.96 here; a floor would report 13 and hold the chase
    // at "Remind" on the day it should become "Call".
    const due = new Date(2026, 2, 1);
    expect(daysOverdue(invoice({ dueDate: due }), new Date(2026, 2, 15, 9))).toBe(14);
  });

  it("does not gain a day across the fall-back change", () => {
    const due = new Date(2026, 9, 20);
    expect(daysOverdue(invoice({ dueDate: due }), new Date(2026, 10, 3, 9))).toBe(14);
  });
});

describe("displayStatus", () => {
  it("overrides the stored status only while genuinely overdue", () => {
    expect(displayStatus(invoice(), at(2026, 8, 20))).toBe("OVERDUE");
    expect(displayStatus(invoice(), at(2026, 7, 20))).toBe("SENT");
    expect(displayStatus(invoice({ status: "PAID", amountPaid: 1000 }), at(2026, 9, 1))).toBe("PAID");
  });
});

describe("chaseStage", () => {
  it("says nothing about an invoice that is not overdue", () => {
    expect(chaseStage(invoice(), at(2026, 7, 20))).toBeNull();
    expect(chaseStage(invoice({ status: "PAID", amountPaid: 1000 }), at(2026, 9, 1))).toBeNull();
  });

  it("escalates on the 14 and 30 day boundaries, not a day early", () => {
    expect(chaseStage(invoice(), at(2026, 8, 8))?.level).toBe(1); // 7 days
    expect(chaseStage(invoice(), at(2026, 8, 14))?.level).toBe(1); // 13 days
    expect(chaseStage(invoice(), at(2026, 8, 15))?.level).toBe(2); // 14 days
    expect(chaseStage(invoice(), at(2026, 8, 30))?.level).toBe(2); // 29 days
    expect(chaseStage(invoice(), at(2026, 8, 31))?.level).toBe(3); // 30 days
  });

  it("labels the level a dispatcher reads on the lane", () => {
    expect(chaseStage(invoice(), at(2026, 8, 15))?.label).toBe("Call");
    expect(chaseStage(invoice(), at(2026, 8, 31))?.label).toBe("Escalate");
  });

  it("escalates on time across a DST change", () => {
    // Same window as the daysOverdue case: the shift must not delay the phone call.
    const due = new Date(2026, 2, 1);
    expect(chaseStage(invoice({ dueDate: due }), new Date(2026, 2, 15, 9))?.level).toBe(2);
  });
});
