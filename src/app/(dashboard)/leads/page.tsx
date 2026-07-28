"use client";

import { useEffect, useState } from "react";
import { Plus, Search, X } from "lucide-react";
import {
  PageHead,
  Row,
  Lane,
  WoNumber,
  Empty,
  Plate,
  buttonClass,
  Skeleton,
} from "@/components/ui/primitives";
import { toast } from "@/components/ui/Toaster";

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
  assignedTo?: { name: string };
}

const STATUSES = ["NEW", "CONTACTED", "VERIFIED", "REJECTED", "CONVERTED"];
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

const field =
  "w-full mt-1.5 px-3 py-2 text-[13px] text-ink placeholder:text-ink-3";
const label = "eyebrow";

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
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

  async function fetchLeads() {
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    if (statusFilter) params.set("status", statusFilter);
    if (sourceFilter) params.set("source", sourceFilter);
    const res = await fetch(`/api/leads?${params}`);
    const data = await res.json();
    setLeads(data);
    setLoading(false);
  }

  useEffect(() => {
    fetchLeads();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, statusFilter, sourceFilter]);

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

  return (
    <div className="space-y-8 pb-24 md:pb-0">
      <PageHead
        eyebrow="Intake"
        title="Leads"
        sub="Every call, form and marketplace enquiry before it becomes a job."
        action={
          <button onClick={() => setShowAddForm((v) => !v)} className={buttonClass("primary")}>
            {showAddForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {showAddForm ? "Close" : "New lead"}
          </button>
        }
      />

      {/* Filter bar — a recessed lane, one hairline, no floating card. */}
      <div className="flex flex-col gap-2 border-t border-line pt-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3"
            strokeWidth={2}
          />
          <input
            type="text"
            placeholder="Search name, phone, city…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full py-2 pl-9 pr-3 text-[13px]"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="mono px-3 py-2 text-[12px] uppercase tracking-[0.06em]"
        >
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value)}
          className="mono px-3 py-2 text-[12px] uppercase tracking-[0.06em]"
        >
          <option value="">All sources</option>
          {SOURCES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      {showAddForm && (
        <Plate className="p-5">
          <div className="eyebrow">New intake ticket</div>
          <form onSubmit={handleAddLead} className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
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

      <Lane>
        {loading ? (
          <Skeleton lines={4} />
        ) : leads.length === 0 ? (
          <Empty>No leads match this filter</Empty>
        ) : (
          leads.map((lead) => (
            <Row key={lead.id} href={`/leads/${lead.id}`} status={lead.status}>
              <div className="flex items-baseline justify-between gap-3">
                <WoNumber id={lead.id} prefix="LD" date={lead.createdAt} />
                <span className="mono text-[11px] text-ink-3">
                  {new Date(lead.createdAt).toLocaleDateString("en-CA")}
                </span>
              </div>
              <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <p className="text-[15px] font-bold leading-tight text-ink">{lead.name}</p>
                <span className="eyebrow">{lead.source}</span>
                <span className="eyebrow" style={{ color: "var(--ink-2)" }}>
                  · {lead.status}
                </span>
              </div>
              <p className="mt-0.5 text-[13px] text-ink-2">
                {[lead.jobType, lead.city, lead.phone].filter(Boolean).join(" · ") ||
                  "No details captured"}
              </p>
            </Row>
          ))
        )}
      </Lane>
    </div>
  );
}
