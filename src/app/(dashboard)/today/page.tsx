"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { Phone, Navigation, Check, Play, Clock } from "lucide-react";
import {
  Empty,
  LaneHead,
  Num,
  PageHead,
  Skeleton,
  Stamp,
  spineFor,
  textToneFor,
  buttonClass,
  inertLook,
} from "@/components/ui/primitives";
import { toast } from "@/components/ui/Toaster";
import { dayIndexOf, isCarried, spanDays } from "@/lib/schedule";
import {
  adoptIdentity,
  clockLabel,
  identityOf,
  pendingFor,
  queueStatus,
  readOutbox,
  readSnapshot,
  rejectionLine,
  subscribe,
  syncNow,
  waitedLabel,
  withPending,
  writeSnapshot,
  type FieldJob,
  type FieldStatus,
} from "@/lib/offline-queue";

/**
 * Field mode — the screen a tech opens in a driveway with a glove on.
 *
 * Everything here is one tap: call, navigate, start, complete. No filters, no tabs,
 * no forms. Deliberately a separate route rather than a responsive variant of the
 * job list, because the field job is a different job to the dispatcher's.
 *
 * It is also the one screen that has to work with no network at all. The last answer
 * from the server is kept on the phone and shown WITH THE TIME IT ARRIVED — a board
 * that quietly serves this morning's rows sends a mover to a job that was cancelled at
 * lunch. Taps taken in a dead zone go to the outbox (src/lib/offline-queue.ts) and
 * leave when the signal comes back.
 */

/**
 * A job booked for a date but no time (contract visits, most bookings) lands on
 * midnight — printing "00:00" reads as a real 12am appointment. Show the day instead.
 *
 * Work carried over from a finished day is no longer stamped inside the row: it is
 * lifted out into its own band under today's stops (see the two lanes below), so the
 * stamp does not have to compete with the time the tech is actually due somewhere.
 */
function slotLabel(job: FieldJob) {
  const scheduled = job.scheduledDate;
  if (!scheduled) return "ANYTIME";
  const d = new Date(scheduled);

  const runs = spanDays(job);
  const midnight = d.getHours() === 0 && d.getMinutes() === 0;
  const time = midnight
    ? "ANYTIME"
    : d.toLocaleTimeString("en-CA", { hour: "2-digit", minute: "2-digit", hour12: false });

  // Day two of four is not a time of day, and the tech needs to know which one it is.
  if (runs > 1) {
    const index = dayIndexOf(job, new Date());
    return `${time} · DAY ${index}/${runs}`;
  }
  return time;
}

/** Where the rows on screen came from. The tech is told, always. */
type Source = { live: true } | { live: false; at: number } | null;

export default function TodayPage() {
  const [jobs, setJobs] = useState<FieldJob[]>([]);
  const [source, setSource] = useState<Source>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [, tick] = useState(0);

  /** Server rows plus this phone's un-sent taps, which is what the tech should read. */
  const show = useCallback((rows: FieldJob[]) => {
    setJobs(withPending(rows, readOutbox()));
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/today");
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      const rows: FieldJob[] = Array.isArray(data) ? data : [];
      writeSnapshot(rows);
      show(rows);
      setSource({ live: true });
    } catch {
      // No network, or the server is unreachable. Fall back to the last board this
      // phone actually received, and say how old it is.
      const snapshot = readSnapshot();
      if (snapshot) {
        show(snapshot.jobs);
        setSource({ live: false, at: snapshot.fetchedAt });
      } else {
        setSource(null);
      }
    } finally {
      setLoading(false);
    }
  }, [show]);

  /**
   * WHOSE BOARD IS THIS. The stored rows are drawn before anything else, which is the
   * whole point of them — but not before the phone knows who is holding it.
   *
   * The identity fence lived in the status bar and ran a round trip later, so a phone
   * where the previous contractor never pressed «sign out» — the browser was closed, or
   * the cookie went stale overnight — showed HIS customers' addresses, phone numbers and
   * equipment to the next person to sign in, until one request came back. Claiming the
   * storage here, in the same breath as reading it, closes that window: a stranger's
   * board is wiped before a row of it reaches the screen.
   */
  const { data: session, status } = useSession();

  useEffect(() => {
    if (status === "loading") return;

    if (status === "authenticated") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const user = session?.user as any;
      const wiped = adoptIdentity(identityOf(user?.tenantId, user?.id));
      if (wiped) navigator.serviceWorker?.controller?.postMessage({ type: "hp-purge" });
    }

    // Draw whatever this phone already holds before the network is even asked: on a
    // weak signal the board appears at once instead of after a thirty-second timeout.
    const snapshot = readSnapshot();
    if (snapshot) {
      show(snapshot.jobs);
      setSource({ live: false, at: snapshot.fetchedAt });
      setLoading(false);
    }
    load();
  }, [load, show, session, status]);

  /* The outbox changed under us, or the sync loop brought a fresh board back. */
  useEffect(() => {
    const unsubscribe = subscribe(() => {
      tick((n) => n + 1);
      // A purge empties the storage; the rows already painted have to go with it, or a
      // wiped board stays on screen until the next answer from the server arrives.
      if (!readSnapshot()) {
        setJobs([]);
        setSource(null);
        return;
      }
      setJobs((rows) => withPending(rows, readOutbox()));
    });
    const onBoard = (e: Event) => {
      const rows = (e as CustomEvent<FieldJob[]>).detail;
      if (!Array.isArray(rows)) return;
      writeSnapshot(rows);
      show(rows);
      setSource({ live: true });
    };
    const onOnline = () => load();
    window.addEventListener("hp:board", onBoard);
    window.addEventListener("online", onOnline);
    // Keeps the «waiting 12 min» tallies honest while the screen stays open.
    const beat = window.setInterval(() => tick((n) => n + 1), 20_000);
    return () => {
      unsubscribe();
      window.removeEventListener("hp:board", onBoard);
      window.removeEventListener("online", onOnline);
      window.clearInterval(beat);
    };
  }, [load, show]);

  /**
   * Start or finish. The tap is written to the outbox FIRST — with the status the tech
   * was looking at — and only then pushed. Reload the page, lock the phone, walk out of
   * the building: the tap is still there and still knows what it was answering.
   */
  async function advance(job: FieldJob) {
    const next: FieldStatus = job.status === "SCHEDULED" ? "IN_PROGRESS" : "COMPLETED";
    const action = queueStatus({ id: job.id, title: job.title, status: job.status }, next);
    setJobs((rows) => rows.map((j) => (j.id === job.id ? { ...j, status: next } : j)));

    setBusy(job.id);
    const report = await syncNow();
    setBusy(null);

    if (report.jobs) {
      writeSnapshot(report.jobs);
      show(report.jobs);
      setSource({ live: true });
    }

    const rejected = report.rejected.find((r) => r.id === action.id);
    if (rejected) {
      toast(rejectionLine(rejected), "bad");
      return;
    }
    if (report.offline) {
      toast("No signal — held until you are back", "bad");
      return;
    }
    toast(next === "IN_PROGRESS" ? "On site" : "Job complete");
  }

  const today = new Date().toLocaleDateString("en-CA", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });

  const open = jobs.filter((j) => j.status !== "COMPLETED" && j.status !== "CANCELLED");
  const outbox = readOutbox();
  const rejectionFor = (jobId: string) => outbox.rejections.find((r) => r.jobId === jobId);

  /**
   * TWO BANDS, AND TODAY IS THE TOP ONE.
   *
   * The board arrives sorted by the date it was booked for, so a job left open on the
   * 27th of last month stood above the 08:00 the tech is due at this morning — every
   * morning, for as long as it stayed open. The real first stop was reading second,
   * third or sixth. Nothing is hidden: work that was never closed out keeps its own
   * band directly underneath, where it reads as a debt from an earlier day instead of
   * as the top of today.
   */
  const carried = jobs.filter((j) => isCarried(j));
  const todayJobs = jobs.filter((j) => !isCarried(j));

  function JobCard({ job, carriedRow }: { job: FieldJob; carriedRow?: boolean }) {
    const pending = pendingFor(job.id);
    const rejection = rejectionFor(job.id);
    return (
      <div
        /* A column, so the actions can be pinned to the foot of the plate: two cards
           side by side on the desk hold different amounts of detail, and their buttons
           landed at two different heights in the same row. */
        className="ticket flex h-full flex-col px-4 py-4"
        style={{ ["--spine" as string]: spineFor(job.status) } as React.CSSProperties}
      >
        <div className="flex items-baseline justify-between gap-3">
          {carriedRow ? (
            <Stamp date={job.scheduledDate} className="eyebrow" />
          ) : (
            <span className="eyebrow">{slotLabel(job)}</span>
          )}
          <span className="eyebrow" style={{ color: textToneFor(job.status) }}>
            {job.status.replace("_", " ")}
          </span>
        </div>

        {/*
          WHERE beats WHO. Both lines used to be 15px ink-2, so the address — the one
          thing the tech does not already know — was set exactly like the customer's
          name. The address now carries the row; the name is its detail.
        */}
        <Link href={`/projects/${job.id}`} className="mt-2 block">
          <p className="t-record font-bold text-ink">{job.title}</p>
        </Link>
        <p className="t-row mt-2 font-medium text-ink">{job.address}</p>
        <p className="t-body mt-1 text-ink-2">{job.clientName}</p>

        {/* The tap this phone is still holding, and for how long. */}
        {pending && (
          <div className="mt-3 flex items-center gap-2 border-t border-line pt-2.5">
            <Clock className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--amber-ink)" }} />
            <span className="eyebrow" style={{ color: "var(--amber-ink)" }}>
              {pending.to === "COMPLETED" ? "Finish" : "Start"} queued · waiting{" "}
              {waitedLabel(Date.now() - pending.queuedAt)}
            </span>
          </div>
        )}

        {/* The server said no. Never a silent revert. */}
        {rejection && (
          <div className="mt-3 border-t border-line pt-2.5">
            <span className="eyebrow" style={{ color: "var(--rose-ink)" }}>
              {rejectionLine(rejection)}
            </span>
          </div>
        )}

        {job.equipment && job.equipment.length > 0 && (
          <div className="mt-3 border-t border-line pt-2.5">
            <div className="eyebrow">On site</div>
            {job.equipment.map((eq, i) => (
              <p key={i} className="t-body mt-1 text-ink-2">
                <span className="eyebrow">{eq.kind.replace(/_/g, " ")}</span>{" "}
                {[eq.brand, eq.model].filter(Boolean).join(" ")}
                {eq.serial ? ` · S/N ${eq.serial}` : ""}
              </p>
            ))}
          </div>
        )}

        {job.description && (
          <p className="t-body mt-3 border-t border-line pt-2.5 text-ink-2">
            {job.description}
          </p>
        )}

        {/*
          One tap each. The height comes from the button primitive — 44px in the field,
          38px on the desk — where this screen used to force 48px on both and hand the
          product a third button height nothing else had.
        */}
        <div className="mt-4 grid grid-cols-3 gap-2 md:mt-auto md:flex md:flex-wrap md:pt-4">
          <a
            href={job.phone ? `tel:${job.phone}` : undefined}
            aria-disabled={!job.phone}
            className={`${buttonClass("ghost")} ${job.phone ? "" : inertLook}`}
          >
            <Phone className="h-4 w-4" aria-hidden /> Call
          </a>
          <a
            href={`https://maps.google.com/?q=${encodeURIComponent(job.address)}`}
            target="_blank"
            rel="noopener"
            className={`${buttonClass("ghost")}`}
          >
            <Navigation className="h-4 w-4" aria-hidden /> Drive
          </a>
          {job.status === "COMPLETED" ? (
            <span className={`${buttonClass("ghost")} ${inertLook}`}>
              <Check className="h-4 w-4" aria-hidden /> Done
            </span>
          ) : (
            <button
              disabled={busy === job.id}
              onClick={() => advance(job)}
              className={`${buttonClass("primary")}`}
            >
              {job.status === "SCHEDULED" ? (
                <>
                  <Play className="h-4 w-4" aria-hidden /> Start
                </>
              ) : (
                <>
                  <Check className="h-4 w-4" aria-hidden /> Finish
                </>
              )}
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    /* The page runs on the document width every other record screen runs on. It was
       the one centred column in the product, and its title started 238px to the right
       of every neighbour's. */
    <div className="page-doc pb-24 md:pb-0">
      <PageHead eyebrow={`Field · ${today}`} title="Today" />
      {/* The one number on the screen, in the face every other number in the product
          is set in. It rode in the page sub-line as body text.

          A board with nothing on it says so once, in the empty state below — the
          sub-line used to say it too, in different words, two lines above. */}
      {jobs.length > 0 && (
        <p className="measure t-lede mt-3 text-ink-2">
          {open.length === 0 ? (
            "Nothing left on the board."
          ) : (
            <>
              <Num>{open.length}</Num> stop{open.length === 1 ? "" : "s"} to go.
            </>
          )}
        </p>
      )}

      {/* How old the board is. A cached list that does not say so is worse than none. */}
      {source && !source.live && (
        <div className="mt-6 flex items-center gap-2 border-b border-line pb-2.5">
          <span
            className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ background: "var(--amber)" }}
          />
          {/* «No connection since» ended mid-sentence. What the tech needs is the age
              of what he is reading and the fact that it has not moved since. */}
          <span className="eyebrow" style={{ color: "var(--amber-ink)" }}>
            Board saved at {clockLabel(source.at)} · no signal since
          </span>
        </div>
      )}

      <div className="mt-6 space-y-5">
        {loading ? (
          <Skeleton lines={3} />
        ) : jobs.length === 0 ? (
          <Empty
            hint={
              source === null
                ? "Open this screen once while the phone has a signal and the day's stops are kept on it for the basement."
                : "The dispatcher puts stops on the board from the week view. Anything left open on an earlier day shows up here too."
            }
          >
            {source === null
              ? "No signal and nothing saved on this phone yet"
              : "No work booked for today"}
          </Empty>
        ) : (
          <>
            {/* Two columns on the desk. One column of 980px-wide tickets is a phone
                screen stretched across a dispatcher's monitor, with the status word
                marooned a foot away from the date it belongs to. */}
            {todayJobs.length > 0 && (
              <div className="grid gap-5 md:grid-cols-2">
                {todayJobs.map((job) => (
                  <JobCard key={job.id} job={job} />
                ))}
              </div>
            )}

            {todayJobs.length === 0 && carried.length > 0 && (
              <Empty hint="Everything below was booked for an earlier day and never closed out.">
                Nothing new booked for today
              </Empty>
            )}

            {carried.length > 0 && (
              <div className="pt-5">
                <LaneHead
                  title="Carried over"
                  lamp="var(--amber)"
                  right={
                    <span className="eyebrow">
                      <Num>{carried.length}</Num> STILL OPEN
                    </span>
                  }
                />
                <div className="grid gap-5 border-t border-line pt-5 md:grid-cols-2">
                  {carried.map((job) => (
                    <JobCard key={job.id} job={job} carriedRow />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
