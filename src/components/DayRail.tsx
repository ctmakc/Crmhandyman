"use client";

import Link from "next/link";
import { spineFor } from "@/components/ui/primitives";

interface RailJob {
  id: string;
  title: string;
  client: string;
  status: string;
  date: string | null;
}

/**
 * THE DAY RAIL — signature device #2 (see DESIGN.md).
 * A ruled seven-day scale for the current week. Booked jobs sit on it as stubs,
 * so the first thing a dispatcher reads is the shape of the week, not a KPI card.
 */
export default function DayRail({
  jobs,
  crewSize = 0,
}: {
  jobs: RailJob[];
  /** Number of people who can be sent out. 0 hides the load readout entirely. */
  crewSize?: number;
}) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - start.getDay());

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });

  const todayKey = new Date().toDateString();

  const booked = jobs.length;

  return (
    <section>
      <div className="flex items-baseline justify-between gap-4 pb-2.5">
        <h2 className="text-[12px] font-bold uppercase tracking-[0.1em] text-ink">
          The week
        </h2>
        <span className="eyebrow">
          {booked} booked ·{" "}
          {days[0].toLocaleDateString("en-CA", { month: "short", day: "2-digit" })} —{" "}
          {days[6].toLocaleDateString("en-CA", { month: "short", day: "2-digit" })}
        </span>
      </div>

      {/* Seven columns is a desk view. On a phone the same data becomes a list
          of the days that actually have work on them. */}
      <div className="hidden grid-cols-7 border-y border-line md:grid">
        {days.map((day) => {
          const isToday = day.toDateString() === todayKey;
          const dayJobs = jobs.filter(
            (j) => j.date && new Date(j.date).toDateString() === day.toDateString()
          );
          return (
            <div
              key={day.toISOString()}
              className="min-h-[188px] border-r border-line px-2.5 pb-3 pt-3 last:border-r-0"
              style={{ background: isToday ? "var(--sunk)" : undefined }}
            >
              {/* The date is the biggest thing in the cell — the week has to read
                  as a calendar at a glance, not as seven equal boxes. */}
              <div className="flex items-baseline justify-between px-0.5">
                <span
                  className="mono text-[10px] uppercase tracking-[0.12em]"
                  style={{ color: isToday ? "var(--ink-2)" : "var(--ink-3)" }}
                >
                  {day.toLocaleDateString("en-CA", { weekday: "short" })}
                </span>
                <span
                  className="mono text-[22px] font-bold leading-none"
                  style={{ color: isToday ? "var(--amber-ink)" : "var(--ink-3)" }}
                >
                  {String(day.getDate()).padStart(2, "0")}
                </span>
              </div>

              {/* Booked vs able-to-go. Over capacity is a double-booked truck. */}
              {crewSize > 0 && dayJobs.length > 0 && (
                <div
                  className="mono mt-2 px-0.5 text-[10px] tracking-[0.08em]"
                  style={{
                    color:
                      dayJobs.length > crewSize ? "var(--rose-ink)" : "var(--ink-3)",
                  }}
                >
                  {dayJobs.length}/{crewSize}
                  {dayJobs.length > crewSize ? " OVER" : ""}
                </div>
              )}

              <div className="mt-2 space-y-1.5">
                {dayJobs.map((job) => (
                  <Link
                    key={job.id}
                    href={`/projects/${job.id}`}
                    className="block bg-plate px-2 py-1.5 transition-colors duration-[140ms] ease-instrument hover:bg-sunk"
                    style={{ borderLeft: `3px solid ${spineFor(job.status)}` }}
                  >
                    <p className="truncate text-[12px] font-bold leading-tight text-ink">
                      {job.title}
                    </p>
                    <p className="truncate text-[11px] text-ink-3">{job.client}</p>
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Phone: only the days with work, stacked. */}
      <div className="border-t border-line md:hidden">
        {days
          .map((day) => ({
            day,
            jobs: jobs.filter(
              (j) => j.date && new Date(j.date).toDateString() === day.toDateString()
            ),
          }))
          .filter((d) => d.jobs.length)
          .map(({ day, jobs: dayJobs }) => (
            <div
              key={day.toISOString()}
              className="border-b border-line px-4 py-3 last:border-b-0"
              style={{
                background: day.toDateString() === todayKey ? "var(--sunk)" : undefined,
              }}
            >
              <div className="mono text-[10px] uppercase tracking-[0.12em] text-ink-3">
                {day.toLocaleDateString("en-CA", { weekday: "long", day: "2-digit", month: "short" })}
                {day.toDateString() === todayKey ? " · today" : ""}
              </div>
              <div className="mt-2 space-y-1.5">
                {dayJobs.map((job) => (
                  <Link
                    key={job.id}
                    href={`/projects/${job.id}`}
                    className="block border border-line bg-plate px-3 py-2"
                    style={{ borderLeft: `3px solid ${spineFor(job.status)}` }}
                  >
                    <p className="text-[13px] font-bold leading-tight text-ink">{job.title}</p>
                    <p className="text-[12px] text-ink-3">{job.client}</p>
                  </Link>
                ))}
              </div>
            </div>
          ))}
      </div>
    </section>
  );
}
