"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Empty, LaneHead, spineFor } from "@/components/ui/primitives";
import { dayStamp, parseDayInput } from "@/lib/dates";
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
  weekStartStamp,
  todayKey,
}: {
  jobs: RailJob[];
  /** Hands the shop has. Context for the load lines, never a capacity to divide by. */
  crewSize?: number;
  /**
   * The Sunday that opens this week and today, both as `YYYY-MM-DD` decided on the
   * SERVER — the same window that already scoped the jobs handed down. Deriving them
   * here from `new Date()` during render is what discarded the server HTML: the box
   * runs UTC, so after ~8pm ET the browser (America/Toronto) is still on the previous
   * calendar day, the two renders disagreed on which column is which and which one is
   * lit, React #423 threw away the first paint, and the amber today-glow could land on
   * the wrong day. A day stamp is a bare calendar day with no instant in it, so
   * `parseDayInput` rebuilds the identical local-midnight Date on either runtime and the
   * first paint is already right.
   */
  weekStartStamp: string;
  todayKey: string;
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

  // Rebuilt from the server's stamp, never from the clock on this machine. A DAY_ONLY
  // string parses to local midnight through the same `parseDayInput` the schedule library
  // uses for job dates, so the seven columns line up with the jobs on them.
  const start = parseDayInput(weekStartStamp) ?? new Date();

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });

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
      <div className="mono t-micro mt-2 space-y-1 px-0.5 leading-none tracking-[0.06em]">
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

  const emptyWeek = scheduled.length === 0;

  /**
   * Nothing booked is a state of the week, and it says what puts work on it. No button:
   * the lane below it carries the one press that opens a job, and two identical calls
   * to action on one empty deck is a poster, not a desk.
   */
  const nothingBooked = (
    <Empty
      className="border-t-0"
      hint="A job with a date on it takes its place on this rule — a stop sits inside its day, a run draws a bar across the days it holds."
    >
      Nothing booked this week
    </Empty>
  );

  return (
    <section>
      <LaneHead
        title="The week"
        right={
          <>
            {clashDays > 0 && (
              <span className="eyebrow" style={{ color: "var(--rose-ink)" }}>
                {clashDays} DAY{clashDays === 1 ? "" : "S"} DOUBLE-BOOKED
              </span>
            )}
            <span className="eyebrow">
              {booked} BOOKED{crewSize > 0 ? ` · CREW OF ${crewSize}` : ""} ·{" "}
              {days[0].toLocaleDateString("en-CA", { month: "short", day: "2-digit" })} —{" "}
              {days[6].toLocaleDateString("en-CA", { month: "short", day: "2-digit" })}
            </span>
          </>
        }
      />

      {/* The board is edged like a measuring rule — ticks per day, a taller one
          on today. This is the device the product is named for. */}
      <div className="relative hidden border-y border-line md:block">
        <div className="ruleband absolute inset-x-0 top-0" aria-hidden />
        <div
          className="absolute top-0 h-[9px] w-[2px]"
          style={{
            left: `calc(${days.findIndex((d) => dayStamp(d) === todayKey)} * 100% / 7)`,
            background: "var(--amber)",
          }}
          aria-hidden
        />
        <div className="grid grid-cols-7">
        {days.map((day, i) => {
          const isToday = dayStamp(day) === todayKey;
          const dayJobs = stopsOn(day);
          return (
            <div
              key={day.toISOString()}
              className={`arm-col border-r border-line px-2.5 pb-3 pt-4 last:border-r-0 ${
                emptyWeek ? "min-h-[84px]" : "min-h-[188px]"
              } ${isToday ? "today-glow" : ""}`}
              style={{ ["--i" as string]: i } as React.CSSProperties}
            >
              {/* The date is the biggest thing in the cell — the week has to read
                  as a calendar at a glance, not as seven equal boxes. Today steps up
                  one step of the scale (22 → 30); it used to step up to a private 28. */}
              <div className="flex items-baseline justify-between px-0.5">
                <span
                  className="mono t-micro uppercase tracking-[0.12em]"
                  style={{ color: isToday ? "var(--ink-2)" : "var(--ink-3)" }}
                >
                  {day.toLocaleDateString("en-CA", { weekday: "short" })}
                </span>
                <span
                  className={`mono leading-none ${isToday ? "t-readout" : "t-record"}`}
                  style={{
                    color: isToday ? "var(--amber-ink)" : "var(--ink-3)",
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
                    className="block bg-plate px-2 py-1.5 transition-colors duration-fast ease-instrument hover:bg-sunk"
                    style={{ borderLeft: `3px solid ${spineFor(job.status)}` }}
                  >
                    <p className="t-body truncate font-bold leading-tight text-ink">
                      {job.title}
                    </p>
                    <p className="t-meta truncate text-ink-3">{job.client}</p>
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
                className="pointer-events-auto mx-[3px] flex h-[16px] items-center gap-1.5 overflow-hidden bg-plate pl-1.5 pr-1 transition-colors duration-fast ease-instrument hover:bg-sunk"
                style={{
                  gridColumn: `${s.start + 1} / span ${s.span}`,
                  gridRow: s.lane + 1,
                  borderLeft: `3px solid ${spineFor(s.job.status)}`,
                }}
                title={`${s.job.title} · ${formatDuration(s.job.durationMinutes)}`}
              >
                {s.continuesBefore && <span className="mono t-micro text-ink-3">◀</span>}
                <span className="t-meta truncate font-bold leading-none text-ink">
                  {s.job.title}
                </span>
                <span className="mono t-micro ml-auto shrink-0 pl-1 uppercase tracking-[0.08em] text-ink-3">
                  {formatDuration(s.job.durationMinutes)}
                </span>
                {s.continuesAfter && <span className="mono t-micro text-ink-3">▶</span>}
              </Link>
            ))}
          </div>
        )}

        {/*
          A WEEK WITH NOTHING ON IT IS A STATE, NOT A BLANK.
          The board is the biggest object on the deck, and on a shop's first morning it
          held seven empty columns and 188px of nothing — the one screen that is supposed
          to open the day read as a page that had failed to load. The rule and the dates
          stay (this is still the week of the 9th), and under them the board says what
          puts work on it.
        */}
        {emptyWeek && nothingBooked}
      </div>

      {/* Phone: only the days with work, stacked. */}
      <div className="border-t border-line md:hidden">
        {emptyWeek && nothingBooked}
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
                background: dayStamp(day) === todayKey ? "var(--sunk)" : undefined,
              }}
            >
              <div className="flex items-baseline justify-between gap-3">
                <div className="mono t-micro uppercase tracking-[0.12em] text-ink-3">
                  {day.toLocaleDateString("en-CA", { weekday: "long", day: "2-digit", month: "short" })}
                  {dayStamp(day) === todayKey ? " · TODAY" : ""}
                </div>
                {load.clashes.length > 0 && (
                  <div
                    className="mono t-micro uppercase tracking-[0.08em]"
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
                      /* Surface shift and a spine, no frame: eight hairline rectangles
                         stacked on a phone are the box grid this design took out. */
                      className="block bg-plate px-3 py-2"
                      style={{ borderLeft: `3px solid ${spineFor(job.status)}` }}
                    >
                      <p className="t-row font-bold text-ink">{job.title}</p>
                      <p className="t-meta text-ink-3">
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
