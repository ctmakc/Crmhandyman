"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Phone, Plus, Search, X } from "lucide-react";
import {
  PageHead,
  Row,
  Lane,
  LaneHead,
  WoNumber,
  Empty,
  Plate,
  buttonClass,
  Skeleton,
  spineFor,
  textToneFor,
} from "@/components/ui/primitives";
import { toast } from "@/components/ui/Toaster";
import { LeadWait } from "@/components/LeadClock";
import { waitRank } from "@/lib/lead-clock";

interface Lead {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  city?: string;
  source: string;
  jobType?: string;
  status: string;
  createdAt: string;
  /** Both feed the response clock: the first touch is read out of them. */
  updatedAt?: string;
  notes?: string;
  assignedTo?: { name: string };
  project?: { id: string; title: string; status: string };
}

/* The pipeline, in the order a lead walks it. */
const STAGES = ["NEW", "CONTACTED", "VERIFIED", "CONVERTED", "REJECTED"];
const SOURCES = [
  "MANUAL",
  "FACEBOOK",
  "INSTAGRAM",
  "GOOGLE",
  "HOMESTARS",
  "KIJIJI",
  "EMAIL",
  "OTHER",
];

/**
 * VERIFIED is this screen's word for a vetted lead; the shared SPINE map spells
 * it QUALIFIED. Alias it so the spine and text tones come from the system map
 * instead of falling through to neutral slate.
 */
const toneKey = (s: string) => (s === "VERIFIED" ? "QUALIFIED" : s);

const field =
  "w-full mt-1.5 px-3 py-2 text-[13px] text-ink placeholder:text-ink-3";
const label = "eyebrow";

/* Inline outcome buttons — the dispatcher works the sheet without opening
   records. Same button language as buttonClass, compressed to row scale. */
const act =
  "mono rounded border border-line bg-plate px-2 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-ink-2 transition-colors duration-[140ms] ease-instrument hover:border-ink-3 hover:text-ink";
const actQuiet =
  "mono rounded px-2 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-ink-3 transition-colors duration-[140ms] ease-instrument hover:text-rose-ink";
const actPrimary =
  "mono rounded border border-navy-900 bg-navy-900 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-plate transition-colors duration-[140ms] ease-instrument hover:bg-navy-800";

export default function LeadsPage() {
  const router = useRouter();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  /* The row that just changed state gets the ticket-snap for one beat. */
  const [snapId, setSnapId] = useState<string | null>(null);
  const snapTimer = useRef<number>();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    address: "",
    city: "",
    source: "MANUAL",
    jobType: "",
    notes: "",
  });

  /* Search and source narrow the sheet server-side. Status stays client-side:
     the pipeline rail needs every stage's count to stay live, so filtering a
     stage must not empty the other stages' numbers. */
  async function fetchLeads() {
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    if (sourceFilter) params.set("source", sourceFilter);
    const res = await fetch(`/api/leads?${params}`);
    const data = await res.json();
    setLeads(data);
    setLoading(false);
  }

  useEffect(() => {
    fetchLeads();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, sourceFilter]);

  useEffect(() => () => window.clearTimeout(snapTimer.current), []);

  /**
   * An inline outcome: PUT the new status, then move the row locally. No
   * refetch — the dispatcher's search text, focus and scroll must survive
   * working the sheet.
   */
  async function setOutcome(
    e: React.MouseEvent,
    lead: Lead,
    status: string,
    note: string
  ) {
    e.preventDefault();
    e.stopPropagation();
    const res = await fetch(`/api/leads/${lead.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      toast("Could not update the lead");
      return;
    }
    setLeads((prev) => prev.map((l) => (l.id === lead.id ? { ...l, status } : l)));
    toast(note);
    window.clearTimeout(snapTimer.current);
    setSnapId(lead.id);
    snapTimer.current = window.setTimeout(() => setSnapId(null), 240);
  }

  /** Jump into the record with the convert modal armed. */
  function openJob(e: React.MouseEvent, id: string) {
    e.preventDefault();
    e.stopPropagation();
    router.push(`/leads/${id}?convert=1`);
  }

  async function handleAddLead(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setShowAddForm(false);
    toast("Lead logged");
    setForm({
      name: "",
      phone: "",
      email: "",
      address: "",
      city: "",
      source: "MANUAL",
      jobType: "",
      notes: "",
    });
    fetchLeads();
  }

  const now = Date.now();
  const total = leads.length;
  const counts: Record<string, number> = {};
  for (const l of leads) counts[l.status] = (counts[l.status] || 0) + 1;

  const visible = statusFilter
    ? leads.filter((l) => l.status === statusFilter)
    : leads;

  /* Left lane — the call sheet, sorted by the response clock: everything still worth
     calling first, longest wait on top, then the unanswered leads that have gone cold,
     then the ones already worked. Age used to order this lane, which put a three-day-old
     answered lead above a fresh unanswered one; ordering purely by wait then handed the
     top of the sheet to a four-month-old row for good. */
  const callSheet = visible
    .filter((l) => l.status === "NEW" || l.status === "CONTACTED")
    .sort((a, b) => waitRank(b, now) - waitRank(a, now));

  /* Right lane — worked. Verified up top, the closed book compressed below. */
  const verified = visible.filter((l) => l.status === "VERIFIED");
  const closed = visible.filter(
    (l) => l.status === "CONVERTED" || l.status === "REJECTED"
  );

  return (
    <div className="space-y-8 pb-24 md:pb-0">
      <PageHead
        eyebrow="Intake"
        title="Leads"
        sub="The morning call sheet: who to phone back, and what has been worked."
        action={
          <button
            onClick={() => setShowAddForm((v) => !v)}
            className={buttonClass("primary")}
          >
            {showAddForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {showAddForm ? "Close" : "New lead"}
          </button>
        }
      />

      {/* THE PIPELINE RAIL — the stage strip. Counts + share bars over one
          continuous rule; clicking a stage filters the sheet to it. */}
      <div className="border-b border-line pb-5">
        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-5">
          <div className="flex flex-wrap items-end gap-x-8 gap-y-5">
            {STAGES.map((stage) => {
              const count = counts[stage] || 0;
              const pct = total ? (count / total) * 100 : 0;
              const active = statusFilter === stage;
              const dimmed = statusFilter !== "" && !active;
              return (
                <button
                  key={stage}
                  type="button"
                  aria-pressed={active}
                  onClick={() =>
                    setStatusFilter((v) => (v === stage ? "" : stage))
                  }
                  className="text-left transition-opacity duration-[140ms] ease-instrument"
                  style={{ opacity: dimmed ? 0.35 : 1 }}
                >
                  <span
                    className="eyebrow block"
                    style={
                      active
                        ? { color: textToneFor(toneKey(stage)) }
                        : undefined
                    }
                  >
                    {stage}
                  </span>
                  <span className="mono mt-1.5 block text-[26px] font-bold leading-none tracking-[-0.03em] text-ink">
                    {loading ? "–" : count}
                  </span>
                  <span className="mt-2 block h-[3px] w-16 bg-sunk">
                    <span
                      className="block h-full transition-[width] duration-[180ms] ease-instrument"
                      style={{
                        width: `${pct}%`,
                        background: spineFor(toneKey(stage)),
                      }}
                    />
                  </span>
                </button>
              );
            })}
          </div>

          {/* Search and source fold into the rail — small, right-aligned. */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full max-w-[240px]">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-3"
                strokeWidth={2}
              />
              <input
                type="text"
                placeholder="Search the sheet…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full py-1.5 pl-8 pr-3 text-[13px]"
              />
            </div>
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              className="mono px-2.5 py-1.5 text-[11px] uppercase tracking-[0.06em]"
            >
              <option value="">All sources</option>
              {SOURCES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {showAddForm && (
        <Plate className="p-5">
          <div className="eyebrow">New intake ticket</div>
          <form
            onSubmit={handleAddLead}
            className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2"
          >
            <div>
              <label className={label}>Name *</label>
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className={field}
              />
            </div>
            <div>
              <label className={label}>Phone</label>
              <input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className={`${field} mono`}
              />
            </div>
            <div>
              <label className={label}>Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className={field}
              />
            </div>
            <div>
              <label className={label}>City</label>
              <input
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
                className={field}
              />
            </div>
            <div>
              <label className={label}>Job type</label>
              <input
                value={form.jobType}
                onChange={(e) => setForm({ ...form, jobType: e.target.value })}
                placeholder="Furnace install, 2-bedroom move…"
                className={field}
              />
            </div>
            <div>
              <label className={label}>Source</label>
              <select
                value={form.source}
                onChange={(e) => setForm({ ...form, source: e.target.value })}
                className={`${field} mono uppercase tracking-[0.06em]`}
              >
                {SOURCES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className={label}>Notes</label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={2}
                className={field}
              />
            </div>
            <div className="flex gap-2 sm:col-span-2">
              <button type="submit" className={buttonClass("primary")}>
                Log lead
              </button>
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className={buttonClass("ghost")}
              >
                Cancel
              </button>
            </div>
          </form>
        </Plate>
      )}

      {/* THE SHEET — 7/5 split: the calls to make vs the leads already worked,
          divided by a single vertical rule. */}
      <div className="grid grid-cols-1 gap-y-10 lg:grid-cols-[7fr_5fr]">
        {/* ON THE PHONE — fresh and aging calls, most urgent on top. */}
        <section className="lg:pr-10">
          <LaneHead
            title="On the phone"
            lamp="var(--amber)"
            right={
              <span className="eyebrow">
                {loading ? "" : `${callSheet.length} to call`}
              </span>
            }
          />
          {loading ? (
            <Skeleton lines={4} />
          ) : callSheet.length === 0 ? (
            <Lane>
              <Empty>No calls waiting — the sheet is clear</Empty>
            </Lane>
          ) : (
            <Lane>
              {callSheet.map((lead) => (
                <Row
                  key={lead.id}
                  status={toneKey(lead.status)}
                  className={lead.id === snapId ? "ticket-snap" : undefined}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      {lead.phone ? (
                        <a
                          href={`tel:${lead.phone}`}
                          className="mono inline-flex items-center gap-1.5 text-[16px] font-bold tracking-[-0.01em] text-ink transition-colors duration-[140ms] ease-instrument hover:text-sky-ink"
                        >
                          <Phone
                            className="h-3.5 w-3.5 shrink-0 text-ink-3"
                            strokeWidth={2}
                          />
                          {lead.phone}
                        </a>
                      ) : (
                        <span className="mono text-[16px] tracking-[-0.01em] text-ink-3">
                          NO NUMBER
                        </span>
                      )}
                      <Link
                        href={`/leads/${lead.id}`}
                        className="mt-1 block truncate text-[15px] font-bold leading-tight text-ink hover:underline"
                      >
                        {lead.name}
                      </Link>
                      <p className="mt-0.5 truncate text-[13px] text-ink-2">
                        {[lead.jobType, lead.city, lead.source]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    <LeadWait lead={lead} />
                  </div>
                  {/* The outcome cluster — under the tally on desktop, wrapping
                      below the detail line on a phone. */}
                  <div className="mt-2 flex flex-wrap items-center justify-end gap-1.5">
                    {lead.status === "NEW" && (
                      <button
                        type="button"
                        className={act}
                        onClick={(e) =>
                          setOutcome(e, lead, "CONTACTED", "Marked contacted")
                        }
                      >
                        Contacted
                      </button>
                    )}
                    <button
                      type="button"
                      className={act}
                      onClick={(e) =>
                        setOutcome(e, lead, "VERIFIED", "Lead verified")
                      }
                    >
                      Verify
                    </button>
                    <button
                      type="button"
                      className={actQuiet}
                      onClick={(e) =>
                        setOutcome(e, lead, "REJECTED", "Lead rejected")
                      }
                    >
                      Reject
                    </button>
                  </div>
                </Row>
              ))}
            </Lane>
          )}
        </section>

        {/* WORKED — verified up top, the closed book compressed below. */}
        <section className="lg:border-l lg:border-line lg:pl-10">
          <LaneHead
            title="Worked"
            right={
              <span className="eyebrow">
                {loading ? "" : `${verified.length + closed.length} leads`}
              </span>
            }
          />
          {loading ? (
            <Skeleton lines={3} />
          ) : verified.length === 0 && closed.length === 0 ? (
            <Lane>
              <Empty>Nothing worked yet</Empty>
            </Lane>
          ) : (
            <Lane>
              {verified.map((lead) => (
                <Row
                  key={lead.id}
                  href={`/leads/${lead.id}`}
                  status={toneKey(lead.status)}
                  className={lead.id === snapId ? "ticket-snap" : undefined}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="truncate text-[15px] font-bold leading-tight text-ink">
                      {lead.name}
                    </p>
                    <WoNumber id={lead.id} prefix="LD" date={lead.createdAt} />
                  </div>
                  <p className="mt-1 flex items-baseline gap-x-2 text-[13px] text-ink-2">
                    {lead.phone && (
                      <span className="mono shrink-0">{lead.phone}</span>
                    )}
                    <span className="truncate">
                      {[lead.jobType, lead.city].filter(Boolean).join(" · ")}
                    </span>
                  </p>
                  {/* The reading stays on a worked lead: it is the proof the desk is
                      fast, and the only place that number can be seen afterwards. */}
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <LeadWait lead={lead} />
                    <button
                      type="button"
                      className={actPrimary}
                      onClick={(e) => openJob(e, lead.id)}
                    >
                      Open job →
                    </button>
                  </div>
                </Row>
              ))}
              {verified.length > 0 && closed.length > 0 && (
                <div className="px-5 pb-1.5 pt-4">
                  <span className="eyebrow">Closed</span>
                </div>
              )}
              {closed.map((lead) => (
                <Row
                  key={lead.id}
                  href={`/leads/${lead.id}`}
                  status={lead.status}
                  className={lead.id === snapId ? "ticket-snap" : undefined}
                >
                  <div className="flex items-baseline gap-3">
                    <span className="truncate text-[13px] text-ink-3">
                      {lead.name}
                    </span>
                    <span
                      className="eyebrow ml-auto shrink-0"
                      style={{ color: textToneFor(lead.status) }}
                    >
                      {lead.status}
                    </span>
                    {lead.status === "CONVERTED" && lead.project && (
                      <button
                        type="button"
                        className="mono shrink-0 text-[11px] tracking-[0.06em] text-sky-ink hover:underline"
                        title={lead.project.title}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          router.push(`/projects/${lead.project!.id}`);
                        }}
                      >
                        → WO
                      </button>
                    )}
                  </div>
                </Row>
              ))}
            </Lane>
          )}
        </section>
      </div>
    </div>
  );
}
