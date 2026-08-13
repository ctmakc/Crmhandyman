"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { Phone, Navigation, Check, Play, Clock } from "lucide-react";
import {
  Empty,
  Skeleton,
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
 * midnight — printing "00:00" reads as a real 12am appointment. Show the day instead,
 * and flag anything carried over from a day that is already finished.
 *
 * CARRIED used to be decided by the START date alone, so a four-day renovation was
 * stamped «carried over» every morning from its second day — on a job that is exactly
 * where it should be. A stamp that fires on work running to plan is a stamp the crew
 * learns to scroll past, and then the genuinely missed stop goes unnoticed too. The
 * shared `isCarried` asks whether the RUN is over, which is the real question.
 */
function slotLabel(job: FieldJob) {
  const scheduled = job.scheduledDate;
  if (!scheduled) return "ANYTIME";
  const d = new Date(scheduled);

  // The shared arithmetic reads a job's id, date, run length and status; the field row
  // carries all four under the same names.
  if (isCarried(job))
    return `CARRIED · ${d.toLocaleDateString("en-CA", { day: "2-digit", month: "short" }).toUpperCase()}`;

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

  return (
    <div className="mx-auto max-w-2xl space-y-5 pb-24 md:pb-0">
      <div className="border-b border-line pb-4">
        <div className="eyebrow">Field · {today}</div>
        <h1 className="mt-2 text-[30px] font-black leading-none tracking-tight text-ink">
          Today
        </h1>
        <p className="mt-2 text-[14px] text-ink-2">
          {open.length === 0
            ? "Nothing left on the board."
            : `${open.length} stop${open.length === 1 ? "" : "s"} to go.`}
        </p>
      </div>

      {/* How old the board is. A cached list that does not say so is worse than none. */}
      {source && !source.live && (
        <div className="flex items-center gap-2 border-b border-line pb-2.5">
          <span
            className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ background: "var(--amber)" }}
          />
          <span className="eyebrow" style={{ color: "var(--amber-ink)" }}>
            Board as of {clockLabel(source.at)} · no connection since
          </span>
        </div>
      )}

      {loading ? (
        <Skeleton lines={3} />
      ) : jobs.length === 0 ? (
        <Empty>
          {source === null
            ? "No signal and nothing saved on this phone yet"
            : "No work booked for today"}
        </Empty>
      ) : (
        jobs.map((job) => {
          const pending = pendingFor(job.id);
          const rejection = rejectionFor(job.id);
          return (
            <div
              key={job.id}
              className="ticket px-4 py-4"
              style={{ ["--spine" as string]: spineFor(job.status) } as React.CSSProperties}
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="mono text-[12px] tracking-[0.06em] text-ink-3">
                  {slotLabel(job)}
                </span>
                <span className="eyebrow" style={{ color: textToneFor(job.status) }}>
                  {job.status.replace("_", " ")}
                </span>
              </div>

              <Link href={`/projects/${job.id}`}>
                <p className="mt-2 text-[19px] font-bold leading-tight text-ink">{job.title}</p>
              </Link>
              <p className="mt-1 text-[15px] text-ink-2">{job.clientName}</p>
              <p className="text-[15px] text-ink-2">{job.address}</p>

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
                    <p key={i} className="mt-1 text-[13px] text-ink-2">
                      <span className="mono text-[12px] text-ink-3">
                        {eq.kind.replace(/_/g, " ")}
                      </span>{" "}
                      {[eq.brand, eq.model].filter(Boolean).join(" ")}
                      {eq.serial ? ` · S/N ${eq.serial}` : ""}
                    </p>
                  ))}
                </div>
              )}

              {job.description && (
                <p className="mt-3 border-t border-line pt-2.5 text-[14px] text-ink-2">
                  {job.description}
                </p>
              )}

              {/* One tap each. Targets are 48px tall on purpose. */}
              <div className="mt-4 grid grid-cols-3 gap-2">
                <a
                  href={job.phone ? `tel:${job.phone}` : undefined}
                  aria-disabled={!job.phone}
                  className={`${buttonClass("ghost")} h-12 ${job.phone ? "" : inertLook}`}
                >
                  <Phone className="h-4 w-4" /> Call
                </a>
                <a
                  href={`https://maps.google.com/?q=${encodeURIComponent(job.address)}`}
                  target="_blank"
                  rel="noopener"
                  className={`${buttonClass("ghost")} h-12`}
                >
                  <Navigation className="h-4 w-4" /> Drive
                </a>
                {job.status === "COMPLETED" ? (
                  <span
                    className={`${buttonClass("ghost")} ${inertLook} h-12`}
                  >
                    <Check className="h-4 w-4" /> Done
                  </span>
                ) : (
                  <button
                    disabled={busy === job.id}
                    onClick={() => advance(job)}
                    className={`${buttonClass("primary")} h-12`}
                  >
                    {job.status === "SCHEDULED" ? (
                      <>
                        <Play className="h-4 w-4" /> Start
                      </>
                    ) : (
                      <>
                        <Check className="h-4 w-4" /> Finish
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
