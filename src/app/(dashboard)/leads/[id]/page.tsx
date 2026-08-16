"use client";

import { Fragment, useEffect, useState, use } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, Mail, Phone, X } from "lucide-react";
import {
  buttonClass,
  spineFor,
  textToneFor,
  Skeleton,
} from "@/components/ui/primitives";
import { toast } from "@/components/ui/Toaster";

interface Lead {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  source: string;
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

const DAY = 86_400_000;

function daysOnSheet(iso: string) {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / DAY));
}

/** The rail the lead climbs. JOB is the CONVERTED end state. */
const LADDER = [
  { status: "NEW", label: "NEW" },
  { status: "CONTACTED", label: "CONTACTED" },
  { status: "VERIFIED", label: "VERIFIED" },
  { status: "CONVERTED", label: "JOB" },
];

/** Log timestamp, built client-side: [04 AUG 14:32]. */
function logStamp() {
  const d = new Date();
  const day = String(d.getDate()).padStart(2, "0");
  const mon = d
    .toLocaleDateString("en-CA", { month: "short" })
    .replace(/\./g, "")
    .toUpperCase();
  const time = d.toLocaleTimeString("en-CA", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return `[${day} ${mon} ${time}]`;
}

/**
 * The status ladder — a horizontal rail of mono eyebrows joined by hairline
 * segments. Done steps read emerald with a filled segment; the current step is
 * bold in its own semantic tone; the future is dim.
 */
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
                style={{
                  background:
                    idx >= i ? "var(--emerald-ink)" : "var(--line)",
                }}
              />
            )}
            <span
              className={`mono shrink-0 text-[11px] uppercase tracking-[0.09em] ${
                current ? "font-bold" : ""
              }`}
              style={{
                color: done
                  ? "var(--emerald-ink)"
                  : current
                    ? textToneFor(toneKey(step.status))
                    : "var(--ink-3)",
                opacity: done || current ? 1 : 0.55,
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

export default function LeadDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = use(props.params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const [lead, setLead] = useState<Lead | null>(null);
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

  async function fetchLead() {
    const res = await fetch(`/api/leads/${params.id}`);
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

  /* Arriving from the sheet's "OPEN JOB →": the convert modal opens itself. */
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

  async function handleSave() {
    setSaving(true);
    await fetch(`/api/leads/${params.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    setEditing(false);
    toast("Lead saved");
    fetchLead();
  }

  async function handleStatusChange(status: string) {
    await fetch(`/api/leads/${params.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    toast(`Lead marked ${status.toLowerCase()}`);
    fetchLead();
  }

  /** Append a stamped line to the call log without touching the rest of notes. */
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
      toast("Could not log the call");
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
    const project = await res.json();
    setSaving(false);
    if (project.id) router.push(`/projects/${project.id}`);
  }

  async function handleDelete() {
    if (!confirm("Delete this lead?")) return;
    await fetch(`/api/leads/${params.id}`, { method: "DELETE" });
    router.push("/leads");
  }

  if (!lead) return <Skeleton lines={4} />;

  const field = "w-full mt-1.5 px-3 py-2 text-[13px]";
  const age = daysOnSheet(lead.createdAt);
  const ageTone = age > 3 ? "var(--rose-ink)" : "var(--ink-3)";
  const logLines = (lead.notes || "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-24 md:pb-0">
      <Link href="/leads" className="eyebrow inline-flex items-center gap-1.5 hover:text-ink">
        <ArrowLeft className="h-3.5 w-3.5" /> All leads
      </Link>

      {/* THE CALL CARD — the header plate. The phone number is the instrument;
          everything else on the plate exists to make this call. */}
      <div
        className="plate px-5 py-5"
        style={{ borderLeft: `4px solid ${spineFor(toneKey(lead.status))}` }}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <span className="mono text-[11px] tracking-[0.08em] text-ink-3">
              LD-{new Date(lead.createdAt).getFullYear()}-{lead.id.slice(-4).toUpperCase()}
            </span>
            <h1 className="mt-1.5 text-[26px] font-black leading-none tracking-tight text-ink">
              {lead.name}
            </h1>
            <p className="mt-2 text-[14px] text-ink-2">
              {[lead.jobType, lead.city].filter(Boolean).join(" · ") || "General inquiry"}
            </p>
          </div>
          <div className="text-right">
            <span
              className="mono text-[11px] font-bold tracking-[0.08em]"
              style={{ color: ageTone }}
            >
              IN THE SHEET {age}D
            </span>
            <p className="eyebrow mt-2">via {lead.source}</p>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-line pt-4">
          {lead.phone ? (
            <a
              href={`tel:${lead.phone}`}
              className="mono text-[24px] font-bold leading-none tracking-[-0.02em] text-ink transition-colors duration-[140ms] ease-instrument hover:text-sky-ink"
            >
              {lead.phone}
            </a>
          ) : (
            <span className="mono text-[24px] leading-none tracking-[-0.02em] text-ink-3">
              NO NUMBER
            </span>
          )}
          <div className="flex items-center gap-2">
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

      {/* THE LADDER — where this lead stands, and the moves available from here.
          A rejected lead gets a stamp instead of a rail. */}
      <section>
        <div className="pb-2.5">
          <h2 className="text-[12px] font-bold uppercase tracking-[0.1em] text-ink">
            Pipeline
          </h2>
        </div>
        <div className="border-t border-line pt-4">
          {lead.status === "REJECTED" ? (
            <span className="mono inline-block rounded border border-rose-ink px-3 py-1.5 text-[12px] font-bold uppercase tracking-[0.14em] text-rose-ink">
              Rejected
            </span>
          ) : (
            <StatusLadder status={lead.status} />
          )}

          {lead.status !== "CONVERTED" && (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {lead.status !== "CONTACTED" && (
                <button
                  onClick={() => handleStatusChange("CONTACTED")}
                  className={buttonClass("ghost")}
                >
                  <Phone className="h-3.5 w-3.5" /> Mark contacted
                </button>
              )}
              {lead.status !== "VERIFIED" && (
                <button
                  onClick={() => handleStatusChange("VERIFIED")}
                  className={buttonClass("ghost")}
                >
                  <Check className="h-3.5 w-3.5" /> Verify
                </button>
              )}
              {lead.status === "VERIFIED" && !lead.project && (
                <button
                  onClick={() => setShowConvertModal(true)}
                  className={buttonClass("primary")}
                >
                  <ArrowRight className="h-3.5 w-3.5" /> Open a job
                </button>
              )}
              {lead.status !== "REJECTED" && (
                <button
                  onClick={() => handleStatusChange("REJECTED")}
                  className={`${buttonClass("danger")} ml-auto`}
                >
                  <X className="h-3.5 w-3.5" /> Reject
                </button>
              )}
            </div>
          )}
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between pb-2.5">
          <h2 className="text-[12px] font-bold uppercase tracking-[0.1em] text-ink">Contact</h2>
          <button onClick={() => setEditing(!editing)} className="eyebrow hover:text-ink">
            {editing ? "Cancel" : "Edit"}
          </button>
        </div>

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
              <div key={key}>
                <label className="eyebrow">{label}</label>
                <input
                  type={type}
                  value={(form as Record<string, string>)[key] || ""}
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                  className={key === "phone" ? `${field} mono` : field}
                />
              </div>
            ))}
            <div className="sm:col-span-2">
              <label className="eyebrow">Notes</label>
              <textarea
                value={form.notes || ""}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={3}
                className={field}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="eyebrow">Status</label>
              <select
                value={form.status || lead.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
                className={`${field} mono uppercase tracking-[0.06em]`}
              >
                {["NEW", "CONTACTED", "VERIFIED", "REJECTED"].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <button onClick={handleSave} disabled={saving} className={buttonClass("primary")}>
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        ) : (
          <div className="border-t border-line">
            {[
              ["Phone", lead.phone, `tel:${lead.phone}`],
              ["Email", lead.email, `mailto:${lead.email}`],
              ["Address", [lead.address, lead.city].filter(Boolean).join(", "), null],
              ["Logged", new Date(lead.createdAt).toLocaleDateString("en-CA"), null],
            ]
              .filter(([, v]) => v)
              .map(([k, v, href]) => (
                <div key={k as string} className="flex gap-4 border-b border-line px-1 py-3">
                  <span className="eyebrow w-[90px] shrink-0 pt-0.5">{k}</span>
                  {href ? (
                    <a
                      href={href as string}
                      className="mono text-[14px] text-ink underline underline-offset-4"
                    >
                      {v}
                    </a>
                  ) : (
                    <span className="text-[14px] text-ink">{v}</span>
                  )}
                </div>
              ))}
          </div>
        )}
      </section>

      {/* THE CALL LOG — notes read as a log; stamped lines are the calls. */}
      <section>
        <div className="pb-2.5">
          <h2 className="text-[12px] font-bold uppercase tracking-[0.1em] text-ink">
            Call log
          </h2>
        </div>
        <div className="border-t border-line">
          {logLines.length === 0 && (
            <p className="border-b border-line px-1 py-3 text-[13px] text-ink-3">
              No calls logged yet.
            </p>
          )}
          {logLines.map((line, i) => {
            const m = line.match(/^(\[[^\]]*\])\s*(.*)$/);
            return m ? (
              <p
                key={i}
                className="mono border-b border-line px-1 py-2.5 text-[12px] leading-snug text-ink"
              >
                <span className="text-ink-3">{m[1]}</span> {m[2]}
              </p>
            ) : (
              <p
                key={i}
                className="border-b border-line px-1 py-2.5 text-[13px] leading-snug text-ink-2"
              >
                {line}
              </p>
            );
          })}
          <form onSubmit={handleLogCall} className="flex gap-2 px-1 py-3">
            <input
              value={logText}
              onChange={(e) => setLogText(e.target.value)}
              placeholder="Log a call — no answer, callback Tuesday…"
              className="w-full px-3 py-2 text-[13px]"
            />
            <button
              type="submit"
              disabled={logging || !logText.trim()}
              className={buttonClass("ghost")}
            >
              {logging ? "…" : "Log"}
            </button>
          </form>
        </div>
      </section>

      {lead.project && (
        <Link
          href={`/projects/${lead.project.id}`}
          className="ticket ticket-hover block px-4 py-3"
          style={{ ["--spine" as string]: spineFor(lead.project.status) } as React.CSSProperties}
        >
          <div className="eyebrow">Converted to job</div>
          <p className="mt-1.5 text-[15px] font-bold text-ink">{lead.project.title}</p>
          <p className="eyebrow mt-1">{lead.project.status.replace("_", " ")}</p>
        </Link>
      )}

      {!lead.project && (
        <button onClick={handleDelete} className="eyebrow hover:text-rose">
          Delete lead
        </button>
      )}

      {showConvertModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-900/70 p-4">
          <div className="plate w-full max-w-md p-6">
            <div className="eyebrow">New work order</div>
            <h2 className="mt-2 text-[22px] font-black leading-none tracking-tight text-ink">
              Open a job
            </h2>
            <form onSubmit={handleConvert} className="mt-5 space-y-4">
              <div>
                <label className="eyebrow">Job title *</label>
                <input
                  required
                  value={convertForm.title}
                  onChange={(e) => setConvertForm({ ...convertForm, title: e.target.value })}
                  className={field}
                />
              </div>
              <div>
                <label className="eyebrow">Address *</label>
                <input
                  required
                  value={convertForm.address}
                  onChange={(e) => setConvertForm({ ...convertForm, address: e.target.value })}
                  className={field}
                />
              </div>
              <div>
                <label className="eyebrow">Scheduled date</label>
                <input
                  type="date"
                  value={convertForm.scheduledDate}
                  onChange={(e) =>
                    setConvertForm({ ...convertForm, scheduledDate: e.target.value })
                  }
                  className={`${field} mono`}
                />
              </div>
              <div>
                <label className="eyebrow">Description</label>
                <textarea
                  value={convertForm.description}
                  onChange={(e) => setConvertForm({ ...convertForm, description: e.target.value })}
                  rows={2}
                  className={field}
                />
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  type="submit"
                  disabled={saving}
                  className={`${buttonClass("primary")} flex-1`}
                >
                  {saving ? "Opening…" : "Open job"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowConvertModal(false)}
                  className={`${buttonClass("ghost")} flex-1`}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
