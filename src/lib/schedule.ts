/**
 * The day, as the dispatcher actually books it.
 *
 * Load used to be «jobs ÷ heads»: four jobs and two workers read `4/2 OVER`, whether
 * both jobs sat on the same man or nobody was assigned at all. That number cannot be
 * acted on — it never names who is double-booked, and it goes red on a day where the
 * crew is perfectly free. Load here is counted off the REAL assignment: how many jobs
 * hang on one person on one day, and whether any two of them collide in time.
 *
 * Two trades measure a job with different rulers, and both live in this file:
 *
 *   MOVING      a stop takes HOURS of a named day — 09:00, three hours, then the next one
 *   RENOVATION  a job takes DAYS — one address occupied Monday through Thursday
 *
 * So a job carries `durationMinutes`, one unit for both: hours for a mover, whole days
 * for a renovation. A job whose start has no clock on it (midnight — what `<input
 * type="date">` posts, and what every contract visit gets) is an ALL-DAY job: it holds
 * the whole calendar day, because nobody said when in it.
 *
 * Nothing here touches Prisma or React. The board warns before saving with the same
 * functions the route re-checks with afterwards, so the two answers cannot drift.
 */

import { dayStamp, parseDayInput } from "@/lib/dates";

/** A timed stop with no duration on it. Short enough to be honest, long enough to collide. */
export const DEFAULT_SLOT_MINUTES = 120;

export const DAY_MINUTES = 24 * 60;

/**
 * Ceiling on how far back a query has to look for a job that is still running today,
 * and on how long a single work order may be declared. A renovation lasting longer than
 * two months is a project made of jobs, not one job.
 */
export const MAX_SPAN_DAYS = 60;

/** What the crew select offers. One list, both trades — hours first, then days. */
export const DURATION_CHOICES = [
  { minutes: 60, label: "1 h" },
  { minutes: 120, label: "2 h" },
  { minutes: 180, label: "3 h" },
  { minutes: 240, label: "4 h" },
  { minutes: 360, label: "6 h" },
  { minutes: 480, label: "8 h" },
  { minutes: 2 * DAY_MINUTES, label: "2 days" },
  { minutes: 3 * DAY_MINUTES, label: "3 days" },
  { minutes: 5 * DAY_MINUTES, label: "5 days" },
  { minutes: 10 * DAY_MINUTES, label: "10 days" },
  { minutes: 15 * DAY_MINUTES, label: "15 days" },
] as const;

/** The shape every surface agrees on: what the rail, the board and the route all read. */
export interface ScheduleJob {
  id: string;
  scheduledDate?: string | Date | null;
  durationMinutes?: number | null;
  assignedToId?: string | null;
  status?: string | null;
}

/** The stretch of wall clock a job occupies. */
export interface Slot {
  startMs: number;
  endMs: number;
  /** Booked on a day with no time on it — it holds whole days, not a window. */
  allDay: boolean;
}

/** A duration as it arrives from a form or a JSON body. `null` means «not stated». */
export function parseDuration(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(Math.round(n), MAX_SPAN_DAYS * DAY_MINUTES);
}

/**
 * Every day in this file is a LOCAL day, so every string goes through `parseDayInput`.
 * `new Date("2026-08-17")` is UTC midnight by spec — 20:00 the evening before in Toronto
 * — and a rail that parsed its own dates that way would draw Monday's work on Sunday and
 * call a whole-day booking an 8pm appointment.
 */
function startOf(job: ScheduleJob): Date | null {
  return parseDayInput(job.scheduledDate) ?? null;
}

/** Local midnight of the day this instant falls in. */
export function startOfDay(d: Date | string): Date {
  // Cloned, because `parseDayInput` hands a Date straight back and truncating the
  // caller's own `new Date()` to midnight would rewrite time for everything downstream.
  const parsed = parseDayInput(d);
  const x = parsed ? new Date(parsed.getTime()) : new Date(NaN);
  x.setHours(0, 0, 0, 0);
  return x;
}

/**
 * The wall-clock stretch a job holds, or `null` when it was never booked.
 *
 * An all-day job is rounded out to whole days on both ends: it is busy from midnight to
 * midnight, which is what makes two undated bookings on one man read as a collision —
 * the dispatcher has not said otherwise, so the system cannot pretend they fit.
 */
export function slotOf(job: ScheduleJob): Slot | null {
  const start = startOf(job);
  if (!start) return null;

  const minutes = parseDuration(job.durationMinutes);
  const allDay = start.getHours() === 0 && start.getMinutes() === 0;

  if (allDay) {
    const days = Math.max(1, Math.ceil((minutes ?? DAY_MINUTES) / DAY_MINUTES));
    const from = startOfDay(start);
    const to = new Date(from);
    // Walked with setDate instead of adding N × 86 400 000 ms: the night the clocks
    // change is 23 hours long, and a three-day job would end an hour early.
    to.setDate(to.getDate() + days);
    return { startMs: from.getTime(), endMs: to.getTime(), allDay: true };
  }

  return {
    startMs: start.getTime(),
    endMs: start.getTime() + (minutes ?? DEFAULT_SLOT_MINUTES) * 60_000,
    allDay: false,
  };
}

/** How many calendar days the job sits on the rail — 1 for an ordinary stop. */
export function spanDays(job: ScheduleJob): number {
  const slot = slotOf(job);
  if (!slot) return 1;
  const first = startOfDay(new Date(slot.startMs));
  // The last instant inside the job, so a job ending exactly at midnight stops the day before.
  const last = startOfDay(new Date(Math.max(slot.endMs - 1, slot.startMs)));
  let days = 1;
  const cursor = new Date(first);
  while (cursor.getTime() < last.getTime() && days <= MAX_SPAN_DAYS) {
    cursor.setDate(cursor.getDate() + 1);
    days += 1;
  }
  return days;
}

/** The day the job runs out, as YYYY-MM-DD. Equal to the start day for a single stop. */
export function lastDayOf(job: ScheduleJob): string {
  const slot = slotOf(job);
  if (!slot) return "";
  return dayStamp(new Date(Math.max(slot.endMs - 1, slot.startMs)));
}

/** Does this job hold any part of that calendar day? */
export function occupiesDay(job: ScheduleJob, day: Date | string): boolean {
  const slot = slotOf(job);
  if (!slot) return false;
  const from = startOfDay(day).getTime();
  const to = new Date(startOfDay(day));
  to.setDate(to.getDate() + 1);
  return slot.startMs < to.getTime() && slot.endMs > from;
}

/** Which day of the run this is — «DAY 2/4» on the rail. */
export function dayIndexOf(job: ScheduleJob, day: Date | string): number {
  const slot = slotOf(job);
  if (!slot) return 0;
  const first = startOfDay(new Date(slot.startMs));
  const target = startOfDay(day);
  let i = 1;
  const cursor = new Date(first);
  while (cursor.getTime() < target.getTime() && i <= MAX_SPAN_DAYS) {
    cursor.setDate(cursor.getDate() + 1);
    i += 1;
  }
  return i;
}

/** Half-open intersection: a job ending at 11:00 and one starting at 11:00 do not collide. */
export function overlaps(a: ScheduleJob, b: ScheduleJob): boolean {
  const x = slotOf(a);
  const y = slotOf(b);
  if (!x || !y) return false;
  return x.startMs < y.endMs && y.startMs < x.endMs;
}

/** A job nobody is going to drive to. Cancelled work never competes for a person. */
function live(job: ScheduleJob): boolean {
  return job.status !== "CANCELLED";
}

/**
 * The other jobs the same person is already holding at the same time.
 *
 * Deliberately a report, never a veto. A mover runs two short jobs back to back and the
 * dispatcher knows it; software that refuses the second one gets worked around inside a
 * week. So the answer is a list — the caller shows it and lets the dispatcher press on.
 */
export function conflictsFor<T extends ScheduleJob>(job: ScheduleJob, others: T[]): T[] {
  if (!job.assignedToId || !slotOf(job) || !live(job)) return [];
  return others.filter(
    (o) => o.id !== job.id && live(o) && o.assignedToId === job.assignedToId && overlaps(job, o)
  );
}

export interface PersonLoad {
  id: string | null;
  name: string;
  /** Jobs on this person that day. */
  count: number;
  /** Two of them collide in time — the dispatcher put one man in two places. */
  clash: boolean;
}

export interface DayLoad {
  /** Every live job touching the day, assigned or not. */
  total: number;
  unassigned: number;
  /** Assigned people, busiest first; a clash sorts to the top. */
  crew: PersonLoad[];
  /** Anyone standing in two places at once that day. */
  clashes: PersonLoad[];
}

/**
 * The day's load as a dispatcher reads it: who is out, how many stops each, who is
 * double-booked. `names` maps ids to people — jobs carry the id, the rail prints a name.
 */
export function dayLoad<T extends ScheduleJob & { assignedToName?: string | null }>(
  jobs: T[],
  day: Date | string,
  names?: Map<string, string>
): DayLoad {
  const onDay = jobs.filter((j) => live(j) && occupiesDay(j, day));
  const buckets = new Map<string, T[]>();
  let unassigned = 0;

  for (const job of onDay) {
    if (!job.assignedToId) {
      unassigned += 1;
      continue;
    }
    buckets.set(job.assignedToId, [...(buckets.get(job.assignedToId) ?? []), job]);
  }

  const crew: PersonLoad[] = Array.from(buckets.entries()).map(([id, held]) => ({
    id,
    name: names?.get(id) ?? held[0]?.assignedToName ?? "Crew",
    count: held.length,
    clash: held.some((job) => conflictsFor(job, held).length > 0),
  }));

  crew.sort((a, b) => Number(b.clash) - Number(a.clash) || b.count - a.count || a.name.localeCompare(b.name));

  return {
    total: onDay.length,
    unassigned,
    crew,
    clashes: crew.filter((p) => p.clash),
  };
}

/**
 * Is this job being dragged forward out of a day that is already over?
 *
 * Field mode carries unfinished work into today and stamps it CARRIED, which is right
 * for a stop that was missed. A four-day renovation booked on Monday is NOT missed on
 * Tuesday — it is on day two of four, and stamping it every morning teaches the crew to
 * ignore the stamp. So the run has to be over before the word is used.
 */
export function isCarried(job: ScheduleJob, now: Date = new Date()): boolean {
  const slot = slotOf(job);
  if (!slot) return false;
  if (job.status === "COMPLETED" || job.status === "CANCELLED") return false;
  return slot.endMs <= startOfDay(now).getTime();
}

/** «2 h», «8 h», «3 days» — the ruler this trade measures in. */
export function formatDuration(minutes?: number | null): string {
  const m = parseDuration(minutes);
  if (m === null) return "";
  if (m % DAY_MINUTES === 0 && m >= DAY_MINUTES) {
    const days = m / DAY_MINUTES;
    return `${days} day${days === 1 ? "" : "s"}`;
  }
  if (m % 60 === 0) return `${m / 60} h`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}

/** The window a rail asks the server for: the seven days containing `anchor`. */
export function weekWindow(anchor: Date = new Date()): { from: Date; to: Date } {
  const from = startOfDay(anchor);
  from.setDate(from.getDate() - from.getDay());
  const to = new Date(from);
  to.setDate(to.getDate() + 7);
  return { from, to };
}

/** The single day containing `anchor`. */
export function dayWindow(anchor: Date = new Date()): { from: Date; to: Date } {
  const from = startOfDay(anchor);
  const to = new Date(from);
  to.setDate(to.getDate() + 1);
  return { from, to };
}

/**
 * Does the job's run touch [from, to)? A four-day job that started last Friday is on
 * this week's board even though its start date is not — filtering by start alone is how
 * a running job disappears from the week it is running in.
 */
export function intersectsWindow(job: ScheduleJob, from: Date, to: Date): boolean {
  const slot = slotOf(job);
  if (!slot) return false;
  return slot.startMs < to.getTime() && slot.endMs > from.getTime();
}

/**
 * Multi-day runs laid out as bars over a seven-column rail.
 *
 * Each bar knows the column it starts in, how many columns it covers, and whether it
 * runs off either edge of the week — a job continuing from last week gets an arrow, not
 * a false Monday start.
 */
export interface Segment<T> {
  job: T;
  /** 0-based column of the first day shown. */
  start: number;
  /** Columns covered inside this week. */
  span: number;
  continuesBefore: boolean;
  continuesAfter: boolean;
  /** Stacking row, so two overlapping runs do not sit on top of each other. */
  lane: number;
}

export function segmentsForDays<T extends ScheduleJob>(jobs: T[], days: Date[]): Segment<T>[] {
  if (days.length === 0) return [];
  const keys = days.map((d) => dayStamp(d));
  const out: Segment<T>[] = [];
  const laneEnds: number[] = [];

  const runs = jobs
    .filter((j) => live(j) && spanDays(j) > 1)
    .filter((j) => days.some((d) => occupiesDay(j, d)))
    .sort((a, b) => (slotOf(a)?.startMs ?? 0) - (slotOf(b)?.startMs ?? 0));

  for (const job of runs) {
    const first = keys.findIndex((_, i) => occupiesDay(job, days[i]));
    let last = first;
    while (last + 1 < days.length && occupiesDay(job, days[last + 1])) last += 1;

    const startKey = dayStamp(new Date(slotOf(job)!.startMs));
    const endKey = lastDayOf(job);

    let lane = laneEnds.findIndex((end) => end < first);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(last);
    } else {
      laneEnds[lane] = last;
    }

    out.push({
      job,
      start: first,
      span: last - first + 1,
      continuesBefore: startKey < keys[first],
      continuesAfter: endKey > keys[last],
      lane,
    });
  }

  return out;
}
