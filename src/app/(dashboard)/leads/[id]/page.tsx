"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Mail, Phone } from "lucide-react";
import {
  BackLink,
  Button,
  buttonClass,
  Chip,
  Empty,
  ErrorNote,
  Field,
  LaneHead,
  Stamp,
  spineFor,
  textToneFor,
  Skeleton,
} from "@/components/ui/primitives";
import { toast } from "@/components/ui/Toaster";
import { LeadClock } from "@/components/LeadClock";
import { decodeLeadAttribution, leadAttributionRows } from "@/lib/lead-attribution";
// The stamp the response clock reads. Written in one place so the two cannot drift.
import { logStamp } from "@/lib/lead-notes";

interface Lead {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  source: string;
  sourceMeta?: string;
  jobType?: string;
  notes?: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  assignedTo?: { id: string; name: string };
  project?: { id: string; title: string; status: string };
}

/**
 * VERIFIED is this screen's word for a vetted lead; the shared SPINE map spells
 * it QUALIFIED. Alias it so the spine and text tones come from the system map.
 */
const toneKey = (s: string) => (s === "VERIFIED" ? "QUALIFIED" : s);

/** The rail the lead climbs. JOB is the CONVERTED end state. */
const LADDER = [
  { status: "NEW", label: "NEW" },
  { status: "CONTACTED", label: "CONTACTED" },
  { status: "VERIFIED", label: "VERIFIED" },
  { status: "CONVERTED", label: "JOB" },
];

/**
 * ONE `notes` COLUMN, TWO WRITERS — and the screen used to print them as one wall.
 *
 * The visitor's quiz lands in `notes` as `Label: value` lines under the channel's
 * name (src/lib/intake.ts), and the desk appends `[13 AUG 09:07] …` lines to the same
 * column. Rendered as one list under the heading CALL LOG, nine answers the customer
 * typed looked exactly like the two calls the desk made, and a dispatcher had to read
 * every sentence to find out what the job even was.
 *
 * Nothing here changes what is stored. It sorts what is already there into what the
 * customer asked for and what the desk has done about it.
 */
type Enquiry = {
  /** «Facebook lead form — Moving quiz» — the first line the intake writes. */
  channel?: string;
  answers: { label: string; value: string }[];
  calls: { stamp: string; text: string }[];
  /** Anything typed free-hand: an old note, a line pasted from an email. */
  prose: string[];
};

function readNotes(notes: string | undefined | null): Enquiry {
  const lines = (notes || "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const out: Enquiry = { answers: [], calls: [], prose: [] };
  for (const line of lines) {
    const stamped = line.match(/^(\[[^\]]*\])\s*(.*)$/);
    if (stamped) {
      out.calls.push({ stamp: stamped[1], text: stamped[2] });
      continue;
    }
    const pair = line.match(/^([^:]{1,48}):\s*(.+)$/);
    if (pair) {
      out.answers.push({ label: pair[1], value: pair[2] });
      continue;
    }
    out.prose.push(line);
  }
  if (out.answers.length && out.prose.length && lines[0] === out.prose[0]) {
    out.channel = out.prose.shift();
  }
  return out;
}

function StatusLadder({ status }: { status: string }) {
  const idx = LADDER.findIndex((s) => s.status === status);
  return (
    <div className="flex items-center gap-3 overflow-x-auto whitespace-nowrap pb-1">
      {LADDER.map((step, i) => {
        const done = idx >= 0 && i < idx;
        const current = i === idx;
        return (
          <Fragment key={step.status}>
            {i > 0 && (
              <span
                aria-hidden="true"
                className="h-px min-w-[20px] flex-1"
                style={{ background: idx >= i ? "var(--emerald-ink)" : "var(--line)" }}
              />
            )}
            <span
              className={`eyebrow shrink-0 ${current ? "font-bold" : ""}`}
              style={{
                color: done
                  ? "var(--emerald-ink)"
                  : current
                    ? textToneFor(toneKey(step.status))
                    : "var(--ink-3)",
              }}
              aria-current={current ? "step" : undefined}
            >
              {step.label}
            </span>
          </Fragment>
        );
      })}
    </div>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 border-b border-line px-1 py-3 sm:flex-row sm:gap-4">
      <span className="eyebrow shrink-0 pt-0.5 sm:w-[168px]">{label}</span>
      <span className="t-lede measure break-words text-ink">{children}</span>
    </div>
  );
}

export default function LeadDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [lead, setLead] = useState<Lead | null>(null);
  const [failed, setFailed] = useState<"missing" | "server" | null>(null);
  const [editing, setEditing] = useState(false);
  const [showConvertModal, setShowConvertModal] = useState(false);
  const [form, setForm] = useState<Partial<Lead>>({});
  const [convertForm, setConvertForm] = useState({
    title: "",
    description: "",
    address: "",
    scheduledDate: "",
    assignedToId: "",
  });
  const [saving, setSaving] = useState(false);
  const [logText, setLogText] = useState("");
  const [logging, setLogging] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  async function fetchLead() {
    const res = await fetch(`/api/leads/${params.id}`);
    if (!res.ok) {
      setFailed(res.status === 404 ? "missing" : "server");
      return;
    }
    setFailed(null);
    const data = await res.json();
    setLead(data);
    setForm(data);
    setConvertForm((prev) => ({
      ...prev,
      title: data.jobType ? `${data.jobType} for ${data.name}` : `Job for ${data.name}`,
      address: data.address || "",
    }));
  }

  useEffect(() => {
    fetchLead();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (
      lead &&
      searchParams.get("convert") === "1" &&
      lead.status === "VERIFIED" &&
      !lead.project
    ) {
      setShowConvertModal(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead?.id]);

  const closeConvert = useCallback(() => {
    setShowConvertModal(false);
    openerRef.current?.focus();
    openerRef.current = null;
  }, []);

  function openConvert(e: React.MouseEvent<HTMLButtonElement>) {
    openerRef.current = e.currentTarget;
    setShowConvertModal(true);
  }

  useEffect(() => {
    if (!showConvertModal) return;
    const box = modalRef.current;
    box?.querySelector<HTMLElement>("input, select, textarea, button")?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        closeConvert();
        return;
      }
      if (e.key !== "Tab" || !box) return;
      const stops = Array.from(
        box.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
      );
      if (stops.length === 0) return;
      const first = stops[0];
      const last = stops[stops.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [showConvertModal, closeConvert]);

  async function handleSave() {
    setSaving(true);
    const res = await fetch(`/api/leads/${params.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    if (!res.ok) {
      toast("Those changes were not saved — no answer from the office", "bad");
      return;
    }
    setEditing(false);
    toast("Lead updated");
    fetchLead();
  }

  async function handleStatusChange(status: string) {
    const res = await fetch(`/api/leads/${params.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      toast("The lead did not move — no answer from the office", "bad");
      return;
    }
    toast(`Lead marked ${status.toLowerCase()}`);
    fetchLead();
  }

  async function handleLogCall(e: React.FormEvent) {
    e.preventDefault();
    const text = logText.trim();
    if (!text || !lead) return;
    setLogging(true);
    const entry = `${logStamp()} ${text}`;
    const notes = lead.notes ? `${lead.notes}\n${entry}` : entry;
    const res = await fetch(`/api/leads/${params.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes }),
    });
    setLogging(false);
    if (!res.ok) {
      toast("The call was not written down — no answer from the office", "bad");
      return;
    }
    setLead({ ...lead, notes });
    setForm((f) => ({ ...f, notes }));
    setLogText("");
    toast("Call logged");
  }

  async function handleConvert(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch(`/api/leads/${params.id}/convert`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(convertForm),
    });
    setSaving(false);

    if (!res.ok) {
      const reason = await res.text();
      toast(reason.includes("Already converted") ? "This lead already has a job" : "Could not open the job");
      return;
    }

    const project = await res.json();
    if (project.id) router.push(`/projects/${project.id}`);
  }

  async function handleDelete() {
    if (!confirm("Delete this lead?")) return;
    await fetch(`/api/leads/${params.id}`, { method: "DELETE" });
    router.push("/leads");
  }

  if (failed) {
    return (
      <div className="page-doc space-y-6 pb-24 md:pb-0">
        <BackLink href="/leads" label="All leads" />
        <ErrorNote
          retry={
            failed === "server" ? (
              <Button variant="ghost" onClick={() => fetchLead()}>
                Try again
              </Button>
            ) : (
              <Link href="/leads" className={buttonClass("ghost")}>
                Back to the call sheet
              </Link>
            )
          }
        >
          {failed === "missing"
            ? "This lead is no longer on the desk — it was deleted, or the link points at another workspace."
            : "This lead did not open — the office did not answer. Press Try again."}
        </ErrorNote>
      </div>
    );
  }

  if (!lead) return <Skeleton lines={4} />;

  const notes = readNotes(lead.notes);
  const attributionRows = leadAttributionRows(decodeLeadAttribution(lead.sourceMeta));
  const whenAsked = notes.answers.find((a) => /when|date|day|time/i.test(a.label));

  return (
    <div className="page-doc space-y-6 pb-24 md:pb-0">
      <BackLink href="/leads" label="All leads" />

      <div
        className="plate px-5 py-5"
        style={{ borderLeft: `4px solid ${spineFor(toneKey(lead.status))}` }}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <span className="mono eyebrow text-ink-3">
              LD-{new Date(lead.createdAt).getFullYear()}-{lead.id.slice(-4).toUpperCase()}
            </span>
            <h1 className="t-record mt-1.5 font-black tracking-tight text-ink">{lead.name}</h1>
            <p className="t-lede mt-2 text-ink-2">
              {[lead.jobType, lead.city].filter(Boolean).join(" · ") || "General inquiry"}
            </p>
          </div>
          <div className="text-left md:text-right">
            <LeadClock lead={lead} />
            <p className="eyebrow mt-2">via {lead.source}</p>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-line pt-4">
          {lead.phone ? (
            <a
              href={`tel:${lead.phone}`}
              className="mono t-record w-full font-bold tracking-[-0.02em] text-ink transition-colors duration-fast ease-instrument hover:text-sky-ink md:w-auto"
            >
              {lead.phone}
            </a>
          ) : (
            <span className="mono t-record w-full text-ink-3 md:w-auto">NO NUMBER</span>
          )}
          <div className="actions flex-1">
            {lead.phone && (
              <a href={`tel:${lead.phone}`} className={buttonClass("primary")}>
                <Phone className="h-3.5 w-3.5" /> Call
              </a>
            )}
            {lead.email && (
              <a href={`mailto:${lead.email}`} className={buttonClass("ghost")}>
                <Mail className="h-3.5 w-3.5" /> Email
              </a>
            )}
          </div>
        </div>
      </div>

      {lead.project && (
        <Link
          href={`/projects/${lead.project.id}`}
          className="ticket ticket-hover block px-4 py-3"
          style={{ ["--spine" as string]: spineFor(lead.project.status) } as React.CSSProperties}
        >
          <div className="eyebrow">Converted to job</div>
          <p className="t-row mt-1.5 font-bold text-ink">{lead.project.title}</p>
          <p className="eyebrow mt-1">{lead.project.status.replace("_", " ")}</p>
        </Link>
      )}

      <section>
        <LaneHead title="Pipeline" />
        <div className="border-t border-line pt-4">
          {lead.status === "REJECTED" ? (
            <span className="mono t-meta inline-block rounded border border-rose-ink px-3 py-1.5 font-bold uppercase tracking-[0.14em] text-rose-ink">
              Rejected
            </span>
          ) : (
            <StatusLadder status={lead.status} />
          )}

          {lead.status !== "CONVERTED" && (
            <div className="actions mt-4">
              {lead.status !== "CONTACTED" && (
                <Button variant="ghost" onClick={() => handleStatusChange("CONTACTED")}>
                  Mark contacted
                </Button>
              )}
              {lead.status !== "VERIFIED" && (
                <Button variant="ghost" onClick={() => handleStatusChange("VERIFIED")}>
                  Mark verified
                </Button>
              )}
              {lead.status === "VERIFIED" && !lead.project && (
                <Button variant="primary" onClick={openConvert}>
                  <ArrowRight className="h-3.5 w-3.5" /> Open a job
                </Button>
              )}
              {lead.status !== "REJECTED" && (
                <Button
                  variant="danger"
                  className="md:ml-auto"
                  onClick={() => handleStatusChange("REJECTED")}
                >
                  Reject
                </Button>
              )}
            </div>
          )}
        </div>
      </section>

      <section>
        <LaneHead
          title="What they asked for"
          right={notes.channel ? <Chip>{notes.channel}</Chip> : undefined}
        />
        <div className="border-t border-line">
          {notes.answers.length === 0 && notes.prose.length === 0 ? (
            <Empty className="pl-1" hint="This one came in without a form — everything known about the job is in the contact block and the call log.">
              No quiz answers on this lead
            </Empty>
          ) : (
            <>
              {notes.answers.map((a, i) => (
                <DetailRow key={i} label={a.label}>
                  {a.value}
                </DetailRow>
              ))}
              {notes.prose.map((line, i) => (
                <div key={i} className="border-b border-line px-1 py-3">
                  <p className="t-lede measure text-ink">{line}</p>
                </div>
              ))}
            </>
          )}
        </div>
      </section>

      {attributionRows.length > 0 && (
        <section>
          <LaneHead title="Attribution" right={<Chip>{lead.source}</Chip>} />
          <div className="border-t border-line">
            {attributionRows.map((row) => (
              <DetailRow key={row.label} label={row.label}>
                {row.value}
              </DetailRow>
            ))}
          </div>
        </section>
      )}

      <section>
        <LaneHead
          title="Contact"
          right={
            <button
              type="button"
              onClick={() => setEditing(!editing)}
              className="eyebrow hover:text-ink"
            >
              {editing ? "Cancel" : "Edit"}
            </button>
          }
        />

        {editing ? (
          <div className="grid grid-cols-1 gap-4 border-t border-line pt-5 sm:grid-cols-2">
            {[
              { label: "Name", key: "name", type: "text" },
              { label: "Phone", key: "phone", type: "tel" },
              { label: "Email", key: "email", type: "email" },
              { label: "Address", key: "address", type: "text" },
              { label: "City", key: "city", type: "text" },
              { label: "Job type", key: "jobType", type: "text" },
            ].map(({ label, key, type }) => (
              <Field key={key} id={`lead-${key}`} label={label}>
                {(f) => (
                  <input
                    {...f}
                    type={type}
                    value={(form as Record<string, string>)[key] || ""}
                    onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                    className={key === "phone" ? `${f.className} mono` : f.className}
                  />
                )}
              </Field>
            ))}
            <Field id="lead-notes" label="Notes" className="sm:col-span-2">
              {(f) => (
                <textarea
                  {...f}
                  rows={3}
                  value={form.notes || ""}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              )}
            </Field>
            <Field id="lead-status" label="Status" className="sm:col-span-2">
              {(f) => (
                <select
                  {...f}
                  value={form.status || lead.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                  className={`${f.className} mono uppercase tracking-[0.06em]`}
                >
                  {["NEW", "CONTACTED", "VERIFIED", "REJECTED"].map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <div className="actions sm:col-span-2">
              <Button variant="primary" onClick={handleSave} disabled={saving}>
                {saving ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="border-t border-line">
            {lead.email && (
              <DetailRow label="Email">
                <a
                  href={`mailto:${lead.email}`}
                  className="mono text-ink underline underline-offset-4"
                >
                  {lead.email}
                </a>
              </DetailRow>
            )}
            {[lead.address, lead.city].filter(Boolean).length > 0 && (
              <DetailRow label="Address">
                {[lead.address, lead.city].filter(Boolean).join(", ")}
              </DetailRow>
            )}
            <DetailRow label="Landed">
              <Stamp date={lead.createdAt} />
            </DetailRow>
          </div>
        )}
      </section>

      <section>
        <LaneHead
          title="Call log"
          right={
            <span className="eyebrow">
              {notes.calls.length === 1 ? "1 call" : `${notes.calls.length} calls`}
            </span>
          }
        />
        <div className="border-t border-line">
          {notes.calls.length === 0 && (
            <Empty className="pl-1" hint="Write down every attempt — no answer, voicemail, call back Tuesday. The stamp on the first line is what the response clock reads.">
              No calls logged yet
            </Empty>
          )}
          {notes.calls.map((call, i) => (
            <p
              key={i}
              className="mono t-meta border-b border-line px-1 py-2.5 leading-snug text-ink"
            >
              <span className="text-ink-3">{call.stamp}</span> {call.text}
            </p>
          ))}
          <form onSubmit={handleLogCall} className="flex items-start gap-2 px-1 py-3">
            <div className="min-w-0 flex-1">
              <label className="sr-only" htmlFor="log-a-call">
                Log a call
              </label>
              <input
                id="log-a-call"
                value={logText}
                onChange={(e) => setLogText(e.target.value)}
                placeholder="No answer, callback Tuesday…"
                className="control"
              />
            </div>
            <Button
              type="submit"
              variant="ghost"
              className="shrink-0"
              disabled={logging || !logText.trim()}
            >
              {logging ? "…" : "Log"}
            </Button>
          </form>
        </div>
      </section>

      {!lead.project && (
        <button onClick={handleDelete} className="eyebrow hover:text-rose-ink">
          Delete lead
        </button>
      )}

      {showConvertModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-900/70 p-4">
          <div
            ref={modalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="convert-lead-title"
            className="plate max-h-full w-full max-w-md overflow-y-auto p-6"
          >
            <div className="eyebrow">New job</div>
            <h2
              id="convert-lead-title"
              className="t-record mt-2 font-black tracking-tight text-ink"
            >
              Open a job
            </h2>
            <form onSubmit={handleConvert} className="mt-5 space-y-4">
              <Field id="convert-title" label="Job title" required>
                {(f) => (
                  <input
                    {...f}
                    value={convertForm.title}
                    onChange={(e) => setConvertForm({ ...convertForm, title: e.target.value })}
                  />
                )}
              </Field>
              <Field id="convert-address" label="Address" required>
                {(f) => (
                  <input
                    {...f}
                    value={convertForm.address}
                    onChange={(e) => setConvertForm({ ...convertForm, address: e.target.value })}
                  />
                )}
              </Field>
              <Field
                id="convert-date"
                label="Scheduled date"
                hint={whenAsked ? `They asked for: ${whenAsked.value}` : undefined}
              >
                {(f) => (
                  <input
                    {...f}
                    type="date"
                    value={convertForm.scheduledDate}
                    onChange={(e) =>
                      setConvertForm({ ...convertForm, scheduledDate: e.target.value })
                    }
                    className={`${f.className} mono`}
                  />
                )}
              </Field>
              <Field id="convert-description" label="Description">
                {(f) => (
                  <textarea
                    {...f}
                    rows={2}
                    value={convertForm.description}
                    onChange={(e) =>
                      setConvertForm({ ...convertForm, description: e.target.value })
                    }
                  />
                )}
              </Field>
              <div className="actions pt-1">
                <Button type="submit" variant="primary" disabled={saving}>
                  {saving ? "Opening…" : "Open job"}
                </Button>
                <Button type="button" variant="ghost" onClick={closeConvert}>
                  Cancel
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
