import { describe, it, expect } from "vitest";
import {
  composeMessage,
  dialable,
  isQuiet,
  minutesInZone,
  msUntilQuietEnds,
  parseClock,
  tokenHint,
  waitedText,
  type LeadLine,
  type NotificationSettings,
} from "@/lib/notify";
import { responseOf, waitRank, waitShort, STALE_MS } from "@/lib/lead-clock";
import { defangStamps, logStamp } from "@/lib/lead-notes";

/**
 * Lead alerts. Two things here are worth a test more than the rest:
 *
 *  · the quiet window almost always wraps midnight (21:00 → 07:30) and is read in the
 *    shop's zone, not the server's. Get either wrong and the alert either wakes a mover
 *    at 23:40 or never arrives at all;
 *  · the response clock is the number the owner is judged by, so it must never read
 *    early. Answering in an hour has to print as an hour.
 */

const settings = (over: Partial<NotificationSettings> = {}): NotificationSettings => ({
  isActive: true,
  email: "",
  telegramChatId: "123456789",
  telegramTokenHint: "",
  quietFrom: "21:00",
  quietTo: "07:30",
  timezone: "America/Toronto",
  lastSentAt: null,
  lastResult: "",
  lastDelivered: false,
  ...over,
});

/** A moment given in Toronto wall-clock terms, which is how the owner states them. */
const toronto = (month: number, day: number, hour: number, minute = 0) =>
  new Date(`2026-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00-04:00`);

describe("parseClock", () => {
  it("takes a time of day and refuses anything else", () => {
    expect(parseClock("00:00")).toBe(0);
    expect(parseClock("7:05")).toBe(425);
    expect(parseClock("21:30")).toBe(1290);
    expect(parseClock("23:59")).toBe(1439);
    for (const bad of ["", "24:00", "7", "07:60", "0730", "seven", "-1:00"]) {
      expect(parseClock(bad), bad).toBeNull();
    }
  });
});

describe("quiet hours", () => {
  it("reads the clock where the shop is, not where the server is", () => {
    // 02:00 UTC is 22:00 the previous evening in Ottawa.
    const at = new Date("2026-08-13T02:00:00Z");
    expect(minutesInZone(at, "America/Toronto")).toBe(22 * 60);
    expect(minutesInZone(at, "UTC")).toBe(2 * 60);
  });

  it("covers the night for a window that wraps midnight", () => {
    const s = settings();
    expect(isQuiet(toronto(8, 12, 23, 40), s)).toBe(true);
    expect(isQuiet(toronto(8, 13, 3, 0), s)).toBe(true);
    expect(isQuiet(toronto(8, 13, 7, 29), s)).toBe(true);
    expect(isQuiet(toronto(8, 13, 7, 30), s)).toBe(false);
    expect(isQuiet(toronto(8, 13, 14, 0), s)).toBe(false);
    expect(isQuiet(toronto(8, 13, 20, 59), s)).toBe(false);
    expect(isQuiet(toronto(8, 13, 21, 0), s)).toBe(true);
  });

  it("covers the middle of the day for a window that does not wrap", () => {
    const s = settings({ quietFrom: "12:00", quietTo: "13:00" });
    expect(isQuiet(toronto(8, 13, 12, 30), s)).toBe(true);
    expect(isQuiet(toronto(8, 13, 13, 0), s)).toBe(false);
    expect(isQuiet(toronto(8, 13, 2, 0), s)).toBe(false);
  });

  it("treats a missing or zero-length window as no quiet hours at all", () => {
    expect(isQuiet(toronto(8, 13, 3, 0), settings({ quietFrom: "", quietTo: "" }))).toBe(false);
    // Equal ends would otherwise silence the phone around the clock.
    expect(isQuiet(toronto(8, 13, 3, 0), settings({ quietFrom: "09:00", quietTo: "09:00" }))).toBe(false);
  });

  it("waits until the morning, never longer than the night", () => {
    const s = settings();
    const late = msUntilQuietEnds(toronto(8, 12, 23, 40), s);
    expect(late).toBeGreaterThan(7.8 * 3600_000);
    expect(late).toBeLessThan(8 * 3600_000);

    const dawn = msUntilQuietEnds(toronto(8, 13, 7, 29), s);
    expect(dawn).toBeGreaterThan(0);
    expect(dawn).toBeLessThan(2 * 60_000);
  });
});

describe("tokenHint", () => {
  it("proves a token is stored without handing any of it back", () => {
    const token = "8123456789:AAF-secret-material-nobody-else-may-read";
    const hint = tokenHint(token);
    expect(hint).toBe("••••read");
    expect(token.includes(hint.replace(/•/g, ""))).toBe(true);
    expect(hint.length).toBeLessThan(10);
    expect(tokenHint("")).toBe("");
    expect(tokenHint(null)).toBe("");
  });
});

describe("the message", () => {
  const shop = { businessName: "Korvex Developments", slug: "korvex", ownerEmail: "vlad@korvex.ca" };

  const lead = (over: Partial<LeadLine> = {}): LeadLine => ({
    id: "lead1234",
    name: "Sarah Connor",
    phone: "613-555-0100",
    email: "sarah@example.com",
    city: "Ottawa",
    jobType: "Kitchen renovation",
    source: "FACEBOOK",
    notes: "Korvex renovation quiz\n\nService: Kitchen\nTiming: ASAP\nBudget: 20-30k",
    createdAt: toronto(8, 13, 14, 32),
    ...over,
  });

  it("can be dialled from without opening the CRM", () => {
    const message = composeMessage(shop, [lead()], settings(), { now: toronto(8, 13, 14, 34) });

    expect(message.subject).toContain("Sarah Connor");
    // In international form, because that is the only shape Telegram turns into a tap
    // target. The landings send «613-555-0100»; without the country code the owner's
    // move was long press → copy → open dialler → paste, while a competitor dialled.
    expect(message.subject).toContain("+1 613 555 0100");
    // Name, number, what they want, where it came from, how long it has been waiting.
    expect(message.text).toContain("Sarah Connor");
    expect(message.text).toContain("+1 613 555 0100");
    expect(message.text).toContain("Kitchen renovation · Ottawa");
    expect(message.text).toContain("via FACEBOOK");
    expect(message.text).toContain("14:32");
    expect(message.text).toContain("2 min ago");
    // The quiz answers travel with it; the channel label already sits in the header.
    expect(message.text).toContain("Timing: ASAP");
    expect(message.text).not.toContain("Korvex renovation quiz\n");
  });

  it("says so out loud when there is no number to call", () => {
    const message = composeMessage(shop, [lead({ phone: null })], settings());
    expect(message.text).toContain("no phone given");
  });

  it("collects a burst into one message that still names every caller", () => {
    const leads = [
      lead({ id: "a", name: "First Caller", createdAt: toronto(8, 13, 22, 10) }),
      lead({ id: "b", name: "Second Caller", createdAt: toronto(8, 13, 23, 40) }),
      lead({ id: "c", name: "Third Caller", createdAt: toronto(8, 14, 6, 5) }),
    ];
    const message = composeMessage(shop, leads, settings(), {
      heldForQuietHours: true,
      now: toronto(8, 14, 7, 31),
    });

    expect(message.subject).toContain("3 new leads");
    expect(message.text).toContain("WHILE YOU SLEPT");
    for (const name of ["First Caller", "Second Caller", "Third Caller"]) {
      expect(message.text).toContain(name);
    }
    expect(message.text).toContain("22:10");
  });

  it("counts the tail instead of printing a hundred leads into a phone", () => {
    const leads = Array.from({ length: 30 }, (_, i) => lead({ id: `l${i}`, name: `Caller ${i}` }));
    const message = composeMessage(shop, leads, settings());
    expect(message.text).toContain("Caller 0");
    expect(message.text).toContain("Caller 11");
    expect(message.text).not.toContain("Caller 12");
    expect(message.text).toContain("…and 18 more waiting on the sheet.");
  });
});

describe("waitedText", () => {
  it("reads like a person saying it", () => {
    expect(waitedText(20_000)).toBe("just now");
    expect(waitedText(4 * 60_000)).toBe("4 min ago");
    expect(waitedText(125 * 60_000)).toBe("2 h 05 min ago");
    expect(waitedText(50 * 3600_000)).toBe("2 d 2 h ago");
  });
});

describe("the response clock", () => {
  const created = toronto(8, 13, 9, 0);
  const lead = (over: Record<string, unknown> = {}) => ({
    createdAt: created.toISOString(),
    status: "NEW",
    ...over,
  });

  it("keeps running while nobody has touched the lead", () => {
    const r = responseOf(lead(), created.getTime() + 42 * 60_000);
    expect(r.answered).toBe(false);
    expect(waitShort(r.ms)).toBe("42M");
  });

  it("stops when the lead leaves NEW", () => {
    const r = responseOf(
      lead({ status: "CONTACTED", updatedAt: new Date(created.getTime() + 12 * 60_000).toISOString() }),
      created.getTime() + 5 * 3600_000
    );
    expect(r.answered).toBe(true);
    expect(waitShort(r.ms)).toBe("12M");
  });

  it("prefers the stamped call over a later edit of the record", () => {
    // The dispatcher called at 09:07 and fixed a typo two days later. The clock has to
    // report the call, not the typo.
    const r = responseOf(
      lead({
        status: "CONTACTED",
        notes: "Quiz answers\n[13 AUG 09:07] no answer, callback Tuesday",
        updatedAt: new Date(created.getTime() + 48 * 3600_000).toISOString(),
      }),
      created.getTime() + 72 * 3600_000
    );
    expect(waitShort(r.ms)).toBe("7M");
  });

  it("counts a logged call as an answer even while the status still says NEW", () => {
    const r = responseOf(
      lead({
        notes: "[13 AUG 09:30] left a voicemail",
        updatedAt: new Date(created.getTime() + 30 * 60_000).toISOString(),
      }),
      created.getTime() + 10 * 3600_000
    );
    expect(r.answered).toBe(true);
    expect(waitShort(r.ms)).toBe("30M");
  });

  it("puts every unanswered lead above every answered one, longest wait on top", () => {
    const now = created.getTime() + 10 * 3600_000;
    const waitingLong = lead();
    const waitingShort = lead({ createdAt: new Date(now - 60_000).toISOString() });
    const answeredSlowly = lead({
      status: "VERIFIED",
      updatedAt: new Date(created.getTime() + 9 * 3600_000).toISOString(),
    });

    const sheet = [answeredSlowly, waitingShort, waitingLong].sort(
      (a, b) => waitRank(b, now) - waitRank(a, now)
    );
    expect(sheet).toEqual([waitingLong, waitingShort, answeredSlowly]);
  });
});

describe("dialable", () => {
  it("gives a bare ten-digit number its country code so a phone will dial it", () => {
    expect(dialable("613-555-0100")).toBe("+1 613 555 0100");
    expect(dialable("(613) 555 0100")).toBe("+1 613 555 0100");
    expect(dialable("16135550100")).toBe("+1 613 555 0100");
  });

  it("leaves a number it cannot read alone rather than guessing at it", () => {
    // Already international, a foreign format, an extension — a guess here is worse
    // than the customer's own writing.
    expect(dialable("+380 67 123 4567")).toBe("+380 67 123 4567");
    expect(dialable("613-555-0100 ext 22")).toBe("613-555-0100 ext 22");
    expect(dialable("")).toBe("");
    expect(dialable(null)).toBe("");
  });
});

describe("the call log stamp is the desk's, not the visitor's", () => {
  const created = new Date("2026-08-13T13:00:00.000Z");
  const lead = (over: Partial<Parameters<typeof responseOf>[0]> = {}) => ({
    createdAt: created.toISOString(),
    updatedAt: created.toISOString(),
    status: "NEW",
    notes: null,
    ...over,
  });

  it("ignores a stamp a visitor typed into a quiz answer", () => {
    // The exact shape that marked a brand-new lead answered in zero minutes and sank it
    // to the bottom of the sheet the shop calls from.
    const planted = lead({ notes: "Korvex quiz\n\nWhen: any morning [13 AUG 09:07] works" });
    const now = created.getTime() + 40 * 60_000;

    expect(responseOf(planted, now).answered).toBe(false);
    expect(waitRank(planted, now)).toBeGreaterThan(waitRank(lead({ status: "VERIFIED" }), now));
  });

  it("still reads the stamp the call-log form writes at the head of a line", () => {
    const logged = lead({
      notes: `Korvex quiz\n\nWhen: mornings\n[13 AUG 09:20] rang, left a message`,
      updatedAt: new Date(created.getTime() + 3 * 3600_000).toISOString(),
    });
    expect(responseOf(logged, created.getTime() + 5 * 3600_000).answered).toBe(true);
  });

  it("keeps the customer's words while taking the brackets off", () => {
    expect(defangStamps("any morning [13 AUG 09:07] works")).toBe("any morning (13 AUG 09:07) works");
    expect(defangStamps("no stamp here")).toBe("no stamp here");
  });

  it("writes a stamp the reader accepts", () => {
    const stamp = logStamp(new Date(2026, 7, 4, 14, 32));
    expect(stamp).toBe("[04 AUG 14:32]");

    const logged = {
      createdAt: new Date(2026, 7, 4, 14, 0).toISOString(),
      updatedAt: new Date(2026, 7, 4, 15, 0).toISOString(),
      status: "NEW",
      notes: `${stamp} spoke to him`,
    };
    expect(responseOf(logged, new Date(2026, 7, 4, 18, 0).getTime()).answered).toBe(true);
  });
});

describe("the call sheet points at today", () => {
  const now = Date.now();
  const waiting = (ageMs: number) => ({
    createdAt: new Date(now - ageMs).toISOString(),
    updatedAt: new Date(now - ageMs).toISOString(),
    status: "NEW",
    notes: null,
  });

  it("puts a fresh unanswered lead above one that has gone cold", () => {
    // Ordering purely by wait handed the top of the sheet to a four-month-old row for
    // good, and the morning's enquiry landed below the fold.
    const fresh = waiting(9 * 60_000);
    const ancient = waiting(129 * 24 * 3600_000);
    const sheet = [ancient, fresh].sort((a, b) => waitRank(b, now) - waitRank(a, now));
    expect(sheet).toEqual([fresh, ancient]);
  });

  it("keeps a cold unanswered lead above the ones already worked", () => {
    const ancient = waiting(129 * 24 * 3600_000);
    const worked = { ...waiting(60 * 60_000), status: "VERIFIED" };
    const sheet = [worked, ancient].sort((a, b) => waitRank(b, now) - waitRank(a, now));
    expect(sheet).toEqual([ancient, worked]);
  });

  it("orders the live band by how long each has waited", () => {
    const older = waiting(STALE_MS - 60_000);
    const newer = waiting(60_000);
    const sheet = [newer, older].sort((a, b) => waitRank(b, now) - waitRank(a, now));
    expect(sheet).toEqual([older, newer]);
  });
});
