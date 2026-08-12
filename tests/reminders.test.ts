import { describe, it, expect, afterEach, vi } from "vitest";
import { reminderCopy, smtpConfigured, type ReminderTarget } from "@/lib/reminders";

/**
 * Chase copy. The stage is picked from `daysOverdue`, which the route computes with
 * invoice-state — so the boundaries here have to match the ones tested there, or the
 * lane says "Call" while the letter says "final notice".
 */

const target = (over: Partial<ReminderTarget> = {}): ReminderTarget => ({
  number: "INV-2026-0007",
  clientName: "Jane Doe",
  email: "jane@example.com",
  total: 1039.6,
  amountPaid: 0,
  dueDate: new Date(2026, 7, 1),
  daysOverdue: 7,
  businessName: "Korvex Developments",
  ...over,
});

describe("reminderCopy", () => {
  it("escalates on the same 14 and 30 day boundaries as the chase lane", () => {
    expect(reminderCopy(target({ daysOverdue: 7 })).stage).toBe("nudge");
    expect(reminderCopy(target({ daysOverdue: 13 })).stage).toBe("nudge");
    expect(reminderCopy(target({ daysOverdue: 14 })).stage).toBe("call");
    expect(reminderCopy(target({ daysOverdue: 29 })).stage).toBe("call");
    expect(reminderCopy(target({ daysOverdue: 30 })).stage).toBe("final");
  });

  it("asks for what is still owed, not the original total", () => {
    // Chasing a client for the full amount a week after they paid half is how a shop
    // loses a repeat customer.
    const copy = reminderCopy(target({ amountPaid: 500 }));
    expect(copy.subject).toContain("$539.60");
    expect(copy.body.join(" ")).toContain("$539.60");
    expect(copy.body.join(" ")).not.toContain("$1,039.60");
  });

  it("names the due date the client saw on the invoice", () => {
    expect(reminderCopy(target()).body.join(" ")).toContain("2026-08-01");
  });

  it("says 'on receipt' when the invoice carried no due date", () => {
    expect(reminderCopy(target({ dueDate: null })).body.join(" ")).toContain("on receipt");
  });

  it("only the final notice mentions stopping work", () => {
    expect(reminderCopy(target({ daysOverdue: 13 })).body.join(" ")).not.toMatch(/paused/i);
    expect(reminderCopy(target({ daysOverdue: 30 })).body.join(" ")).toMatch(/paused further work/i);
  });

  it("signs every stage with the shop's name", () => {
    for (const days of [7, 14, 30]) {
      expect(reminderCopy(target({ daysOverdue: days })).body.at(-1)).toContain(
        "Korvex Developments"
      );
    }
  });
});

describe("smtpConfigured", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("is true only with host, user and password all present", () => {
    vi.stubEnv("SMTP_HOST", "smtp.example.com");
    vi.stubEnv("SMTP_USER", "desk@example.com");
    vi.stubEnv("SMTP_PASS", "secret");
    expect(smtpConfigured()).toBe(true);
  });

  it("fails closed when any part of the credential is missing", () => {
    // A half-configured transport must report "not sent" rather than throw at send
    // time — the desk shows the truth about the reminder either way.
    vi.stubEnv("SMTP_HOST", "smtp.example.com");
    vi.stubEnv("SMTP_USER", "desk@example.com");
    vi.stubEnv("SMTP_PASS", "");
    expect(smtpConfigured()).toBe(false);
  });
});
