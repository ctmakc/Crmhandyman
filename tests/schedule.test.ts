import { describe, it, expect } from "vitest";
import {
  DEFAULT_SLOT_MINUTES,
  conflictsFor,
  dayIndexOf,
  dayLoad,
  formatDuration,
  isCarried,
  intersectsWindow,
  lastDayOf,
  occupiesDay,
  overlaps,
  parseDuration,
  segmentsForDays,
  slotOf,
  spanDays,
  weekWindow,
} from "@/lib/schedule";

/**
 * The scheduling rules, stated as the two trades state them.
 *
 * Movers book hours of a named day; renovation crews book days. Load is counted off the
 * real assignment, and a collision is reported rather than refused — every case below is
 * one of those three sentences made checkable.
 */

const at = (day: string, time = "") => (time ? `${day}T${time}` : day);

const job = (over: Partial<Parameters<typeof slotOf>[0]> = {}) => ({
  id: "j1",
  scheduledDate: at("2026-08-17", "09:00"),
  durationMinutes: 120,
  assignedToId: "sam",
  status: "SCHEDULED",
  ...over,
});

describe("duration input", () => {
  it("treats blank, zero and nonsense as «nobody said»", () => {
    for (const raw of ["", null, undefined, 0, -30, "abc", NaN]) {
      expect(parseDuration(raw)).toBeNull();
    }
  });

  it("caps a run at the maximum span, so one job cannot swallow a year", () => {
    expect(parseDuration(60 * 24 * 400)).toBe(60 * 24 * 60);
  });

  it("prints hours for a mover and days for a renovation", () => {
    expect(formatDuration(120)).toBe("2 h");
    expect(formatDuration(480)).toBe("8 h");
    expect(formatDuration(1440)).toBe("1 day");
    expect(formatDuration(4320)).toBe("3 days");
    expect(formatDuration(null)).toBe("");
  });
});

describe("the slot a job holds", () => {
  it("gives a timed stop with no duration a real, collidable window", () => {
    const slot = slotOf(job({ durationMinutes: null }))!;
    expect(slot.endMs - slot.startMs).toBe(DEFAULT_SLOT_MINUTES * 60_000);
    expect(slot.allDay).toBe(false);
  });

  it("holds the whole calendar day when nobody named a time", () => {
    const slot = slotOf(job({ scheduledDate: at("2026-08-17"), durationMinutes: null }))!;
    expect(slot.allDay).toBe(true);
    expect(new Date(slot.startMs).getHours()).toBe(0);
    expect(new Date(slot.endMs).getDate()).toBe(18);
  });

  it("is nothing at all for a job that was never booked", () => {
    expect(slotOf(job({ scheduledDate: null }))).toBeNull();
    expect(spanDays(job({ scheduledDate: null }))).toBe(1);
  });
});

describe("a renovation measured in days", () => {
  const reno = job({ scheduledDate: at("2026-08-17"), durationMinutes: 4 * 24 * 60 });

  it("occupies every day of its run and none after it", () => {
    expect(spanDays(reno)).toBe(4);
    expect(occupiesDay(reno, "2026-08-17")).toBe(true);
    expect(occupiesDay(reno, "2026-08-20")).toBe(true);
    expect(occupiesDay(reno, "2026-08-21")).toBe(false);
    expect(lastDayOf(reno)).toBe("2026-08-20");
  });

  it("numbers the day of the run, which is what the crew is told", () => {
    expect(dayIndexOf(reno, "2026-08-17")).toBe(1);
    expect(dayIndexOf(reno, "2026-08-19")).toBe(3);
  });

  it("stays on the week board it is running in, even though it started before it", () => {
    // Sunday 2026-08-23 opens the week; the job started the Thursday before and runs 5 days.
    const running = job({ scheduledDate: at("2026-08-20"), durationMinutes: 5 * 24 * 60 });
    const { from, to } = weekWindow(new Date(2026, 7, 25));
    expect(intersectsWindow(running, from, to)).toBe(true);
    // Its own start date is not inside that window — filtering on start alone loses it.
    expect(new Date(running.scheduledDate!) < from).toBe(true);
  });

  it("draws as one bar across the days it holds, clipped to the week", () => {
    const days = Array.from({ length: 7 }, (_, i) => new Date(2026, 7, 23 + i)); // Sun 23 → Sat 29
    const [bar] = segmentsForDays(
      [job({ scheduledDate: at("2026-08-20"), durationMinutes: 5 * 24 * 60 })],
      days
    );
    expect(bar.start).toBe(0);
    expect(bar.span).toBe(2); // 20,21,22 fell in the previous week; 23 and 24 land here
    expect(bar.continuesBefore).toBe(true);
    expect(bar.continuesAfter).toBe(false);
  });

  it("stacks two overlapping runs on separate lanes instead of on top of each other", () => {
    const days = Array.from({ length: 7 }, (_, i) => new Date(2026, 7, 16 + i));
    const bars = segmentsForDays(
      [
        job({ id: "a", scheduledDate: at("2026-08-17"), durationMinutes: 3 * 24 * 60 }),
        job({ id: "b", scheduledDate: at("2026-08-18"), durationMinutes: 3 * 24 * 60 }),
        job({ id: "c", scheduledDate: at("2026-08-21"), durationMinutes: 2 * 24 * 60 }),
      ],
      days
    );
    expect(bars.map((b) => b.lane)).toEqual([0, 1, 0]);
  });
});

describe("two jobs on one man", () => {
  it("collides when the hours overlap", () => {
    const morning = job({ id: "a", scheduledDate: at("2026-08-17", "09:00"), durationMinutes: 180 });
    const middle = job({ id: "b", scheduledDate: at("2026-08-17", "10:00"), durationMinutes: 120 });
    expect(overlaps(morning, middle)).toBe(true);
    expect(conflictsFor(morning, [middle])).toHaveLength(1);
  });

  it("lets a mover run two short jobs back to back — touching is not colliding", () => {
    const first = job({ id: "a", scheduledDate: at("2026-08-17", "09:00"), durationMinutes: 120 });
    const second = job({ id: "b", scheduledDate: at("2026-08-17", "11:00"), durationMinutes: 120 });
    expect(overlaps(first, second)).toBe(false);
    expect(conflictsFor(first, [second])).toHaveLength(0);
  });

  it("does not collide across people, or with itself, or with cancelled work", () => {
    const mine = job({ id: "a", scheduledDate: at("2026-08-17", "09:00") });
    const his = job({ id: "b", scheduledDate: at("2026-08-17", "09:30"), assignedToId: "dave" });
    const dropped = job({ id: "c", scheduledDate: at("2026-08-17", "09:30"), status: "CANCELLED" });
    expect(conflictsFor(mine, [his, dropped, mine])).toHaveLength(0);
  });

  it("says nothing about an unassigned job — nobody is double-booked by it", () => {
    const loose = job({ id: "a", assignedToId: null });
    const held = job({ id: "b" });
    expect(conflictsFor(loose, [held])).toHaveLength(0);
  });

  it("counts a day-long booking against a timed one on the same day", () => {
    const allDay = job({ id: "a", scheduledDate: at("2026-08-17"), durationMinutes: null });
    const timed = job({ id: "b", scheduledDate: at("2026-08-17", "14:00") });
    expect(conflictsFor(allDay, [timed])).toHaveLength(1);
  });
});

describe("the day's load", () => {
  const day = "2026-08-17";
  const board = [
    job({ id: "a", scheduledDate: at(day, "08:00"), durationMinutes: 120, assignedToId: "sam" }),
    job({ id: "b", scheduledDate: at(day, "13:00"), durationMinutes: 120, assignedToId: "sam" }),
    job({ id: "c", scheduledDate: at(day, "13:30"), durationMinutes: 120, assignedToId: "dave" }),
    job({ id: "d", scheduledDate: at(day, "14:00"), durationMinutes: 120, assignedToId: "dave" }),
    job({ id: "e", scheduledDate: at(day, "09:00"), assignedToId: null }),
  ];
  const names = new Map([
    ["sam", "Sam Carter"],
    ["dave", "Dave Singh"],
  ]);

  it("counts jobs per person, not jobs per head-count", () => {
    const load = dayLoad(board, day, names);
    expect(load.total).toBe(5);
    expect(load.unassigned).toBe(1);
    expect(load.crew.map((p) => [p.name, p.count])).toEqual(
      expect.arrayContaining([
        ["Sam Carter", 2],
        ["Dave Singh", 2],
      ])
    );
  });

  it("flags only the man who is in two places at once", () => {
    const load = dayLoad(board, day, names);
    expect(load.clashes.map((p) => p.name)).toEqual(["Dave Singh"]);
    // Sam's two jobs are three hours apart — two stops is a working day, not an alarm.
    expect(load.crew.find((p) => p.name === "Sam Carter")!.clash).toBe(false);
  });

  it("keeps counting a multi-day job on every day it runs", () => {
    const reno = [job({ id: "r", scheduledDate: at("2026-08-17"), durationMinutes: 3 * 24 * 60 })];
    expect(dayLoad(reno, "2026-08-18").total).toBe(1);
    expect(dayLoad(reno, "2026-08-20").total).toBe(0);
  });
});

describe("carrying unfinished work forward", () => {
  const now = new Date(2026, 7, 19, 10, 0); // Wednesday morning

  it("carries a stop that was missed on an earlier day", () => {
    expect(isCarried(job({ scheduledDate: at("2026-08-17", "09:00") }), now)).toBe(true);
  });

  it("leaves a running multi-day job alone — day two of four was never missed", () => {
    const reno = job({ scheduledDate: at("2026-08-18"), durationMinutes: 4 * 24 * 60 });
    expect(isCarried(reno, now)).toBe(false);
    expect(dayIndexOf(reno, now)).toBe(2);
  });

  it("carries the same renovation once its last day is behind us", () => {
    const finished = job({ scheduledDate: at("2026-08-14"), durationMinutes: 3 * 24 * 60 });
    expect(isCarried(finished, now)).toBe(true);
  });

  it("never carries closed or cancelled work", () => {
    const done = job({ scheduledDate: at("2026-08-17"), status: "COMPLETED" });
    const dropped = job({ scheduledDate: at("2026-08-17"), status: "CANCELLED" });
    expect(isCarried(done, now)).toBe(false);
    expect(isCarried(dropped, now)).toBe(false);
  });
});
