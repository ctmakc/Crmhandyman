"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, X, CalendarClock } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  PageHead,
  Empty,
  Plate,
  buttonClass,
  Skeleton,
} from "@/components/ui/primitives";
import { toast } from "@/components/ui/Toaster";
import { CONTRACT_PLANS, MONTH_NAMES } from "@/lib/contracts";

interface ContractRow {
  id: string;
  name: string;
  active: boolean;
  pricePerVisit: number;
  autoInvoice: boolean;
  visitMonths: number[];
  client: { id: string; name: string; address?: string | null; city?: string | null };
  equipment?: { id: string; kind: string; brand?: string | null; model?: string | null } | null;
  visitsBooked: number;
  nextVisit: string | null;
  daysUntilNext: number | null;
}

interface ClientOption {
  id: string;
  name: string;
  address?: string | null;
}

export default function ContractsPage() {
  const router = useRouter();
  const [rows, setRows] = useState<ContractRow[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    clientId: "",
    name: "Maintenance plan",
    plan: "seasonal",
    pricePerVisit: 189,
    autoInvoice: false,
    notes: "",
  });

  const load = useCallback(async () => {
    const [cRes, clRes] = await Promise.all([fetch("/api/contracts"), fetch("/api/clients")]);
    const data = await cRes.json();
    setRows(Array.isArray(data) ? data : []);
    const cl = await clRes.json();
    setClients(Array.isArray(cl) ? cl : []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function createContract(e: React.FormEvent) {
    e.preventDefault();
    const plan = CONTRACT_PLANS.find((p) => p.id === form.plan);
    const res = await fetch("/api/contracts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId: form.clientId,
        name: form.name,
        visitMonths: plan?.months ?? [4, 10],
        pricePerVisit: form.pricePerVisit,
        autoInvoice: form.autoInvoice,
        notes: form.notes,
      }),
    });
    if (res.ok) {
      toast("Contract started");
      setShowForm(false);
      load();
    } else {
      const err = await res.json().catch(() => ({}));
      toast(err.error || "Could not start the contract", "bad");
    }
  }

  async function book(contractId?: string) {
    setBusy(true);
    const res = await fetch("/api/contracts/book", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(contractId ? { contractId } : { withinDays: 45 }),
    });
    const data = await res.json();
    setBusy(false);
    if (data.count === 0) {
      toast("Nothing due to book");
      return;
    }
    toast(`${data.count} visit${data.count === 1 ? "" : "s"} booked`);
    if (contractId && data.booked?.[0]) router.push(`/projects/${data.booked[0].projectId}`);
    else load();
  }

  const dueSoon = rows.filter(
    (r) => r.active && r.daysUntilNext !== null && r.daysUntilNext <= 45
  );
  const annualValue = rows
    .filter((r) => r.active)
    .reduce((s, r) => s + r.pricePerVisit * r.visitMonths.length, 0);
  const field = "w-full mt-1.5 px-3 py-2 text-[13px]";

  return (
    <div className="space-y-6 pb-24 md:pb-0">
      <PageHead
        eyebrow="Recurring"
        title="Service contracts"
        sub="Seasonal maintenance that books itself onto the board."
        action={
          <div className="flex gap-2">
            {dueSoon.length > 0 && (
              <button
                disabled={busy}
                onClick={() => book()}
                className={buttonClass("ghost")}
              >
                <CalendarClock className="h-4 w-4" /> Book all due
              </button>
            )}
            <button onClick={() => setShowForm((v) => !v)} className={buttonClass("primary")}>
              {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {showForm ? "Close" : "New contract"}
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-3 border border-line bg-plate">
        {[
          { label: "Active plans", value: String(rows.filter((r) => r.active).length) },
          {
            label: "Due within 45d",
            value: String(dueSoon.length),
            tone: dueSoon.length ? "var(--amber-ink)" : undefined,
          },
          {
            label: "Booked value / yr",
            value: formatCurrency(annualValue),
            tone: "var(--emerald)",
          },
        ].map((r) => (
          <div key={r.label} className="border-r border-line px-4 py-4 last:border-r-0">
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

      {showForm && (
        <Plate className="p-5">
          <div className="eyebrow">New maintenance plan</div>
          <form onSubmit={createContract} className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="eyebrow">Client *</label>
              <select
                required
                value={form.clientId}
                onChange={(e) => setForm({ ...form, clientId: e.target.value })}
                className={field}
              >
                <option value="">Pick a client…</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.address ? ` · ${c.address}` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="eyebrow">Plan name</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className={field}
              />
            </div>
            <div>
              <label className="eyebrow">Price per visit</label>
              <input
                type="number"
                step="1"
                value={form.pricePerVisit}
                onChange={(e) => setForm({ ...form, pricePerVisit: Number(e.target.value) })}
                className={`${field} mono`}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="eyebrow">Schedule</label>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {CONTRACT_PLANS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setForm({ ...form, plan: p.id })}
                    className="border px-2.5 py-1.5 text-left transition-colors duration-[140ms] ease-instrument"
                    style={{
                      borderColor: form.plan === p.id ? "var(--navy-900)" : "var(--line)",
                      background: form.plan === p.id ? "var(--sunk)" : "var(--plate)",
                    }}
                  >
                    <span className="block text-[12px] font-bold leading-tight text-ink">
                      {p.label}
                    </span>
                    <span className="mono text-[10px] uppercase tracking-[0.08em] text-ink-3">
                      {p.months.map((m) => MONTH_NAMES[m]).join(" · ")}
                    </span>
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[12px] text-ink-2">
                {CONTRACT_PLANS.find((p) => p.id === form.plan)?.hint}
              </p>
            </div>
            <div className="sm:col-span-2">
              <label className="flex items-center gap-2 text-[13px] text-ink-2">
                <input
                  type="checkbox"
                  checked={form.autoInvoice}
                  onChange={(e) => setForm({ ...form, autoInvoice: e.target.checked })}
                  className="h-3.5 w-3.5"
                />
                Draft an invoice when the visit is booked
              </label>
            </div>
            <div className="sm:col-span-2">
              <label className="eyebrow">Notes</label>
              <input
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Access code, pets, roof key…"
                className={field}
              />
            </div>
            <div className="flex gap-2 sm:col-span-2">
              <button type="submit" className={buttonClass("primary")}>
                Start contract
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

      <div className="space-y-2.5">
        {loading ? (
          <Skeleton lines={3} />
        ) : rows.length === 0 ? (
          <Empty>No maintenance plans yet — start one from a client</Empty>
        ) : (
          rows.map((c) => {
            const due = c.daysUntilNext !== null && c.daysUntilNext <= 45;
            const late = c.daysUntilNext !== null && c.daysUntilNext < 0;
            return (
              <div
                key={c.id}
                className="ticket ticket-hover px-4 py-3"
                style={
                  {
                    ["--spine"]: !c.active
                      ? "var(--slate)"
                      : late
                        ? "var(--rose)"
                        : due
                          ? "var(--amber)"
                          : "var(--emerald)",
                  } as React.CSSProperties
                }
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="mono text-[11px] tracking-[0.08em] text-ink-3">
                    {c.visitMonths.map((m) => MONTH_NAMES[m]).join(" · ")} ·{" "}
                    {formatCurrency(c.pricePerVisit)}/visit
                  </span>
                  <span
                    className="mono text-[11px] tracking-[0.08em]"
                    style={{
                      color: late
                        ? "var(--rose-ink)"
                        : due
                          ? "var(--amber-ink)"
                          : "var(--ink-3)",
                    }}
                  >
                    {!c.active
                      ? "PAUSED"
                      : c.nextVisit
                        ? late
                          ? `${Math.abs(c.daysUntilNext!)}D LATE`
                          : `IN ${c.daysUntilNext}D`
                        : "NO SCHEDULE"}
                  </span>
                </div>

                <div className="mt-1.5 flex flex-wrap items-end justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[15px] font-bold leading-tight text-ink">
                      {c.name}
                    </p>
                    <p className="truncate text-[13px] text-ink-2">
                      <Link
                        href={`/clients/${c.client.id}`}
                        className="font-medium text-ink underline underline-offset-4"
                      >
                        {c.client.name}
                      </Link>
                      {c.client.address ? ` · ${c.client.address}` : ""}
                    </p>
                  </div>
                  {c.active && c.nextVisit && (
                    <button
                      disabled={busy}
                      onClick={() => book(c.id)}
                      className={buttonClass("ghost")}
                    >
                      Book {formatDate(c.nextVisit)}
                    </button>
                  )}
                </div>

                <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 border-t border-line pt-2.5">
                  <span className="mono text-[12px] text-ink-2">
                    {c.visitsBooked} BOOKED
                  </span>
                  {c.autoInvoice && (
                    <span className="mono text-[12px] text-ink-2">AUTO-INVOICE</span>
                  )}
                  {c.equipment && (
                    <span className="mono text-[12px] text-ink-3">
                      {c.equipment.kind.replace(/_/g, " ")}
                      {c.equipment.brand ? ` · ${c.equipment.brand}` : ""}
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
