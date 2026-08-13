import { describe, it, expect } from "vitest";
import { toCents } from "@/lib/money";
import {
  owingCents,
  isOverdue,
  daysOverdue,
  displayStatus,
  chaseStage,
  chaseStageForDays,
  sameCalendarDay,
  CHASE_DAYS,
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
  totalCents: toCents(1000),
  amountPaidCents: 0,
  dueDate: at(2026, 8, 1),
  ...over,
});

describe("owingCents", () => {
  it("treats a missing amountPaidCents as nothing paid", () => {
    expect(owingCents({ status: "SENT", totalCents: toCents(500) })).toBe(toCents(500));
  });

  it("goes negative on an overpayment rather than clamping", () => {
    expect(
      owingCents({ status: "SENT", totalCents: toCents(500), amountPaidCents: toCents(520) })
    ).toBe(toCents(-20));
  });
});

describe("isOverdue", () => {
  it("flags a sent invoice past its due date", () => {
    expect(isOverdue(invoice(), at(2026, 8, 20))).toBe(true);
  });

  it("flags a partially paid invoice with a balance left", () => {
    expect(isOverdue(invoice({ status: "PARTIAL", amountPaidCents: toCents(400) }), at(2026, 8, 20))).toBe(true);
  });

  it("stays quiet before the due date", () => {
    expect(isOverdue(invoice(), at(2026, 7, 20))).toBe(false);
  });

  it("never chases PAID or VOID paper, even with a past due date", () => {
    expect(isOverdue(invoice({ status: "PAID", amountPaidCents: toCents(1000) }), at(2026, 9, 1))).toBe(false);
    // VOID with money still nominally owing is exactly the case a naive check gets wrong.
    expect(isOverdue(invoice({ status: "VOID", amountPaidCents: toCents(0) }), at(2026, 9, 1))).toBe(false);
  });

  it("never chases a DRAFT the client has not seen", () => {
    expect(isOverdue(invoice({ status: "DRAFT" }), at(2026, 9, 1))).toBe(false);
  });

  it("stays quiet when there is no due date at all", () => {
    expect(isOverdue(invoice({ dueDate: null }), at(2027, 1, 1))).toBe(false);
  });

  it("settles on the last cent and chases the one before it", () => {
    // Summed Float payments used to leave fractions of a cent behind, and a shop
    // chasing a client for $0.004 loses the client. Integers cannot leave dust.
    expect(isOverdue(invoice({ amountPaidCents: toCents(1000) }), at(2026, 8, 20))).toBe(false);
    expect(isOverdue(invoice({ amountPaidCents: toCents(999.99) }), at(2026, 8, 20))).toBe(true);
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
    expect(displayStatus(invoice({ status: "PAID", amountPaidCents: toCents(1000) }), at(2026, 9, 1))).toBe("PAID");
  });
});

describe("chaseStage", () => {
  it("says nothing about an invoice that is not overdue", () => {
    expect(chaseStage(invoice(), at(2026, 7, 20))).toBeNull();
    expect(chaseStage(invoice({ status: "PAID", amountPaidCents: toCents(1000) }), at(2026, 9, 1))).toBeNull();
  });

  it("holds the whole first week at level 0 — visible on the lane, not chased", () => {
    // ROADMAP 4.3 promised the soft ping on day seven, and the code opened the chase on
    // day one: a client whose cheque was in the post got "you are overdue" the morning
    // after the due date. Days 1 to 6 now carry the invoice without pressure.
    for (const day of [2, 3, 4, 5, 6, 7]) {
      expect(chaseStage(invoice(), at(2026, 8, day))?.level).toBe(0);
    }
    expect(chaseStage(invoice(), at(2026, 8, 2))?.label).toBe("Watch");
  });

  it("escalates on the 7, 14 and 30 day boundaries, not a day early", () => {
    expect(chaseStage(invoice(), at(2026, 8, 7))?.level).toBe(0); // 6 days
    expect(chaseStage(invoice(), at(2026, 8, 8))?.level).toBe(1); // 7 days
    expect(chaseStage(invoice(), at(2026, 8, 14))?.level).toBe(1); // 13 days
    expect(chaseStage(invoice(), at(2026, 8, 15))?.level).toBe(2); // 14 days
    expect(chaseStage(invoice(), at(2026, 8, 30))?.level).toBe(2); // 29 days
    expect(chaseStage(invoice(), at(2026, 8, 31))?.level).toBe(3); // 30 days
  });

  it("labels the level a dispatcher reads on the lane", () => {
    expect(chaseStage(invoice(), at(2026, 8, 8))?.label).toBe("Remind");
    expect(chaseStage(invoice(), at(2026, 8, 15))?.label).toBe("Call");
    expect(chaseStage(invoice(), at(2026, 8, 31))?.label).toBe("Escalate");
  });

  it("escalates on time across a DST change", () => {
    // Same window as the daysOverdue case: the shift must not delay the phone call.
    const due = new Date(2026, 2, 1);
    expect(chaseStage(invoice({ dueDate: due }), new Date(2026, 2, 15, 9))?.level).toBe(2);
  });

  it("keeps one ladder for the lane and the letter", () => {
    // The stage id travels to lib/reminders, which picks the copy from the same
    // thresholds. Two tables meant the lane could say "Call" over a polite nudge.
    expect(chaseStageForDays(0)).toBeNull();
    expect(chaseStageForDays(CHASE_DAYS.watch)?.stage).toBe("notice");
    expect(chaseStageForDays(CHASE_DAYS.nudge)?.stage).toBe("nudge");
    expect(chaseStageForDays(CHASE_DAYS.call)?.stage).toBe("call");
    expect(chaseStageForDays(CHASE_DAYS.final)?.stage).toBe("final");
    expect(chaseStageForDays(400)?.stage).toBe("final");
  });
});

describe("sameCalendarDay", () => {
  // The guard against chasing one client twice in a day reads this, so a reminder sent
  // at 23:50 must still count as "today" at 00:10 only on ITS day, not the next one.
  it("is true for two moments of one local day and false across midnight", () => {
    expect(sameCalendarDay(new Date(2026, 7, 12, 23, 50), new Date(2026, 7, 12, 0, 5))).toBe(true);
    expect(sameCalendarDay(new Date(2026, 7, 12, 23, 50), new Date(2026, 7, 13, 0, 5))).toBe(false);
  });

  it("accepts the string an API response carries, and treats nothing as never", () => {
    expect(sameCalendarDay(new Date(2026, 7, 12, 9).toISOString(), new Date(2026, 7, 12, 18))).toBe(true);
    expect(sameCalendarDay(null, new Date(2026, 7, 12))).toBe(false);
    expect(sameCalendarDay(undefined, new Date(2026, 7, 12))).toBe(false);
  });
});
