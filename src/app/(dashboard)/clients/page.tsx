"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Search, X } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import {
  PageHead,
  Row,
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

/* --------------------------------------------------------------------------
   THE DEVICE (DESIGN.md revision 3): the card index / rolodex.
   A–Z thumb rail up top, letter dividers in a phone-book gutter, and every
   client as a file card — an initials tab sitting on the row's top rule.
   -------------------------------------------------------------------------- */

const ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").concat("#");

function letterOf(name: string) {
  const ch = (name.trim()[0] || "").toUpperCase();
  return /[A-Z]/.test(ch) ? ch : "#";
}

function anchorId(letter: string) {
  return `idx-${letter === "#" ? "num" : letter}`;
}

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const raw =
    parts.length >= 2 ? `${parts[0][0]}${parts[1][0]}` : (parts[0] || "??").slice(0, 2);
  return raw.toUpperCase();
}

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeLetter, setActiveLetter] = useState<string | null>(null);
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

  /** Alphabetical card index: sorted, then filed under a letter divider. */
  const groups = useMemo(() => {
    const sorted = [...clients].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
    );
    const map = new Map<string, Client[]>();
    for (const c of sorted) {
      const l = letterOf(c.name);
      if (!map.has(l)) map.set(l, []);
      map.get(l)!.push(c);
    }
    return map;
  }, [clients]);

  function jumpTo(letter: string) {
    setActiveLetter(letter);
    document
      .getElementById(anchorId(letter))
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

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

      {/* The three readouts, tightened onto one baseline rule. */}
      <div className="flex flex-wrap items-baseline gap-x-9 gap-y-2 border-b border-line pb-3.5">
        {[
          { label: "On the book", value: String(clients.length) },
          { label: "With equipment", value: String(withIron) },
          {
            label: "Owing us",
            value: formatCurrency(owingTotal),
            tone: owingTotal > 0 ? "var(--rose-ink)" : "var(--emerald)",
          },
        ].map((r) => (
          <div key={r.label} className="flex items-baseline gap-2.5">
            <span className="eyebrow">{r.label}</span>
            <span
              className="mono text-[20px] font-bold leading-none tabular-nums"
              style={{ color: r.tone || "var(--ink)" }}
            >
              {r.value}
            </span>
          </div>
        ))}
      </div>

      {/* The A–Z thumb rail — the rolodex tabs — with the compact search at its end. */}
      <div className="flex flex-col-reverse gap-1 border-b border-line sm:flex-row sm:items-end sm:gap-4">
        <div className="min-w-0 flex-1 overflow-x-auto">
          <div className="flex min-w-[460px] items-end justify-between">
            {ALPHA.map((letter) =>
              groups.has(letter) ? (
                <button
                  key={letter}
                  type="button"
                  onClick={() => jumpTo(letter)}
                  aria-label={`Jump to ${letter}`}
                  className={cn(
                    "mono border-b-2 px-0.5 pb-2 pt-1 text-[11px] leading-none text-ink transition-colors duration-[140ms] ease-instrument hover:border-amber",
                    activeLetter === letter ? "border-amber" : "border-transparent"
                  )}
                >
                  {letter}
                </button>
              ) : (
                <span
                  key={letter}
                  aria-hidden="true"
                  className="mono select-none border-b-2 border-transparent px-0.5 pb-2 pt-1 text-[11px] leading-none text-ink-3 opacity-35"
                >
                  {letter}
                </span>
              )
            )}
          </div>
        </div>
        <div className="relative w-full pb-2 sm:w-[220px] sm:shrink-0">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-3"
            strokeWidth={2}
          />
          <input
            placeholder="Name, phone, address…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full py-1.5 pl-8 pr-2.5 text-[13px]"
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

      {/* The card index: letter dividers in the gutter, file cards to the right. */}
      {loading ? (
        <Skeleton lines={5} />
      ) : clients.length === 0 ? (
        <Empty>No clients match this search</Empty>
      ) : (
        <div>
          {ALPHA.filter((l) => groups.has(l)).map((letter) => (
            <section
              key={letter}
              id={anchorId(letter)}
              className="grid scroll-mt-6 grid-cols-[36px_1fr] border-t border-line md:grid-cols-[56px_1fr]"
            >
              {/* The phone-book thumb: the letter, sticky so it reads as a divider
                  while its group scrolls past. */}
              <div className="border-r border-line pt-[18px]">
                <span className="mono sticky top-4 block pl-0.5 text-[18px] font-medium leading-none text-ink-3 md:pl-1.5 md:text-[22px]">
                  {letter}
                </span>
              </div>

              <div>
                {groups.get(letter)!.map((c) => (
                  <Row
                    key={c.id}
                    href={`/clients/${c.id}`}
                    className="!pt-[19px]"
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
                    {/* The file tab: initials on a half-raised tab straddling the top rule. */}
                    <span className="mono absolute left-5 top-0 -translate-y-1/2 rounded-t border border-b-0 border-line bg-plate px-1.5 py-[3px] text-[10px] font-medium uppercase leading-none tracking-[0.1em] text-ink-2">
                      {initialsOf(c.name)}
                    </span>

                    <div className="flex items-baseline justify-between gap-3">
                      <p className="min-w-0 truncate text-[15px] font-bold leading-tight text-ink">
                        {c.name}
                      </p>
                      {c.owing > 0.005 ? (
                        <span
                          className="mono shrink-0 text-right text-[12px] font-medium tabular-nums"
                          style={{ color: "var(--rose-ink)" }}
                        >
                          OWES {formatCurrency(c.owing)}
                        </span>
                      ) : c.lastSeen ? (
                        <span className="mono shrink-0 text-right text-[11px] text-ink-3">
                          LAST {new Date(c.lastSeen).toLocaleDateString("en-CA")}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-0.5 truncate text-[13px] text-ink-2">
                      {[c.address, c.city].filter(Boolean).join(", ") || "No address on file"}
                    </p>

                    <div className="mt-2.5 flex flex-wrap items-baseline gap-x-3.5 gap-y-1.5 border-t border-line pt-2">
                      <span className="mono text-[12px] text-ink-3">
                        {c.phone || c.email || "no contact on file"}
                      </span>
                      <span className="mono text-[12px] text-ink-2">
                        {c.jobCount === 0 && c.leadCount > 0
                          ? `LEAD ONLY · ${c.leadCount}`
                          : `${c.jobCount} ${c.jobCount === 1 ? "JOB" : "JOBS"}`}
                      </span>
                      {c.openJobs > 0 && (
                        <span
                          className="mono text-[12px]"
                          style={{ color: "var(--amber-ink)" }}
                        >
                          {c.openJobs} OPEN
                        </span>
                      )}
                      {c.equipmentCount > 0 && (
                        <span className="mono rounded border border-line px-1.5 py-0.5 text-[10px] uppercase leading-none tracking-[0.08em] text-ink-2">
                          {c.equipmentCount} UNIT{c.equipmentCount === 1 ? "" : "S"} ON SITE
                        </span>
                      )}
                      {c.owing > 0.005 && c.lastSeen && (
                        <span className="mono text-[12px] text-ink-3">
                          LAST {new Date(c.lastSeen).toLocaleDateString("en-CA")}
                        </span>
                      )}
                    </div>
                  </Row>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
