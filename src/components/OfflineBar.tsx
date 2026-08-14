"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { WifiOff, UploadCloud, X } from "lucide-react";
import {
  adoptIdentity,
  dismissRejection,
  identityOf,
  isReachable,
  purge,
  readOutbox,
  rejectionLine,
  rejectionReason,
  startSync,
  subscribe,
  waitedLabel,
  type Outbox,
} from "@/lib/offline-queue";
import { toast } from "@/components/ui/Toaster";

/**
 * THE OUTBOX STRIP — the honest state of the pipe, on every screen.
 *
 * It exists because work queued in a basement must never be invisible: a tech who taps
 * «Finish» in a dead zone has to see that the tap is held and how long it has been
 * waiting, or he will tap it again on the way out and then ring the office to ask.
 * Silent when there is nothing to say — a permanent banner is a banner nobody reads.
 *
 * It also owns the two pieces of housekeeping that have nowhere better to live: it
 * registers the service worker, and it claims the local storage for THIS session,
 * wiping whatever the previous account left behind on this phone.
 */
export default function OfflineBar() {
  const { data: session, status } = useSession();
  const [online, setOnline] = useState(true);
  const [box, setBox] = useState<Outbox>({ actions: [], rejections: [] });
  // Re-renders the «waiting 12 min» tallies without touching storage.
  const [, tick] = useState(0);

  const refresh = useCallback(() => setBox({ ...readOutbox() }), []);

  /* One workspace, one person, one board. Anything else in storage is not ours. */
  useEffect(() => {
    if (status !== "authenticated") return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const user = session?.user as any;
    const wiped = adoptIdentity(identityOf(user?.tenantId, user?.id));
    if (wiped) {
      navigator.serviceWorker?.controller?.postMessage({ type: "hp-purge" });
    }
    refresh();
  }, [status, session, refresh]);

  /* The service worker: the shell of /today, and the purge on sign-out. */
  useEffect(() => {
    if (!("serviceWorker" in navigator) || !window.isSecureContext) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // No offline shell on this browser; the app itself is unaffected.
    });
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === "hp-wiped") {
        purge();
        refresh();
      }
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [refresh]);

  /* Connection state, the queue bus, and the retry loop. */
  useEffect(() => {
    setOnline(navigator.onLine);
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);

    const unsubscribe = subscribe(refresh);
    const stopSync = startSync((report) => {
      if (report.applied > 0) {
        toast(`${report.applied} queued ${report.applied === 1 ? "action" : "actions"} sent`);
      }
      for (const rejection of report.rejected) toast(rejectionLine(rejection), "bad");
      if (report.jobs) {
        // The board rode back with the batch — let the field screen take it.
        window.dispatchEvent(new CustomEvent("hp:board", { detail: report.jobs }));
      }
    });

    const beat = window.setInterval(() => tick((n) => n + 1), 20_000);

    refresh();
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
      unsubscribe();
      stopSync();
      window.clearInterval(beat);
    };
  }, [refresh]);

  const waiting = box.actions.length;
  const rejections = box.rejections;
  // An interface being up is not a network. What counts is whether the last attempt
  // came back — a phone in a service elevator reports five bars and reaches nothing.
  const live = online && isReachable();

  // Nothing to report: the strip stays out of the way.
  if (live && waiting === 0 && rejections.length === 0) return null;

  const now = Date.now();
  /**
   * ONE GLANCE, ONE STATE.
   *
   * The strip used to report itself in a sentence and leave the state itself to a 6px
   * lamp — from a truck cab that is a line of grey type. The state now has a word of
   * its own, in the recessed chip the rest of the product uses for a fact about a
   * record, and the sentence underneath says what it means for the work.
   *
   * All three states say the true thing for the phone they are actually on: «sending»
   * with an empty outbox, or «being held» with nothing to hold, teaches the crew to
   * stop reading the strip.
   */
  const state = !live ? "OFFLINE" : waiting ? "SENDING" : "TURNED BACK";
  const headline = !live ? (
    waiting ? (
      "Work is being held on this phone"
    ) : (
      "Nothing is reaching the office"
    )
  ) : waiting ? (
    "Sending queued work"
  ) : (
    <>
      <span className="mono">{rejections.length}</span> tap
      {rejections.length === 1 ? "" : "s"} came back from the office
    </>
  );
  const lamp = !live ? "var(--amber)" : waiting ? "var(--sky)" : "var(--rose)";
  const stateTone = !live ? "var(--amber-ink)" : waiting ? "var(--sky-ink)" : "var(--rose-ink)";

  return (
    <div className="border-b border-line bg-sunk px-4 py-2 md:px-6">
      {/* The state and the tally hold the first line; the sentence takes the next one
          on a phone, and the middle of the line on the desk. Three items sharing one
          390px row put the headline on two lines and the count against the edge. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span
          className="chip order-1 flex items-center gap-1.5"
          /* `.chip` is recessed onto `--sunk`, which is this strip's own ground — the
             chip vanished into it. On the strip it sits on the plate instead. */
          style={{ color: stateTone, background: "var(--plate)" }}
        >
          <span
            aria-hidden
            className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ background: lamp }}
          />
          {live ? (
            <UploadCloud className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
          ) : (
            <WifiOff className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
          )}
          {state}
        </span>
        {waiting > 0 && (
          <span
            className="eyebrow order-2 ml-auto shrink-0 sm:order-3 sm:ml-0"
            style={{ color: "var(--ink-2)" }}
          >
            {waiting} WAITING
          </span>
        )}
        {/* ink-3 clears AA on the deck and lands at 4.33 on this recessed strip, so
            the label steps up to ink-2 here. Hierarchy comes from size, not from
            contrast the crew has to squint through in a truck cab. */}
        <span
          className="t-body order-3 w-full min-w-0 sm:order-2 sm:w-auto sm:flex-1"
          style={{ color: "var(--ink-2)" }}
        >
          {headline}
        </span>
      </div>

      {/* Every held tap by name: what it is, which job, how long it has been sitting. */}
      {box.actions.slice(0, 6).map((action) => (
        <div key={action.id} className="mt-1.5 flex items-baseline gap-2 pl-4">
          <span className="eyebrow shrink-0" style={{ color: "var(--amber-ink)" }}>
            {action.to === "COMPLETED" ? "FINISH" : "START"}
          </span>
          <span className="t-meta truncate text-ink-2">{action.jobTitle}</span>
          <span className="eyebrow shrink-0" style={{ color: "var(--ink-2)" }}>
            · WAITING {waitedLabel(now - action.queuedAt)}
          </span>
        </div>
      ))}
      {waiting > 6 && (
        <div className="eyebrow mt-1.5 pl-4" style={{ color: "var(--ink-2)" }}>
          +{waiting - 6} MORE
        </div>
      )}

      {/* A rejected tap stays on screen until a person has read it. Same shape as the
          queued line above, so the strip reads as one list and not as two designs. */}
      {rejections.map((rejection) => (
        <div key={rejection.id} className="mt-1.5 flex flex-wrap items-baseline gap-x-2 pl-4">
          <span className="eyebrow shrink-0" style={{ color: "var(--rose-ink)" }}>
            REJECTED
          </span>
          {/* Which job comes before why: the phone was crushing the title to «Furn…»
              to keep the reason on one line. The reason takes the next line instead. */}
          <span className="t-meta min-w-0 flex-1 truncate text-ink-2">{rejection.jobTitle}</span>
          <span
            className="eyebrow order-last w-full sm:order-none sm:w-auto sm:shrink-0"
            style={{ color: "var(--ink-2)" }}
          >
            {rejectionReason(rejection)}
          </span>
          <button
            onClick={() => {
              dismissRejection(rejection.id);
              refresh();
            }}
            aria-label={`Dismiss — ${rejection.jobTitle}`}
            className="shrink-0 text-ink-3 transition-colors duration-fast ease-instrument hover:text-ink"
          >
            <X className="h-3.5 w-3.5" strokeWidth={2} />
          </button>
        </div>
      ))}
    </div>
  );
}
