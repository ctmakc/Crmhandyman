"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Phone, Navigation, Check, Play } from "lucide-react";
import { Empty, Skeleton, spineFor, textToneFor, buttonClass } from "@/components/ui/primitives";
import { toast } from "@/components/ui/Toaster";

interface FieldJob {
  id: string;
  title: string;
  clientName: string;
  address: string;
  phone?: string | null;
  jobType?: string | null;
  status: string;
  scheduledDate?: string | null;
  description?: string | null;
  assignedToId?: string | null;
  equipment?: Array<{ kind: string; brand?: string | null; model?: string | null; serial?: string | null }>;
}

/**
 * Field mode — the screen a tech opens in a driveway with a glove on.
 *
 * Everything here is one tap: call, navigate, start, complete. No filters, no tabs,
 * no forms. Deliberately a separate route rather than a responsive variant of the
 * job list, because the field job is a different job to the dispatcher's.
 */
/**
 * A job booked for a date but no time (contract visits, most bookings) lands on
 * midnight — printing "00:00" reads as a real 12am appointment. Show the day instead,
 * and flag anything carried over from an earlier day.
 */
function slotLabel(scheduled?: string | null) {
  if (!scheduled) return "ANYTIME";
  const d = new Date(scheduled);
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const overdue = d < startOfToday;
  const midnight = d.getHours() === 0 && d.getMinutes() === 0;
  if (overdue)
    return `CARRIED · ${d.toLocaleDateString("en-CA", { day: "2-digit", month: "short" }).toUpperCase()}`;
  if (midnight) return "ANYTIME";
  return d.toLocaleTimeString("en-CA", { hour: "2-digit", minute: "2-digit", hour12: false });
}

export default function TodayPage() {
  const [jobs, setJobs] = useState<FieldJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/today");
    const data = await res.json();
    setJobs(Array.isArray(data) ? data : []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function advance(job: FieldJob) {
    const next = job.status === "SCHEDULED" ? "IN_PROGRESS" : "COMPLETED";
    setBusy(job.id);
    await fetch(`/api/projects/${job.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...job, status: next }),
    });
    setBusy(null);
    toast(next === "IN_PROGRESS" ? "On site" : "Job complete");
    load();
  }

  const today = new Date().toLocaleDateString("en-CA", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });

  const open = jobs.filter((j) => j.status !== "COMPLETED" && j.status !== "CANCELLED");

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

      {loading ? (
        <Skeleton lines={3} />
      ) : jobs.length === 0 ? (
        <Empty>No work booked for today</Empty>
      ) : (
        jobs.map((job) => (
          <div
            key={job.id}
            className="ticket px-4 py-4"
            style={{ ["--spine" as string]: spineFor(job.status) } as React.CSSProperties}
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="mono text-[12px] tracking-[0.06em] text-ink-3">
                {slotLabel(job.scheduledDate)}
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
                className={`${buttonClass("ghost")} h-12 ${job.phone ? "" : "pointer-events-none opacity-40"}`}
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
                  className={`${buttonClass("ghost")} pointer-events-none h-12 opacity-50`}
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
        ))
      )}
    </div>
  );
}
