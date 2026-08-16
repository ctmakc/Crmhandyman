"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Search, Phone, MapPin, ChevronRight, X, Check, Ban } from "lucide-react";
import { PageHead, Skeleton, Empty, buttonClass, textToneFor } from "@/components/ui/primitives";
import { toast } from "@/components/ui/Toaster";

interface Lead {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  source: string;
  jobType?: string | null;
  notes?: string | null;
  status: string;
  createdAt: string;
  assignedTo?: { id: string; name: string } | null;
  project?: { id: string; title: string; status: string } | null;
}

const statuses = ["NEW", "CONTACTED", "VERIFIED", "REJECTED", "CONVERTED"];
const sources = ["FACEBOOK", "INSTAGRAM", "GOOGLE", "HOMESTARS", "KIJIJI", "EMAIL", "MANUAL", "OTHER"];

function age(createdAt: string) {
  const ms = Date.now() - new Date(createdAt).getTime();
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 1) return "<1h";
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function sourceLabel(source: string) {
  if (source === "HOMESTARS") return "HomeStars";
  if (source === "KIJIJI") return "Kijiji";
  return source.charAt(0) + source.slice(1).toLowerCase();
}

function Source({ value }: { value: string }) {
  return (
    <span className="mono text-[10px] uppercase tracking-[0.06em] text-ink-3">
      {sourceLabel(value)}
    </span>
  );
}

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
  const snapTimer = useRef<number | undefined>(undefined);
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
     stage must not zero the other counts. */
  const load = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams();
    if (search) qs.set("q", search);
    if (sourceFilter) qs.set("source", sourceFilter);
    const response = await fetch(`/api/leads?${qs}`);
    const data = await response.json();
    setLeads(Array.isArray(data) ? data : []);
    setLoading(false);
  }, [search, sourceFilter]);

  useEffect(() => {
    const timer = setTimeout(load, search ? 250 : 0);
    return () => clearTimeout(timer);
  }, [load, search]);

  useEffect(() => () => {
    if (snapTimer.current) window.clearTimeout(snapTimer.current);
  }, []);

  const filtered = statusFilter ? leads.filter((lead) => lead.status === statusFilter) : leads;
  const counts = statuses.reduce<Record<string, number>>((acc, status) => {
    acc[status] = leads.filter((lead) => lead.status === status).length;
    return acc;
  }, {});

  async function addLead(event: React.FormEvent) {
    event.preventDefault();
    const response = await fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (!response.ok) {
      toast("Could not add lead");
      return;
    }
    toast("Lead added");
    setShowAddForm(false);
    setForm({ name: "", phone: "", email: "", address: "", city: "", source: "MANUAL", jobType: "", notes: "" });
    await load();
  }

  async function actOnLead(lead: Lead, status: string, event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    const response = await fetch(`/api/leads/${lead.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...lead, status }),
    });
    if (!response.ok) {
      toast("Could not update lead");
      return;
    }
    setSnapId(lead.id);
    if (snapTimer.current) window.clearTimeout(snapTimer.current);
    snapTimer.current = window.setTimeout(() => setSnapId(null), 420);
    toast(status === "REJECTED" ? "Lead rejected" : `Lead → ${status.toLowerCase()}`);
    await load();
  }

  return (
    <div className="space-y-6">
      <PageHead
        eyebrow="Sales intake"
        title="Leads"
        action={
          <button type="button" onClick={() => setShowAddForm(true)} className={buttonClass("primary")}>
            <Plus className="h-4 w-4" /> Add lead
          </button>
        }
      />

      <div className="grid grid-cols-5 border-y border-line bg-plate">
        {statuses.map((status) => (
          <button
            key={status}
            type="button"
            onClick={() => setStatusFilter(statusFilter === status ? "" : status)}
            className={`border-r border-line px-2 py-3 text-left last:border-r-0 ${statusFilter === status ? "bg-deck" : ""}`}
          >
            <div className="eyebrow">{status.replace("_", " ")}</div>
            <div className="mono mt-1 text-[20px] font-bold text-ink">{counts[status] || 0}</div>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 border-b border-line pb-4">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search name, phone, email, city"
            className="w-full py-2 pl-9 pr-3 text-[13px]"
          />
        </div>
        <select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)} className="px-3 py-2 text-[12px]">
          <option value="">All sources</option>
          {sources.map((source) => <option key={source} value={source}>{sourceLabel(source)}</option>)}
        </select>
        {statusFilter && (
          <button type="button" onClick={() => setStatusFilter("")} className={buttonClass("ghost")}>
            <X className="h-3.5 w-3.5" /> {statusFilter.replace("_", " ")}
          </button>
        )}
      </div>

      {loading ? (
        <Skeleton lines={5} />
      ) : filtered.length === 0 ? (
        <Empty>No leads match this sheet</Empty>
      ) : (
        <div className="border-t border-line">
          {filtered.map((lead) => (
            <Link
              key={lead.id}
              href={`/leads/${lead.id}`}
              className={`row group grid gap-3 py-3.5 md:grid-cols-[minmax(180px,1.4fr)_minmax(140px,1fr)_110px_90px_minmax(210px,auto)] md:items-center ${snapId === lead.id ? "ticket-snap" : ""}`}
              style={{ ["--spine" as string]: textToneFor(lead.status) } as React.CSSProperties}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate text-[14px] font-bold text-ink">{lead.name}</span>
                  <span className="eyebrow" style={{ color: textToneFor(lead.status) }}>{lead.status.replace("_", " ")}</span>
                </div>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-ink-3">
                  {lead.phone && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" /> {lead.phone}</span>}
                  {(lead.city || lead.address) && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> {[lead.address, lead.city].filter(Boolean).join(", ")}</span>}
                </div>
              </div>
              <div className="min-w-0">
                <p className="truncate text-[13px] text-ink-2">{lead.jobType || "Unspecified service"}</p>
                {lead.assignedTo && <p className="mt-1 text-[11px] text-ink-3">{lead.assignedTo.name}</p>}
              </div>
              <Source value={lead.source} />
              <div className="mono text-[11px] text-ink-3">{age(lead.createdAt)}</div>
              <div className="flex flex-wrap items-center justify-end gap-1.5">
                {lead.status === "NEW" && (
                  <button className={act} onClick={(event) => void actOnLead(lead, "CONTACTED", event)}>Contacted</button>
                )}
                {(lead.status === "NEW" || lead.status === "CONTACTED") && (
                  <button className={actPrimary} onClick={(event) => void actOnLead(lead, "VERIFIED", event)}><Check className="mr-1 inline h-3 w-3" /> Verify</button>
                )}
                {lead.status !== "CONVERTED" && lead.status !== "REJECTED" && (
                  <button className={actQuiet} onClick={(event) => void actOnLead(lead, "REJECTED", event)}><Ban className="mr-1 inline h-3 w-3" /> Reject</button>
                )}
                <button
                  className={act}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    router.push(`/leads/${lead.id}`);
                  }}
                  aria-label={`Open ${lead.name}`}
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </Link>
          ))}
        </div>
      )}

      {showAddForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-900/45 p-4" onMouseDown={() => setShowAddForm(false)}>
          <form
            onSubmit={addLead}
            onMouseDown={(event) => event.stopPropagation()}
            className="w-full max-w-xl border border-line bg-plate p-5 shadow-none"
          >
            <div className="flex items-center justify-between gap-4 border-b border-line pb-3">
              <div>
                <div className="eyebrow">Manual intake</div>
                <h2 className="mt-1 text-[22px] font-black text-ink">Add lead</h2>
              </div>
              <button type="button" onClick={() => setShowAddForm(false)} className="p-2 text-ink-3 hover:text-ink"><X className="h-4 w-4" /></button>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label><span className={label}>Name</span><input required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className={field} /></label>
              <label><span className={label}>Phone</span><input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} className={field} /></label>
              <label><span className={label}>Email</span><input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} className={field} /></label>
              <label><span className={label}>City</span><input value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} className={field} /></label>
              <label><span className={label}>Address</span><input value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} className={field} /></label>
              <label><span className={label}>Source</span><select value={form.source} onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))} className={field}>{sources.map((source) => <option key={source}>{source}</option>)}</select></label>
              <label className="md:col-span-2"><span className={label}>Job type</span><input value={form.jobType} onChange={(e) => setForm((f) => ({ ...f, jobType: e.target.value }))} className={field} /></label>
              <label className="md:col-span-2"><span className={label}>Notes</span><textarea rows={3} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} className={field} /></label>
            </div>

            <div className="mt-5 flex justify-end gap-2 border-t border-line pt-4">
              <button type="button" onClick={() => setShowAddForm(false)} className={buttonClass("ghost")}>Cancel</button>
              <button type="submit" className={buttonClass("primary")}>Add lead</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
