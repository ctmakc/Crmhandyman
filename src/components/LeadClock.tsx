"use client";

import { useEffect, useState } from "react";
import {
  responseOf,
  stopwatch,
  waitShort,
  waitTone,
  type ClockLead,
  type Response,
} from "@/lib/lead-clock";

/**
 * THE RESPONSE CLOCK, on screen. How long a lead has waited for a callback — the one
 * number on this desk the owner changes by working faster today. The arithmetic lives in
 * `@/lib/lead-clock` so both screens and the test suite read the same rule.
 */

/** Re-reads the clock on an interval; one timer per mounted component. */
function useNow(everyMs: number): number | null {
  // Null until mounted: the server has no «now», and rendering one would hydrate wrong.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), everyMs);
    return () => window.clearInterval(id);
  }, [everyMs]);
  return now;
}

/**
 * THE UNIT MARK.
 *
 * `stopwatch()` prints `10:42`, and at twenty to nine in the evening the owner read
 * that as twenty to eleven — a running stopwatch and a wall clock look the same on a
 * plate full of times. The arithmetic is untouched; the reading is split into digits
 * and the unit they are counted in, and the unit is set small and neutral the way the
 * money readout sets its dollar sign.
 */
function reading(r: Response): { digits: string; unit: string } {
  if (r.answered) return { digits: waitShort(r.ms), unit: "" };
  const s = stopwatch(r.ms);
  if (s.endsWith(" H")) return { digits: s.slice(0, -2), unit: "HRS" };
  if (s.includes(":")) return { digits: s, unit: "MIN" };
  return { digits: s, unit: "" };
}

/**
 * THE CARD READING. Sits where the lead's header used to state its age in days, and
 * states instead the thing that is still in the owner's hands.
 */
export function LeadClock({ lead }: { lead: ClockLead }) {
  const now = useNow(1_000);
  if (now === null) {
    return <span className="mono eyebrow text-ink-3">—</span>;
  }

  const r = responseOf(lead, now);
  const tone = waitTone(r);
  const { digits, unit } = reading(r);

  return (
    <span
      className="block"
      title={
        r.answered
          ? "From the lead landing to the first time the desk worked it"
          : "Nobody has touched this lead yet"
      }
    >
      <span className="eyebrow block" style={{ color: tone }}>
        {r.answered ? "Answered in" : "Waiting for a callback"}
      </span>
      <span
        className="mono t-readout mt-1.5 block font-bold tracking-[-0.02em]"
        style={{ color: tone }}
      >
        {digits}
        {unit && (
          <span className="t-meta ml-1.5 align-baseline text-ink-3">{unit}</span>
        )}
      </span>
    </span>
  );
}

/**
 * THE SHEET COLUMN. The same value at row scale, and the loudest thing in the row:
 * one look down the lane answers «who has been waiting longest», which is the only
 * question the sheet exists to answer.
 *
 * It used to be an 11px label behind a strip of hairline ticks — one tick per quarter
 * hour, capped at eight. At 390px the strip read as a row of splinters, it repeated
 * what the number beside it already said, and it stopped growing exactly where the
 * wait starts to cost the job. The number carries it alone now: calm ink under an
 * hour, amber past one, rose past four — the same three steps the card uses, and the
 * word above it says which way the clock is running.
 */
export function LeadWait({
  lead,
  /** The worked lane reports history, so it reads at row scale instead of shouting. */
  compact,
}: {
  lead: ClockLead;
  compact?: boolean;
}) {
  const now = useNow(20_000);
  if (now === null) {
    return <span className="mono eyebrow shrink-0 text-ink-3">—</span>;
  }

  const r = responseOf(lead, now);
  const tone = waitTone(r);

  return (
    <span
      className="flex shrink-0 flex-col items-end"
      title={
        r.answered
          ? `Answered in ${waitShort(r.ms)}`
          : `Waiting ${waitShort(r.ms)} for a callback`
      }
    >
      <span className="eyebrow" style={{ color: tone }}>
        {r.answered ? "Answered in" : "Waiting"}
      </span>
      <span
        className={`mono mt-1 font-bold tracking-[-0.02em] ${compact ? "t-row" : "t-record"}`}
        style={{ color: tone }}
      >
        {waitShort(r.ms)}
      </span>
    </span>
  );
}
