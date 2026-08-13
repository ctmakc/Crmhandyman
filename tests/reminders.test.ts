import { describe, it, expect, afterEach, vi } from "vitest";
import { reminderCopy, sendReminder, smtpConfigured, type ReminderTarget } from "@/lib/reminders";
import { chaseStageForDays } from "@/lib/invoice-state";
import { toCents } from "@/lib/money";

/**
 * Chase copy. The stage is picked from `daysOverdue`, which the route computes with
 * invoice-state — so the boundaries here have to match the ones tested there, or the
 * lane says "Call" while the letter says "final notice".
 */

const target = (over: Partial<ReminderTarget> = {}): ReminderTarget => ({
  number: "INV-2026-0007",
  clientName: "Jane Doe",
  email: "jane@example.com",
  totalCents: toCents(1039.6),
  amountPaidCents: 0,
  dueDate: new Date(2026, 7, 1),
  daysOverdue: 7,
  businessName: "Korvex Developments",
  ...over,
});

describe("reminderCopy", () => {
  it("escalates on the same 7, 14 and 30 day boundaries as the chase lane", () => {
    expect(reminderCopy(target({ daysOverdue: 1 })).stage).toBe("notice");
    expect(reminderCopy(target({ daysOverdue: 6 })).stage).toBe("notice");
    expect(reminderCopy(target({ daysOverdue: 7 })).stage).toBe("nudge");
    expect(reminderCopy(target({ daysOverdue: 13 })).stage).toBe("nudge");
    expect(reminderCopy(target({ daysOverdue: 14 })).stage).toBe("call");
    expect(reminderCopy(target({ daysOverdue: 29 })).stage).toBe("call");
    expect(reminderCopy(target({ daysOverdue: 30 })).stage).toBe("final");
  });

  it("reads the same rung the lane shows, for every day of the first two months", () => {
    // One ladder, two readers. While the letter kept its own numbers, a lane showing
    // "Watch" could still put "you are overdue" in the client's inbox.
    for (let day = 1; day <= 60; day++) {
      expect(reminderCopy(target({ daysOverdue: day })).stage).toBe(chaseStageForDays(day)?.stage);
    }
  });

  it("keeps the first week free of the word overdue", () => {
    // Day three is a cheque in the post or an unopened inbox. A shop that writes
    // "overdue" then reads as a shop that expects to be cheated.
    for (const days of [1, 3, 6]) {
      const copy = reminderCopy(target({ daysOverdue: days }));
      expect(`${copy.subject} ${copy.body.join(" ")}`.toLowerCase()).not.toContain("overdue");
    }
    expect(reminderCopy(target({ daysOverdue: 7 })).body.join(" ")).toMatch(/reminder/i);
  });

  it("asks for what is still owed, not the original total", () => {
    // Chasing a client for the full amount a week after they paid half is how a shop
    // loses a repeat customer.
    const copy = reminderCopy(target({ amountPaidCents: toCents(500) }));
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

describe("sendReminder without an address", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("hands the invoice to the phone instead of stopping at 'no email on file'", async () => {
    // Both quiz landings collect a number and no address, so this is the ordinary path
    // for an advertising lead — the number has to come back with the answer, or the
    // dispatcher goes looking for it on another screen.
    const result = await sendReminder(target({ email: null, phone: "613-555-0134" }));
    expect(result.sent).toBe(false);
    expect(result.channel).toBe("phone");
    expect(result.reason).toBe("no email on file");
    expect(result.phone).toBe("613-555-0134");
    // The letter is still written: it is the script for the call.
    expect(result.body.join(" ")).toContain("$1,039.60");
  });

  it("reports an unconfigured transport as unsent on the email channel", async () => {
    vi.stubEnv("SMTP_HOST", "");
    vi.stubEnv("SMTP_USER", "");
    vi.stubEnv("SMTP_PASS", "");
    const result = await sendReminder(target());
    expect(result.sent).toBe(false);
    expect(result.channel).toBe("email");
    expect(result.reason).toBe("SMTP not configured");
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
