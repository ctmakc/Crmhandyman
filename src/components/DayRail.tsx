"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { spineFor } from "@/components/ui/primitives";
import {
  dayIndexOf,
  dayLoad,
  formatDuration,
  occupiesDay,
  segmentsForDays,
  spanDays,
  type DayLoad,
} from "@/lib/schedule";

export interface RailJob {
  id: string;
  title: string;
  client: string;
  status: string;
  date: string | null;
  /** Who is actually driving there — the load below is counted off this, nothing else. */
  assignedToId?: string | null;
  assignedToName?: string | null;
  /** How long it holds that person. A renovation running four days is one bar, not four dots. */
  durationMinutes?: number | null;
}

/** The rail speaks its own vocabulary; the API answers with the project row. */
interface ApiWeekJob {
  id: string;
  title: string;
  clientName: string;
  status: string;
  scheduledDate: string | null;
  assignedToId: string | null;
  assignedTo: { id: string; name: string } | null;
  durationMinutes: number | null;
}

/** `SAM CARTER` reads as `SAM C` in a 120px column and still names one person. */
function shortName(name: string) {
  const [first, ...rest] = name.trim().split(/\s+/);
  const last = rest.length ? ` ${rest[rest.length - 1][0]}` : "";
  return `${first}${last}`.toUpperCase();
}

/** Vertical room the multi-day band needs, in px. */
const LANE_H = 19;
/** Where the band starts — directly under the day numerals in the columns beside it. */
const BAND_TOP = 52;

/**
 * THE DAY RAIL — signature device #2 (see DESIGN.md).
 *
 * A ruled seven-day scale for the current week. Two things a dispatcher has to read off
 * it before anything else:
 *
 *   WHO IS LOADED. The old readout divided jobs by heads — `4/2 OVER` on a day where
 *   both jobs sat on one man and the other was free all morning. It never named anybody,
 *   so it could not be acted on. The readout now counts the REAL assignment: a line per
 *   person, `×n` when he is out more than once, rose when two of his jobs collide in
 *   time. Work with nobody on it is called out separately, because an unassigned job is
 *   a truck that does not leave.
 *
 *   HOW LONG. A mover's stop is hours of one day; a renovation holds an address for a
 *   week. Multi-day work is drawn as a bar across the days it actually occupies, with
 *   arrows where it runs off the edge of the week.
 */
export default function DayRail({
  jobs,
  crewSize = 0,
}: {
  jobs: RailJob[];
  /** Hands the shop has. Context for the load lines, never a capacity to divide by. */
  crewSize?: number;
}) {
  /**
   * The server hands over the week's start dates; a job that began before Sunday and is
   * still running is not in that set. The rail asks for the window itself so a four-day
   * renovation does not vanish from the week it is running in.
   */
  const [rows, setRows] = useState<RailJob[]>(jobs);

  useEffect(() => {
    let live = true;
    fetch("/api/projects?window=week")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: ApiWeekJob[] | null) => {
        if (!live || !Array.isArray(data)) return;
        setRows(
          data.map((j) => ({
            id: j.id,
            title: j.title,
            client: j.clientName,
            status: j.status,
            date: j.scheduledDate,
            assignedToId: j.assignedToId,
            assignedToName: j.assignedTo?.name ?? null,
            durationMinutes: j.durationMinutes,
          }))
        );
      })
      .catch(() => null);
    return () => {
      live = false;
    };
  }, []);

  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - start.getDay());

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });

  const todayKey = new Date().toDateString();

  // Everything the schedule library reads lives on one shape: start, run, holder.
  const scheduled = rows.map((j) => ({
    ...j,
    scheduledDate: j.date,
  }));

  const segments = segmentsForDays(scheduled, days);
  const bandLanes = segments.reduce((n, s) => Math.max(n, s.lane + 1), 0);
  const bandHeight = bandLanes * LANE_H;

  const loads = days.map((d) => dayLoad(scheduled, d));
  const clashDays = loads.filter((l) => l.clashes.length > 0).length;
  const booked = rows.length;

  /** Single stops sit inside their column; runs are drawn once, as a bar. */
  const stopsOn = (day: Date) =>
    scheduled.filter((j) => spanDays(j) === 1 && occupiesDay(j, day));

  function LoadLines({ load }: { load: DayLoad }) {
    if (load.total === 0) return null;
    return (
      <div className="mono mt-2 space-y-[3px] px-0.5 text-[10px] leading-none tracking-[0.06em]">
        {load.crew.map((p) => (
          <div
            key={p.id}
            style={{ color: p.clash ? "var(--rose-ink)" : "var(--ink-2)" }}
            title={
              p.clash
                ? `${p.name} is booked on ${p.count} jobs that overlap in time`
                : `${p.name} · ${p.count} job${p.count === 1 ? "" : "s"}`
            }
          >
            {p.clash ? "! " : ""}
            {shortName(p.name)}
            {p.count > 1 ? ` ×${p.count}` : ""}
          </div>
        ))}
        {load.unassigned > 0 && (
          <div style={{ color: "var(--amber-ink)" }} title="Nobody is driving there yet">
            {load.unassigned} UNCREWED
          </div>
        )}
      </div>
    );
  }

  return (
    <section>
      <div className="flex items-baseline justify-between gap-4 pb-2.5">
        <h2 className="text-[12px] font-bold uppercase tracking-[0.1em] text-ink">
          The week
        </h2>
        <span className="eyebrow">
          {clashDays > 0 && (
            <span style={{ color: "var(--rose-ink)" }}>
              {clashDays} DAY{clashDays === 1 ? "" : "S"} DOUBLE-BOOKED ·{" "}
            </span>
          )}
          {booked} booked{crewSize > 0 ? ` · crew of ${crewSize}` : ""} ·{" "}
          {days[0].toLocaleDateString("en-CA", { month: "short", day: "2-digit" })} —{" "}
          {days[6].toLocaleDateString("en-CA", { month: "short", day: "2-digit" })}
        </span>
      </div>

      {/* The board is edged like a measuring rule — ticks per day, a taller one
          on today. This is the device the product is named for. */}
      <div className="relative hidden border-y border-line md:block">
        <div className="ruleband absolute inset-x-0 top-0" aria-hidden />
        <div
          className="absolute top-0 h-[9px] w-[2px]"
          style={{
            left: `calc(${days.findIndex((d) => d.toDateString() === todayKey)} * 100% / 7)`,
            background: "var(--amber)",
          }}
          aria-hidden
        />
        <div className="grid grid-cols-7">
        {days.map((day, i) => {
          const isToday = day.toDateString() === todayKey;
          const dayJobs = stopsOn(day);
          return (
            <div
              key={day.toISOString()}
              className={`arm-col min-h-[188px] border-r border-line px-2.5 pb-3 pt-4 last:border-r-0 ${
                isToday ? "today-glow" : ""
              }`}
              style={{ ["--i" as string]: i } as React.CSSProperties}
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
                  className="mono leading-none"
                  style={{
                    color: isToday ? "var(--amber-ink)" : "var(--ink-3)",
                    fontSize: isToday ? "28px" : "22px",
                    fontWeight: isToday ? 700 : 500,
                    letterSpacing: "-0.02em",
                  }}
                >
                  {String(day.getDate()).padStart(2, "0")}
                </span>
              </div>

              {/* Room the multi-day band takes over the columns. */}
              {bandHeight > 0 && <div style={{ height: bandHeight + 6 }} aria-hidden />}

              <LoadLines load={loads[i]} />

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

        {/* MULTI-DAY RUNS — one bar over the days the work actually holds. Drawn on top
            of the columns so a four-day renovation reads as one object; arrows mark the
            days that fall outside this week. */}
        {segments.length > 0 && (
          <div
            className="pointer-events-none absolute inset-x-0 grid grid-cols-7 gap-y-[3px] px-[1px]"
            style={{ top: BAND_TOP }}
          >
            {segments.map((s) => (
              <Link
                key={s.job.id}
                href={`/projects/${s.job.id}`}
                className="pointer-events-auto mx-[3px] flex h-[16px] items-center gap-1.5 overflow-hidden bg-plate pl-1.5 pr-1 transition-colors duration-[140ms] ease-instrument hover:bg-sunk"
                style={{
                  gridColumn: `${s.start + 1} / span ${s.span}`,
                  gridRow: s.lane + 1,
                  borderLeft: `3px solid ${spineFor(s.job.status)}`,
                }}
                title={`${s.job.title} · ${formatDuration(s.job.durationMinutes)}`}
              >
                {s.continuesBefore && <span className="mono text-[9px] text-ink-3">◀</span>}
                <span className="truncate text-[11px] font-bold leading-none text-ink">
                  {s.job.title}
                </span>
                <span className="mono ml-auto shrink-0 pl-1 text-[9px] uppercase tracking-[0.08em] text-ink-3">
                  {formatDuration(s.job.durationMinutes)}
                </span>
                {s.continuesAfter && <span className="mono text-[9px] text-ink-3">▶</span>}
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Phone: only the days with work, stacked. A week with none of it prints one
          bare rule, which reads exactly like a page that failed to load — so the empty
          week says out loud that it is empty. */}
      <div className="border-t border-line md:hidden">
        {scheduled.length === 0 && (
          <p className="px-4 py-5 text-[13px] text-ink-2">Nothing booked this week.</p>
        )}
        {days
          .map((day, i) => ({
            day,
            load: loads[i],
            jobs: scheduled.filter((j) => occupiesDay(j, day)),
          }))
          .filter((d) => d.jobs.length)
          .map(({ day, load, jobs: dayJobs }) => (
            <div
              key={day.toISOString()}
              className="border-b border-line px-4 py-3 last:border-b-0"
              style={{
                background: day.toDateString() === todayKey ? "var(--sunk)" : undefined,
              }}
            >
              <div className="flex items-baseline justify-between gap-3">
                <div className="mono text-[10px] uppercase tracking-[0.12em] text-ink-3">
                  {day.toLocaleDateString("en-CA", { weekday: "long", day: "2-digit", month: "short" })}
                  {day.toDateString() === todayKey ? " · today" : ""}
                </div>
                {load.clashes.length > 0 && (
                  <div
                    className="mono text-[10px] uppercase tracking-[0.08em]"
                    style={{ color: "var(--rose-ink)" }}
                  >
                    ! {load.clashes.map((p) => shortName(p.name)).join(" · ")}
                  </div>
                )}
              </div>
              <div className="mt-2 space-y-1.5">
                {dayJobs.map((job) => {
                  const runs = spanDays(job);
                  return (
                    <Link
                      key={job.id}
                      href={`/projects/${job.id}`}
                      className="block border border-line bg-plate px-3 py-2"
                      style={{ borderLeft: `3px solid ${spineFor(job.status)}` }}
                    >
                      <p className="text-[13px] font-bold leading-tight text-ink">{job.title}</p>
                      <p className="text-[12px] text-ink-3">
                        {job.client}
                        {runs > 1 ? ` · day ${dayIndexOf(job, day)}/${runs}` : ""}
                        {job.assignedToName ? ` · ${job.assignedToName}` : ""}
                      </p>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
      </div>
    </section>
  );
}
