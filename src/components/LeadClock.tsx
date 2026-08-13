"use client";

import { useEffect, useState } from "react";
import {
  responseOf,
  stopwatch,
  waitShort,
  waitTone,
  type ClockLead,
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
 * THE CARD READING. Sits where the lead's header used to state its age in days, and
 * states instead the thing that is still in the owner's hands.
 */
export function LeadClock({ lead }: { lead: ClockLead }) {
  const now = useNow(1_000);
  if (now === null) {
    return <span className="mono text-[11px] tracking-[0.08em] text-ink-3">—</span>;
  }

  const r = responseOf(lead, now);
  const tone = waitTone(r);

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
        className="mono mt-1 block text-[26px] font-bold leading-none tracking-[-0.02em]"
        style={{ color: tone }}
      >
        {r.answered ? waitShort(r.ms) : stopwatch(r.ms)}
      </span>
    </span>
  );
}

/**
 * THE SHEET COLUMN. Same value, row scale. The tick strip fills a quarter-hour at a
 * time, so one look down the lane shows which calls have been sitting there.
 */
export function LeadWait({ lead }: { lead: ClockLead }) {
  const now = useNow(20_000);
  if (now === null) {
    return <span className="mono shrink-0 text-[11px] text-ink-3">—</span>;
  }

  const r = responseOf(lead, now);
  const tone = waitTone(r);
  const ticks = Math.min(Math.floor(r.ms / (15 * 60_000)), 8);

  return (
    <span
      className="flex shrink-0 items-center gap-2"
      title={
        r.answered
          ? `Answered in ${waitShort(r.ms)}`
          : `Waiting ${waitShort(r.ms)} for a callback`
      }
    >
      {!r.answered && (
        <span className="flex items-end gap-[2px]" aria-hidden="true">
          {Array.from({ length: ticks }).map((_, i) => (
            <span key={i} className="inline-block h-[7px] w-px" style={{ background: tone }} />
          ))}
          {r.ms >= 2 * 60 * 60_000 && (
            <span className="mono text-[10px] leading-none" style={{ color: tone }}>
              +
            </span>
          )}
        </span>
      )}
      <span className="mono text-[11px] font-bold tracking-[0.08em]" style={{ color: tone }}>
        {r.answered ? `ANS ${waitShort(r.ms)}` : waitShort(r.ms)}
      </span>
    </span>
  );
}
