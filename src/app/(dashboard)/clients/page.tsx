"use client";

import { useEffect, useState } from "react";
import { Plus, Search, X } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import {
  PageHead,
  Row,
  Lane,
  Empty,
  Plate,
  buttonClass,
  Skeleton,
} from "@/components/ui/primitives";
import { toast } from "@/components/ui/Toaster";

interface Client {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  jobCount: number;
  leadCount: number;
  equipmentCount: number;
  openJobs: number;
  owing: number;
  lastSeen: string | null;
}

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    address: "",
    city: "",
    notes: "",
  });

  async function fetchClients() {
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    const res = await fetch(`/api/clients?${params}`);
    const data = await res.json();
    setClients(Array.isArray(data) ? data : []);
    setLoading(false);
  }

  useEffect(() => {
    fetchClients();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      toast("Client added");
      setShowForm(false);
      setForm({ name: "", phone: "", email: "", address: "", city: "", notes: "" });
      fetchClients();
    } else {
      toast("Could not add the client", "bad");
    }
  }

  const owingTotal = clients.reduce((s, c) => s + c.owing, 0);
  const withIron = clients.filter((c) => c.equipmentCount > 0).length;
  const field = "w-full mt-1.5 px-3 py-2 text-[13px]";

  return (
    <div className="space-y-8 pb-24 md:pb-0">
      <PageHead
        eyebrow="The book"
        title="Clients"
        sub="One address, one history — every job, invoice and piece of iron on it."
        action={
          <button onClick={() => setShowForm((v) => !v)} className={buttonClass("primary")}>
            {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {showForm ? "Close" : "New client"}
          </button>
        }
      />

      <div className="grid grid-cols-3 gap-6 border-b border-line pb-6">
        {[
          { label: "On the book", value: String(clients.length) },
          { label: "With equipment", value: String(withIron) },
          {
            label: "Owing us",
            value: formatCurrency(owingTotal),
            tone: owingTotal > 0 ? "var(--rose-ink)" : "var(--emerald)",
          },
        ].map((r) => (
          <div key={r.label}>
            <div className="eyebrow">{r.label}</div>
            <p
              className="mono mt-2.5 text-[20px] font-bold leading-none md:text-[24px]"
              style={{ color: r.tone || "var(--ink)" }}
            >
              {r.value}
            </p>
          </div>
        ))}
      </div>

      <div className="border-t border-line pt-3">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3"
            strokeWidth={2}
          />
          <input
            placeholder="Name, phone, address…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full py-2 pl-9 pr-3 text-[13px]"
          />
        </div>
      </div>

      {showForm && (
        <Plate className="p-5">
          <div className="eyebrow">New client record</div>
          <form onSubmit={handleAdd} className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="eyebrow">Name *</label>
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className={field}
              />
            </div>
            <div>
              <label className="eyebrow">Phone</label>
              <input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className={`${field} mono`}
              />
            </div>
            <div>
              <label className="eyebrow">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className={field}
              />
            </div>
            <div>
              <label className="eyebrow">City</label>
              <input
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
                className={field}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="eyebrow">Address</label>
              <input
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                className={field}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="eyebrow">Notes</label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={2}
                className={field}
              />
            </div>
            <div className="flex gap-2 sm:col-span-2">
              <button type="submit" className={buttonClass("primary")}>
                Add client
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
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
        ) : clients.length === 0 ? (
          <Empty>No clients match this search</Empty>
        ) : (
          clients.map((c) => (
            <Row
              key={c.id}
              href={`/clients/${c.id}`}
              // Green means "worked for, settled up" — a name with no jobs yet is neutral.
              status={
                c.owing > 0.005
                  ? "OVERDUE"
                  : c.openJobs > 0
                    ? "IN_PROGRESS"
                    : c.jobCount > 0
                      ? "COMPLETED"
                      : "DRAFT"
              }
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="mono text-[11px] tracking-[0.08em] text-ink-3">
                  {c.phone || c.email || "no contact on file"}
                </span>
                {c.owing > 0.005 && (
                  <span className="mono text-[11px]" style={{ color: "var(--rose-ink)" }}>
                    OWES {formatCurrency(c.owing)}
                  </span>
                )}
              </div>
              <p className="mt-1.5 truncate text-[15px] font-bold leading-tight text-ink">
                {c.name}
              </p>
              <p className="truncate text-[13px] text-ink-2">
                {[c.address, c.city].filter(Boolean).join(", ") || "No address on file"}
              </p>
              <div className="mt-2.5 flex flex-wrap items-baseline gap-x-4 gap-y-1 border-t border-line pt-2.5">
                <span className="mono text-[12px] text-ink-2">
                  {c.jobCount === 0 && c.leadCount > 0
                    ? `LEAD ONLY · ${c.leadCount}`
                    : `${c.jobCount} ${c.jobCount === 1 ? "JOB" : "JOBS"}`}
                </span>
                {c.openJobs > 0 && (
                  <span className="mono text-[12px]" style={{ color: "var(--amber-ink)" }}>
                    {c.openJobs} OPEN
                  </span>
                )}
                {c.equipmentCount > 0 && (
                  <span className="mono text-[12px] text-ink-2">
                    {c.equipmentCount} UNIT{c.equipmentCount === 1 ? "" : "S"}
                  </span>
                )}
                {c.lastSeen && (
                  <span className="mono text-[12px] text-ink-3">
                    LAST {new Date(c.lastSeen).toLocaleDateString("en-CA")}
                  </span>
                )}
              </div>
            </Row>
          ))
        )}
      </Lane>
    </div>
  );
}
