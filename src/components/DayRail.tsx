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
export default function DayRail({ jobs }: { jobs: RailJob[] }) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - start.getDay());

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });

  const todayKey = new Date().toDateString();

  return (
    <section className="border border-line bg-plate">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <h2 className="text-[13px] font-bold uppercase tracking-[0.06em] text-ink">
          The week
        </h2>
        <span className="eyebrow">
          {days[0].toLocaleDateString("en-CA", { month: "short", day: "2-digit" })} —{" "}
          {days[6].toLocaleDateString("en-CA", { month: "short", day: "2-digit" })}
        </span>
      </div>

      {/* Seven columns is a desk view. On a phone the same data becomes a list
          of the days that actually have work on them. */}
      <div className="hidden grid-cols-7 md:grid">
        {days.map((day) => {
          const isToday = day.toDateString() === todayKey;
          const dayJobs = jobs.filter(
            (j) => j.date && new Date(j.date).toDateString() === day.toDateString()
          );
          return (
            <div
              key={day.toISOString()}
              className="min-h-[132px] border-r border-line px-2 py-2.5 last:border-r-0"
              style={{ background: isToday ? "var(--sunk)" : undefined }}
            >
              <div className="flex items-baseline justify-between px-1">
                <span
                  className="mono text-[10px] uppercase tracking-[0.1em]"
                  style={{ color: isToday ? "var(--ink)" : "var(--ink-3)" }}
                >
                  {day.toLocaleDateString("en-CA", { weekday: "short" })}
                </span>
                <span
                  className="mono text-[13px] font-bold"
                  style={{ color: isToday ? "var(--amber-ink)" : "var(--ink-3)" }}
                >
                  {String(day.getDate()).padStart(2, "0")}
                </span>
              </div>

              <div className="mt-2 space-y-1.5">
                {dayJobs.map((job) => (
                  <Link
                    key={job.id}
                    href={`/projects/${job.id}`}
                    className="block border border-line bg-plate px-2 py-1.5 transition-colors duration-[140ms] ease-instrument hover:border-ink-3"
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
      <div className="md:hidden">
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
