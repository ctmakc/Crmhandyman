/**
 * THE RESPONSE CLOCK — the arithmetic.
 *
 * A shop buying traffic loses the job to whoever calls back first, so this is the one
 * number on the desk the owner moves by working harder today. It runs from the moment a
 * lead landed until somebody touched it, and it keeps running while nobody has.
 *
 * What counts as «touched», with no new column to store it in:
 *   · the lead left NEW (contacted, verified, rejected, converted), or
 *   · a stamped line appeared in the call log.
 *
 * When a call was logged, the stamp on that line IS the moment of the first action and
 * the reading is exact. Without one the fallback is `updatedAt`: exact in the usual case
 * (one PUT moves the status and nothing else touches the row afterwards) and an upper
 * bound if the record is edited days later. The reading errs late, never early — a
 * metric about answering fast must not flatter the desk.
 *
 * Lives in lib rather than beside the component because both screens and the tests read
 * it, and because a number this load-bearing deserves a suite.
 */

import { STAMP_LINE } from "@/lib/lead-notes";

export type ClockLead = {
  createdAt: string;
  updatedAt?: string;
  status: string;
  notes?: string | null;
};

export type Response =
  /** Nobody has touched it yet — `ms` grows with every tick. */
  | { answered: false; ms: number }
  /** `ms` is how long the caller waited for the callback. */
  | { answered: true; ms: number };

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

/**
 * `[13 AUG 09:07]` — what the call-log form writes, at the head of its own line.
 *
 * Anchored, because the quiz transcript shares this column and the visitor writes that
 * half: a stamp accepted anywhere let a stranger mark his own lead answered and sink it
 * to the bottom of the call sheet. The text arriving from outside is defanged as well
 * (src/lib/lead-notes.ts) — either barrier alone closes it, and neither is expensive.
 *
 * The year is missing from the stamp, so it comes from the lead; a January line on a
 * December lead rolls forward a year.
 */
function firstLoggedCall(notes: string | null | undefined, createdAt: Date): number | null {
  const match = STAMP_LINE.exec(notes ?? "");
  if (!match) return null;

  const month = MONTHS.indexOf(match[2]);
  if (month < 0) return null;

  const stamped = new Date(
    createdAt.getFullYear(),
    month,
    Number(match[1]),
    Number(match[3]),
    Number(match[4])
  );
  if (stamped.getTime() < createdAt.getTime() - 86_400_000) {
    stamped.setFullYear(stamped.getFullYear() + 1);
  }
  return stamped.getTime();
}

export function responseOf(lead: ClockLead, now: number): Response {
  const created = new Date(lead.createdAt);
  const logged = firstLoggedCall(lead.notes, created);
  const worked = lead.status !== "NEW";

  if (!worked && logged === null) {
    return { answered: false, ms: Math.max(0, now - created.getTime()) };
  }

  const updated = lead.updatedAt ? new Date(lead.updatedAt).getTime() : now;
  const answeredAt = logged === null ? updated : Math.min(logged, updated);
  return { answered: true, ms: Math.max(0, answeredAt - created.getTime()) };
}

/**
 * A lead nobody ever called stops being work and becomes history. Two days is the line:
 * past it the customer has hired somebody else, and the row is kept for the record.
 */
export const STALE_MS = 48 * 3600_000;

/**
 * Sorting key for the call sheet.
 *
 * Three bands, and inside each one the longest wait sits on top:
 *   · still winnable and nobody has called — this is the morning's work;
 *   · unanswered but cold — kept above the worked leads, because it is still an open
 *     row, and below the live ones, because the phone call is not happening;
 *   · already worked.
 *
 * The middle band exists because «longest wait first» alone handed the top of the sheet
 * to a lead from four months ago FOREVER: the owner opened the screen he calls back
 * from and the freshest enquiry of the day was sixth of seven, below the fold, under a
 * row that has been unanswerable since April.
 */
const BAND = Number.MAX_SAFE_INTEGER / 8;

export function waitRank(lead: ClockLead, now: number): number {
  const r = responseOf(lead, now);
  if (r.answered) return r.ms;
  return r.ms < STALE_MS ? r.ms + BAND * 4 : r.ms + BAND;
}

/**
 * Calm in minutes, uneasy after an hour, alarming after four. The thresholds are the
 * shape of the trade: a lead answered inside the hour is normally still yours.
 */
export function waitTone(r: Response): string {
  if (r.answered) return "var(--emerald-ink)";
  const minutes = r.ms / 60_000;
  if (minutes < 60) return "var(--ink-3)";
  if (minutes < 240) return "var(--amber-ink)";
  return "var(--rose-ink)";
}

/** `7:12` under an hour — a stopwatch, because that is what it is. */
export function stopwatch(ms: number): string {
  const total = Math.floor(ms / 1000);
  const minutes = Math.floor(total / 60);
  if (minutes < 60) return `${minutes}:${String(total % 60).padStart(2, "0")}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}:${String(minutes % 60).padStart(2, "0")} H`;
  return `${Math.floor(hours / 24)}D ${hours % 24}H`;
}

/** Coarser, for a row on the sheet: `14M`, `3H 10M`, `2D 4H`. */
export function waitShort(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes}M`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}H ${String(minutes % 60).padStart(2, "0")}M`;
  return `${Math.floor(hours / 24)}D ${hours % 24}H`;
}
