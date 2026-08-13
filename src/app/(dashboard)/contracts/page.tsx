"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, X, CalendarClock } from "lucide-react";
import { cn, formatDate } from "@/lib/utils";
import { formatCents, inCents, type InCents } from "@/lib/money";
import {
  PageHead,
  Empty,
  Plate,
  buttonClass,
  Skeleton,
} from "@/components/ui/primitives";
import { toast } from "@/components/ui/Toaster";
import { CONTRACT_PLANS, MONTH_NAMES } from "@/lib/contracts";

/** The plan as the API serves it: dollars. */
interface ApiContractRow {
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

/** What this screen works in. The form below stays in dollars — the owner types dollars. */
type ContractRow = InCents<ApiContractRow>;

interface ClientOption {
  id: string;
  name: string;
  address?: string | null;
}

const MONTH_ABBR = [
  "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
  "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
];
const MONTH_INITIALS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

/**
 * The 12-cell month strip — each contract's own year rule.
 * Emerald is a CLAIM ("this visit was booked"), so it is painted only for as
 * many past cycles as `visitsBooked` vouches for; a past cycle nobody booked
 * is spent time, not done work — it gets the pale `--line` fill.
 */
function monthCellStyle(c: ContractRow, month: number, year: number): React.CSSProperties {
  const isVisit = c.visitMonths.includes(month);
  if (!isVisit) return { background: "var(--sunk)", opacity: 0.5 };
  if (!c.active || !c.nextVisit) return { background: "var(--slate)", opacity: 0.55 };
  const next = new Date(c.nextVisit);
  if (next.getMonth() + 1 === month && next.getFullYear() === year)
    return { background: "var(--amber)" };
  const nextKey = next.getFullYear() * 12 + next.getMonth();
  const cellKey = year * 12 + (month - 1);
  if (cellKey < nextKey) {
    const pastMonths = c.visitMonths
      .filter((m) => year * 12 + (m - 1) < nextKey)
      .sort((a, b) => a - b);
    return pastMonths.indexOf(month) < c.visitsBooked
      ? { background: "var(--emerald)" }
      : { background: "var(--line)" };
  }
  return { background: "var(--ink-3)", opacity: 0.6 };
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
    // The one door on this screen: dollars off the wire, cents on the board.
    const data = await cRes.json();
    setRows(Array.isArray(data) ? inCents(data as ApiContractRow[]) : []);
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

  const now = new Date();
  const thisMonth = now.getMonth() + 1;
  const thisYear = now.getFullYear();

  const active = rows.filter((r) => r.active);
  const dueSoon = rows.filter(
    (r) => r.active && r.daysUntilNext !== null && r.daysUntilNext <= 45
  );
  const annualValueCents = active.reduce(
    (s, r) => s + r.pricePerVisitCents * r.visitMonths.length,
    0
  );
  /** Visits due each month of the year, across every active plan. */
  const monthLoad = MONTH_ABBR.map(
    (_, i) => active.filter((r) => r.visitMonths.includes(i + 1)).length
  );
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

      {/* ------------------------------------------------------------------
          THE YEAR RULE — the maintenance wall planner. Twelve months on one
          tick-edged board; the load per month is the reading, and the current
          month is lit by the amber light source, exactly like today on the
          dispatch week board.
          ------------------------------------------------------------------ */}
      <div>
        <div className="ruleband" style={{ backgroundSize: "calc(100% / 12) 4px" }} />
        <div className="grid grid-cols-12 border-b border-line">
          {MONTH_ABBR.map((abbr, i) => {
            const isNow = i + 1 === thisMonth;
            const count = monthLoad[i];
            return (
              <div
                key={abbr}
                className={cn(
                  "arm-col flex h-[52px] flex-col items-center justify-between pb-2 pt-1.5 min-[480px]:h-[72px]",
                  i > 0 && "border-l border-line",
                  isNow && "today-glow"
                )}
                style={{ ["--i" as string]: i } as React.CSSProperties}
              >
                <span
                  className="mono text-[10px] leading-none tracking-[0.09em]"
                  style={{
                    color: isNow ? "var(--amber-ink)" : "var(--ink-3)",
                    fontWeight: isNow ? 700 : 400,
                  }}
                >
                  {abbr}
                </span>
                <span
                  className="mono hidden leading-none tabular-nums min-[480px]:block"
                  style={
                    count === 0
                      ? { color: "var(--ink-3)", opacity: 0.5, fontSize: 22 }
                      : {
                          color: isNow ? "var(--amber-ink)" : "var(--ink)",
                          fontSize: isNow ? 27 : 22,
                          fontWeight: isNow ? 700 : 500,
                          letterSpacing: "-0.02em",
                        }
                  }
                >
                  {count === 0 ? "·" : count}
                </span>
              </div>
            );
          })}
        </div>
        <div className="mono flex flex-wrap items-baseline gap-x-5 gap-y-1 pt-2 text-[11px] tracking-[0.08em] text-ink-3">
          <span>
            ACTIVE PLANS{" "}
            <span className="font-bold text-ink">{active.length}</span>
          </span>
          <span>
            DUE WITHIN 45D{" "}
            <span
              className="font-bold"
              style={{ color: dueSoon.length ? "var(--amber-ink)" : "var(--ink)" }}
            >
              {dueSoon.length}
            </span>
          </span>
          <span>
            BOOKED VALUE/YR{" "}
            <span className="font-bold" style={{ color: "var(--emerald-ink)" }}>
              {formatCents(annualValueCents)}
            </span>
          </span>
        </div>
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

      {/* ------------------------------------------------------------------
          THE PLANS — ruled rows, each carrying its own 12-cell year strip:
          due next = amber, verifiably booked = emerald, past-unbooked = pale,
          still ahead = slate.
          ------------------------------------------------------------------ */}
      {loading ? (
        <Skeleton lines={3} />
      ) : rows.length === 0 ? (
        <Empty>No maintenance plans yet — start one from a client</Empty>
      ) : (
        <div className="lane">
          {rows.map((c) => {
            const due = c.daysUntilNext !== null && c.daysUntilNext <= 45;
            const late = c.daysUntilNext !== null && c.daysUntilNext < 0;
            const spine = !c.active
              ? "var(--slate)"
              : late
                ? "var(--rose)"
                : due
                  ? "var(--amber)"
                  : "var(--emerald)";
            const countdown = !c.active
              ? "PAUSED"
              : c.nextVisit
                ? late
                  ? `${Math.abs(c.daysUntilNext!)}D LATE`
                  : `IN ${c.daysUntilNext}D`
                : "NO SCHEDULE";
            const countdownTone = !c.active
              ? "var(--slate-ink)"
              : late
                ? "var(--rose-ink)"
                : due
                  ? "var(--amber-ink)"
                  : "var(--ink-3)";
            return (
              <div
                key={c.id}
                className="row row-hover"
                style={{ ["--spine" as string]: spine } as React.CSSProperties}
              >
                {/* line 1 — plan, client, price per visit */}
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
                  <p className="min-w-0 truncate">
                    <span className="text-[15px] font-bold leading-tight text-ink">
                      {c.name}
                    </span>{" "}
                    <span className="text-[13px] text-ink-2">
                      <Link
                        href={`/clients/${c.client.id}`}
                        className="font-medium text-ink underline underline-offset-4"
                      >
                        {c.client.name}
                      </Link>
                      {c.client.address ? ` · ${c.client.address}` : ""}
                    </span>
                  </p>
                  <span className="mono shrink-0 text-[13px] font-medium tabular-nums text-ink">
                    {formatCents(c.pricePerVisitCents)}
                    <span className="text-[11px] text-ink-3"> /visit</span>
                  </span>
                </div>

                {/* line 2 — the contract's own year rule */}
                <div className="mt-2.5 grid w-max grid-cols-12 gap-x-[3px]">
                  {MONTH_INITIALS.map((_, i) => (
                    <div
                      key={i}
                      className="h-[10px] w-[14px]"
                      style={monthCellStyle(c, i + 1, thisYear)}
                    />
                  ))}
                  {MONTH_INITIALS.map((letter, i) => (
                    <span
                      key={`l${i}`}
                      className="mono mt-[3px] w-[14px] text-center text-[8px] leading-none text-ink-3"
                    >
                      {letter}
                    </span>
                  ))}
                </div>

                {/* line 3 — meta + the book action */}
                <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  {c.equipment && (
                    <span className="mono border border-line px-1.5 py-0.5 text-[11px] uppercase tracking-[0.05em] text-ink-2">
                      {c.equipment.kind.replace(/_/g, " ")}
                      {c.equipment.brand ? ` · ${c.equipment.brand}` : ""}
                    </span>
                  )}
                  {c.autoInvoice && (
                    <span className="mono text-[11px] tracking-[0.08em] text-ink-2">
                      AUTO-INVOICE
                    </span>
                  )}
                  <span className="mono text-[11px] tracking-[0.08em] text-ink-3">
                    {c.visitsBooked} BOOKED
                  </span>
                  <span
                    className="mono text-[11px] font-bold tracking-[0.08em]"
                    style={{ color: countdownTone }}
                  >
                    {countdown}
                  </span>
                  {c.active && c.nextVisit && (
                    <button
                      disabled={busy}
                      onClick={() => book(c.id)}
                      className={cn(buttonClass("ghost"), "ml-auto px-2.5 py-1 text-[11px]")}
                    >
                      Book {formatDate(c.nextVisit)}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
