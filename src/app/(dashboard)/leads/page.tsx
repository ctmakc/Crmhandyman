"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Phone, Plus, X } from "lucide-react";
import {
  PageHead,
  Row,
  Lane,
  LaneHead,
  WoNumber,
  Empty,
  Plate,
  Field,
  Button,
  controlClass,
  Skeleton,
  StatTile,
  MeterBar,
  spineFor,
  textToneFor,
} from "@/components/ui/primitives";
import { toast } from "@/components/ui/Toaster";
import { LeadWait } from "@/components/LeadClock";
import { responseOf, waitRank, waitShort, STALE_MS } from "@/lib/lead-clock";
import { LEAD_SOURCES } from "@/lib/enums";

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
const SOURCES = [...LEAD_SOURCES];

/**
 * VERIFIED is this screen's word for a vetted lead; the shared SPINE map spells
 * it QUALIFIED. Alias it so the spine and text tones come from the system map
 * instead of falling through to neutral slate.
 */
const toneKey = (s: string) => (s === "VERIFIED" ? "QUALIFIED" : s);

/**
 * THE THREE BANDS OF THE CALL SHEET.
 *
 * `waitRank` already sorts the lane into them — still winnable, gone quiet, already
 * called — and the screen used to draw all three as one undivided list. A lead from
 * April then looked exactly like a lead from nine minutes ago, and the head counted
 * both into «8 to call». The arithmetic is untouched; the bands are now visible, and
 * only the top one is counted as work for this morning.
 */
type Band = "live" | "cold" | "called";

function bandOf(lead: Lead, now: number): Band {
  const r = responseOf(lead, now);
  if (r.answered) return "called";
  return r.ms < STALE_MS ? "live" : "cold";
}

/**
 * THE SOURCE MIX RAMP.
 *
 * Where a lead came from carries no status — FACEBOOK is not "better" than GOOGLE — so the
 * strip is drawn in a neutral ink ramp, biggest channel darkest, never in the status hues.
 * Colour on this desk means state; a channel is not a state, so it takes ink, not a lamp.
 */
const SOURCE_RAMP = [
  "var(--ink)",
  "var(--ink-2)",
  "var(--slate)",
  "var(--ink-3)",
  "var(--field-line)",
  "var(--line)",
];
const rampTone = (i: number) => SOURCE_RAMP[Math.min(i, SOURCE_RAMP.length - 1)];

/** The middle reading of a set — the typical callback wait, not the average an outlier drags. */
function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** A mono divider inside a lane — the same one the worked lane uses for CLOSED. */
function BandRule({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-5 pb-1.5 pt-6">
      <span className="eyebrow">{children}</span>
    </div>
  );
}

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
  const [saving, setSaving] = useState(false);
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
      toast(`${lead.name} did not move — no answer from the office`, "bad");
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
    setSaving(true);
    const res = await fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    /* The form used to close and say «Lead logged» whatever came back, so a
       refused write left the owner believing the number was on the sheet. */
    if (!res.ok) {
      toast(`${form.name || "That lead"} was not saved — nothing was written down`);
      return;
    }
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

  const visible = statusFilter ? leads.filter((l) => l.status === statusFilter) : leads;

  const narrowed = search !== "" || sourceFilter !== "" || statusFilter !== "";

  /* Left lane — the call sheet, sorted by the response clock: everything still worth
     calling first, longest wait on top, then the unanswered leads that have gone cold,
     then the ones already worked. Age used to order this lane, which put a three-day-old
     answered lead above a fresh unanswered one; ordering purely by wait then handed the
     top of the sheet to a four-month-old row for good. */
  const callSheet = visible
    .filter((l) => l.status === "NEW" || l.status === "CONTACTED")
    .sort((a, b) => waitRank(b, now) - waitRank(a, now));

  const live = callSheet.filter((l) => bandOf(l, now) === "live");
  const cold = callSheet.filter((l) => bandOf(l, now) === "cold");
  const called = callSheet.filter((l) => bandOf(l, now) === "called");

  /* Right lane — worked. Verified up top, the closed book compressed below. */
  const verified = visible.filter((l) => l.status === "VERIFIED");
  const closed = visible.filter((l) => l.status === "CONVERTED" || l.status === "REJECTED");

  /* ------------------------------------------------------------------ INSTRUMENTS
     Two readings sit above the sheet. The response gauge is the one number the shop
     moves by working harder today; the source strip says which channel is paying. */

  // The median callback wait across every lead that has actually been answered — the
  // fresh, unanswered rows are still a running clock, not a response time yet.
  const answeredMs = leads
    .map((l) => responseOf(l, now))
    .filter((r) => r.answered)
    .map((r) => r.ms);
  const answeredCount = answeredMs.length;
  const medianMs = median(answeredMs);
  const respMin = medianMs / 60_000;
  const respTone =
    answeredCount === 0
      ? undefined
      : respMin < 60
        ? "var(--emerald-ink)"
        : respMin < 240
          ? "var(--amber-ink)"
          : "var(--rose-ink)";

  // The channel mix of what is on the desk, biggest first — drawn in the neutral ramp.
  const sourceCounts: Record<string, number> = {};
  for (const l of leads) sourceCounts[l.source] = (sourceCounts[l.source] || 0) + 1;
  const sourceRows = Object.entries(sourceCounts).sort((a, b) => b[1] - a[1]);
  const sourceSegments = sourceRows.map(([s, c], i) => ({
    value: c,
    tone: rampTone(i),
    label: s,
  }));

  function clearFilters() {
    setSearch("");
    setSourceFilter("");
    setStatusFilter("");
  }

  /** One row of the call sheet. */
  function CallRow({ lead }: { lead: Lead }) {
    return (
      <Row
        status={toneKey(lead.status)}
        className={`relative hover:!bg-sunk ${lead.id === snapId ? "ticket-snap" : ""}`}
      >
        <Link
          href={`/leads/${lead.id}`}
          className="absolute inset-0"
          aria-label={`Open the lead card for ${lead.name}`}
        />
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="t-row truncate font-bold leading-tight text-ink">{lead.name}</p>
            {lead.phone ? (
              <a
                href={`tel:${lead.phone}`}
                className="mono t-record relative z-[1] mt-1 inline-flex items-center gap-1.5 font-bold tracking-[-0.01em] text-ink transition-colors duration-fast ease-instrument hover:text-sky-ink"
              >
                <Phone className="h-3.5 w-3.5 shrink-0 text-ink-3" strokeWidth={2} />
                {lead.phone}
              </a>
            ) : (
              <span className="mono t-record mt-1 block text-ink-3">NO NUMBER</span>
            )}
          </div>
          <LeadWait lead={lead} />
        </div>
        <div className="mt-1.5 flex flex-col gap-2 md:flex-row md:items-end md:justify-between md:gap-4">
          <p className="t-body min-w-0 truncate text-ink-2 md:flex-1">
            {[lead.jobType, lead.city, lead.source].filter(Boolean).join(" · ")}
          </p>
          <div className="relative z-[1] flex flex-wrap items-center justify-end gap-1.5">
            {lead.status === "NEW" && (
              <Button
                variant="quiet"
                onClick={(e) => setOutcome(e, lead, "CONTACTED", `${lead.name} marked contacted`)}
              >
                Contacted
              </Button>
            )}
            <Button
              variant="quiet"
              onClick={(e) => setOutcome(e, lead, "VERIFIED", `${lead.name} marked verified`)}
            >
              Verified
            </Button>
            <Button
              variant="quiet"
              className="hover:border-rose-ink hover:text-rose-ink"
              onClick={(e) => setOutcome(e, lead, "REJECTED", `${lead.name} marked rejected`)}
            >
              Reject
            </Button>
          </div>
        </div>
      </Row>
    );
  }

  return (
    <div className="space-y-8 pb-24 md:pb-0">
      <PageHead
        eyebrow="Intake"
        title="Leads"
        sub="The morning call sheet: who to phone back, and what has been worked."
        action={
          <Button variant="primary" onClick={() => setShowAddForm((v) => !v)}>
            {showAddForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {showAddForm ? "Close" : "New lead"}
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,220px)_1fr] sm:gap-4">
        <StatTile
          label="Median response"
          value={medianMs}
          format={(n) => (answeredCount === 0 ? "—" : waitShort(n))}
          tone={respTone}
          foot={
            <p className="eyebrow leading-relaxed">
              {answeredCount} answered
              {live.length > 0 ? ` · ${live.length} still waiting` : ""}
            </p>
          }
        />
        <div className="plate px-4 py-3.5">
          <span className="eyebrow">Where they come from</span>
          <div className="mt-3.5">
            <MeterBar height={10} segments={sourceSegments} ariaLabel="Share of leads by source" />
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
            {sourceRows.map(([s, c], i) => (
              <span key={s} className="inline-flex items-center gap-1.5">
                <span
                  aria-hidden
                  className="inline-block h-2 w-2 shrink-0"
                  style={{ background: rampTone(i) }}
                />
                <span className="eyebrow">{s}</span>
                <span className="mono t-meta tabular-nums text-ink-2">{c}</span>
              </span>
            ))}
            {sourceRows.length === 0 && (
              <span className="eyebrow">{loading ? "Reading the desk…" : "No leads on the desk"}</span>
            )}
          </div>
        </div>
      </div>

      <div className="border-b border-line pb-5">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-5">
          <div className="flex flex-wrap items-end gap-x-2 gap-y-4 md:gap-x-8 md:gap-y-5">
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
                  onClick={() => setStatusFilter((v) => (v === stage ? "" : stage))}
                  className="text-left transition-opacity duration-fast ease-instrument"
                  style={{ opacity: dimmed ? 0.55 : 1 }}
                >
                  <span
                    className="eyebrow block"
                    style={active ? { color: textToneFor(toneKey(stage)) } : undefined}
                  >
                    {stage}
                  </span>
                  <span className="mono t-readout mt-1.5 block font-bold tracking-[-0.03em] text-ink">
                    {loading ? "–" : count}
                  </span>
                  <span className="mt-2 block h-[3px] w-12 bg-sunk md:w-16">
                    <span
                      className="block h-full transition-[width] duration-instrument ease-instrument"
                      style={{ width: `${pct}%`, background: spineFor(toneKey(stage)) }}
                    />
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex w-full items-center gap-2 md:w-auto">
            <div className="min-w-0 flex-1 md:w-[240px] md:flex-none">
              <label className="sr-only" htmlFor="lead-search">
                Search the sheet
              </label>
              <input
                id="lead-search"
                type="search"
                placeholder="Search name, phone or job"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className={controlClass()}
              />
            </div>
            <div className="w-[132px] shrink-0 md:w-[150px]">
              <label className="sr-only" htmlFor="lead-source-filter">
                Filter by source
              </label>
              <select
                id="lead-source-filter"
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value)}
                className={controlClass("mono uppercase tracking-[0.06em]")}
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
      </div>

      {showAddForm && (
        <Plate className="p-5">
          <div className="eyebrow">New intake ticket</div>
          <form onSubmit={handleAddLead} className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field id="new-lead-name" label="Name" required>
              {(f) => (
                <input {...f} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              )}
            </Field>
            <Field id="new-lead-phone" label="Phone">
              {(f) => (
                <input
                  {...f}
                  type="tel"
                  inputMode="tel"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className={`${f.className} mono`}
                />
              )}
            </Field>
            <Field id="new-lead-email" label="Email">
              {(f) => (
                <input
                  {...f}
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              )}
            </Field>
            <Field id="new-lead-city" label="City">
              {(f) => (
                <input {...f} value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
              )}
            </Field>
            <Field id="new-lead-jobtype" label="Job type">
              {(f) => (
                <input
                  {...f}
                  placeholder="Furnace install, 2-bedroom move…"
                  value={form.jobType}
                  onChange={(e) => setForm({ ...form, jobType: e.target.value })}
                />
              )}
            </Field>
            <Field id="new-lead-source" label="Source">
              {(f) => (
                <select
                  {...f}
                  value={form.source}
                  onChange={(e) => setForm({ ...form, source: e.target.value })}
                  className={`${f.className} mono uppercase tracking-[0.06em]`}
                >
                  {SOURCES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Field id="new-lead-notes" label="What they asked for" className="sm:col-span-2">
              {(f) => (
                <textarea
                  {...f}
                  rows={2}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              )}
            </Field>
            <div className="actions sm:col-span-2">
              <Button type="submit" variant="primary" disabled={saving}>
                {saving ? "Logging…" : "Log lead"}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setShowAddForm(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </Plate>
      )}

      <div className="grid grid-cols-1 gap-y-10 lg:grid-cols-[7fr_5fr] lg:gap-x-8">
        <section className="min-w-0">
          <div className="plate overflow-hidden">
            <div className="px-4 pt-3.5">
              <LaneHead
                title="On the phone"
                lamp="var(--amber)"
                right={
                  <span className="eyebrow">
                    {loading ? "" : `${live.length} fresh${cold.length ? ` · ${cold.length} gone cold` : ""}`}
                  </span>
                }
              />
            </div>
            {loading ? (
              <div className="border-t border-line px-1 pt-1">
                <Skeleton lines={4} />
              </div>
            ) : callSheet.length === 0 ? (
              <Lane>
                {narrowed ? (
                  <Empty
                    hint="The search box, the source list and the stage you picked decide what shows here. The search itself runs over the name, the phone and the job."
                    action={
                      <Button variant="ghost" onClick={clearFilters}>
                        Clear search
                      </Button>
                    }
                  >
                    No lead matches that
                  </Empty>
                ) : total === 0 ? (
                  <Empty
                    hint="Nothing has come in yet. Leads land here by themselves once the ad form or the website quiz posts to your intake link — and you can write one down by hand the moment the phone rings."
                    action={
                      <Button variant="ghost" onClick={() => setShowAddForm(true)}>
                        Log a lead by hand
                      </Button>
                    }
                  >
                    No leads yet
                  </Empty>
                ) : (
                  <Empty hint="Every lead on the desk has been worked. New ones land at the top of this lane the minute they come in.">
                    Nobody is waiting for a call
                  </Empty>
                )}
              </Lane>
            ) : (
              <Lane>
                {live.length === 0 && (
                  <Empty hint="Everything below came in more than two days ago or has already been called.">
                    Nobody fresh is waiting
                  </Empty>
                )}
                {live.map((lead) => (
                  <CallRow key={lead.id} lead={lead} />
                ))}

                {cold.length > 0 && <BandRule>Gone cold · nobody here has called back for 2 days</BandRule>}
                {cold.map((lead) => (
                  <CallRow key={lead.id} lead={lead} />
                ))}

                {called.length > 0 && <BandRule>Called already · waiting on them</BandRule>}
                {called.map((lead) => (
                  <CallRow key={lead.id} lead={lead} />
                ))}
              </Lane>
            )}
          </div>
        </section>

        <section className="min-w-0 lg:pt-1">
          <LaneHead title="Worked" count={loading ? undefined : verified.length + closed.length} unit="lead" />
          {loading ? (
            <Skeleton lines={3} />
          ) : verified.length === 0 && closed.length === 0 ? (
            <Lane>
              {narrowed ? (
                <Empty hint="Clear the search, the source and the stage to see the leads that have been worked.">
                  No worked lead matches this filter
                </Empty>
              ) : (
                <Empty hint="A lead moves over here the moment you mark it contacted, verified or rejected on the call sheet.">
                  Nothing worked yet
                </Empty>
              )}
            </Lane>
          ) : (
            <Lane>
              {verified.map((lead) => (
                <Row
                  key={lead.id}
                  status={toneKey(lead.status)}
                  className={`relative ${lead.id === snapId ? "ticket-snap" : ""}`}
                >
                  <Link
                    href={`/leads/${lead.id}`}
                    className="absolute inset-0"
                    aria-label={`Open the lead card for ${lead.name}`}
                  />
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="t-row truncate font-bold leading-tight text-ink">{lead.name}</p>
                    <WoNumber id={lead.id} prefix="LD" date={lead.createdAt} />
                  </div>
                  <p className="t-body mt-1 flex items-baseline gap-x-2 text-ink-2">
                    {lead.phone && (
                      <a
                        href={`tel:${lead.phone}`}
                        className="mono relative z-[1] shrink-0 text-ink hover:text-sky-ink"
                      >
                        {lead.phone}
                      </a>
                    )}
                    <span className="truncate">{[lead.jobType, lead.city].filter(Boolean).join(" · ")}</span>
                  </p>
                  <div className="relative z-[1] mt-2 flex items-end justify-between gap-3">
                    <LeadWait lead={lead} compact />
                    <Button variant="primary" onClick={(e) => openJob(e, lead.id)}>
                      Open job →
                    </Button>
                  </div>
                </Row>
              ))}
              {verified.length > 0 && closed.length > 0 && <BandRule>Closed</BandRule>}
              {closed.map((lead) => (
                <Row
                  key={lead.id}
                  status={lead.status}
                  className={`relative ${lead.id === snapId ? "ticket-snap" : ""}`}
                >
                  <Link
                    href={`/leads/${lead.id}`}
                    className="absolute inset-0"
                    aria-label={`Open the lead card for ${lead.name}`}
                  />
                  <div className="flex items-baseline gap-3">
                    <span className="t-body truncate text-ink-2">{lead.name}</span>
                    <span className="eyebrow ml-auto shrink-0" style={{ color: textToneFor(lead.status) }}>
                      {lead.status}
                    </span>
                    {lead.status === "CONVERTED" && lead.project && (
                      <Link
                        href={`/projects/${lead.project.id}`}
                        className="eyebrow relative z-[1] shrink-0 text-sky-ink hover:underline"
                        title={lead.project.title}
                      >
                        → WO
                      </Link>
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
