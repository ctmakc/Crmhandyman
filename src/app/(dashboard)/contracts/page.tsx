"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, X, CalendarClock } from "lucide-react";
import { cn, formatDate } from "@/lib/utils";
import { inCents, type InCents } from "@/lib/money";
import {
  PageHead,
  Empty,
  Plate,
  Button,
  Chip,
  Field,
  LaneHead,
  Money,
  Num,
  StatTile,
  Skeleton,
} from "@/components/ui/primitives";
import { toast } from "@/components/ui/Toaster";
import { CONTRACT_PLANS, MONTH_NAMES } from "@/lib/contracts";
import { dueWord, lateWord } from "@/lib/invoice-state";

/** The contract as the API serves it: dollars. */
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

/** The five things a cell of the year strip can be saying. */
type CellKind = "none" | "next" | "booked" | "missed" | "ahead" | "paused";

const CELL_FILL: Record<CellKind, React.CSSProperties> = {
  none: { background: "var(--line)" },
  next: { background: "var(--amber)" },
  booked: { background: "var(--emerald)" },
  missed: { background: "var(--line)" },
  ahead: { background: "var(--ink-3)", opacity: 0.6 },
  paused: { background: "var(--slate)", opacity: 0.55 },
};

/**
 * A month that owes nothing is not a block at all — it is the baseline the
 * blocks stand on. Fill alone could not separate it from a visit month that
 * went by unbooked: `--sunk` and `--line` are one grey apart, and the legend
 * was promising a difference the eye could not find.
 */
const CELL_HEIGHT: Record<CellKind, string> = {
  none: "h-[2px]",
  next: "h-3",
  booked: "h-3",
  missed: "h-3",
  ahead: "h-3",
  paused: "h-3",
};

const CELL_WORD: Record<CellKind, string> = {
  none: "no visit",
  next: "next visit due",
  booked: "visit booked",
  missed: "visit month, nothing booked",
  ahead: "visit planned",
  paused: "contract paused",
};

/**
 * The 12-cell month strip — each contract's own year rule.
 * Emerald is a CLAIM ("this visit was booked"), so it is painted only for as
 * many past cycles as `visitsBooked` vouches for; a past cycle nobody booked
 * is spent time, not done work — it gets the pale `--line` fill.
 */
function monthCellKind(c: ContractRow, month: number, year: number): CellKind {
  const isVisit = c.visitMonths.includes(month);
  if (!isVisit) return "none";
  if (!c.active || !c.nextVisit) return "paused";
  const next = new Date(c.nextVisit);
  if (next.getMonth() + 1 === month && next.getFullYear() === year) return "next";
  const nextKey = next.getFullYear() * 12 + next.getMonth();
  const cellKey = year * 12 + (month - 1);
  if (cellKey < nextKey) {
    const pastMonths = c.visitMonths
      .filter((m) => year * 12 + (m - 1) < nextKey)
      .sort((a, b) => a - b);
    return pastMonths.indexOf(month) < c.visitsBooked ? "booked" : "missed";
  }
  return "ahead";
}

/** The legend the strip needs: four fills that mean nothing on their own. */
function StripLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {(["next", "booked", "missed", "ahead"] as CellKind[]).map((k) => (
        <span key={k} className="eyebrow inline-flex items-center gap-1.5">
          <span aria-hidden className="inline-block h-2.5 w-3.5" style={CELL_FILL[k]} />
          {k === "next" ? "Next" : k === "booked" ? "Booked" : k === "missed" ? "Passed" : "Ahead"}
        </span>
      ))}
    </div>
  );
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
      toast("The contract was not started — pick a client and at least one visit month", "bad");
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
  /** Visits due each month of the year, across every active contract. */
  const monthLoad = MONTH_ABBR.map(
    (_, i) => active.filter((r) => r.visitMonths.includes(i + 1)).length
  );
  /** The tallest month sets the scale the histogram bars are read against. */
  const maxLoad = Math.max(...monthLoad, 1);

  return (
    <div className="space-y-6 pb-24 md:pb-0">
      <PageHead
        eyebrow="Recurring"
        title="Contracts"
        sub="Seasonal maintenance that books itself onto the board."
        action={
          <>
            {dueSoon.length > 0 && (
              <Button variant="ghost" disabled={busy} onClick={() => book()}>
                <CalendarClock className="h-4 w-4" /> Book all due
              </Button>
            )}
            <Button variant="primary" onClick={() => setShowForm((v) => !v)}>
              {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {showForm ? "Close" : "New contract"}
            </Button>
          </>
        }
      />

      {/* ------------------------------------------------------------------
          THE YEAR RULE — the maintenance wall planner, raised onto its own plate
          so it reads as the foreground instrument over the quiet deck. Twelve
          months on one tick-edged board; the load per month is drawn as a column
          whose height is the reading, and the current month is lit by the amber
          light source, exactly like today on the dispatch week board. The count
          stays printed above every bar — it is the whole point of the board.
          ------------------------------------------------------------------ */}
      <Plate className="overflow-hidden">
        <div className="ruleband" style={{ backgroundSize: "calc(100% / 12) 4px" }} />
        <div className="grid grid-cols-12 border-b border-line">
          {MONTH_ABBR.map((abbr, i) => {
            const isNow = i + 1 === thisMonth;
            const count = monthLoad[i];
            const barTone = isNow ? "var(--amber)" : "var(--slate)";
            return (
              <div
                key={abbr}
                className={cn(
                  "arm-col flex h-[92px] flex-col items-center justify-between pb-2 pt-2 min-[480px]:h-[116px]",
                  i > 0 && "border-l border-line",
                  isNow && "today-glow"
                )}
                style={{ ["--i" as string]: i } as React.CSSProperties}
                title={`${MONTH_NAMES[i + 1]} — ${count} ${count === 1 ? "visit" : "visits"} due`}
              >
                {/* The count reads first; weight carries the load so nine quiet
                    zeros sit under four bold columns. */}
                <Num
                  className={cn("t-body tabular-nums leading-none", count === 0 ? "font-normal" : "font-bold")}
                  tone={count === 0 ? "var(--ink-3)" : isNow ? "var(--amber-ink)" : "var(--ink)"}
                >
                  {count}
                </Num>
                {/* The column: height against the busiest month of the year. A
                    month with nothing due is the baseline, not a block — spent
                    ground the bars stand on. */}
                <div className="flex w-full flex-1 items-end justify-center px-[3px] py-1.5 min-[480px]:px-1.5">
                  {count > 0 && (
                    <div
                      className="w-full"
                      style={{
                        height: `${Math.max((count / maxLoad) * 100, 12)}%`,
                        background: barTone,
                      }}
                    />
                  )}
                </div>
                <span
                  className={cn("mono t-micro leading-none tracking-[0.09em]", isNow && "font-bold")}
                  style={{ color: isNow ? "var(--amber-ink)" : "var(--ink-3)" }}
                >
                  {abbr}
                </span>
              </div>
            );
          })}
        </div>
      </Plate>

      {/* The three headline figures as command-bridge plates: how many plans run,
          how many come due inside the booking window (amber-lamped when any do),
          and what the book is worth over a year. */}
      <section aria-label="The contract book at a glance" className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-3">
        <StatTile label="Active contracts" value={active.length} armIndex={0} />
        <StatTile
          label="Due within 45 days"
          value={dueSoon.length}
          lamp={dueSoon.length > 0}
          tone={dueSoon.length > 0 ? "var(--amber-ink)" : undefined}
          armIndex={1}
          foot={
            <p className="eyebrow leading-relaxed">
              {dueSoon.length > 0 ? "ready to book onto the board" : "nothing due soon"}
            </p>
          }
        />
        <StatTile
          label="Value per year"
          value={annualValueCents}
          money
          tone={annualValueCents > 0 ? "var(--emerald-ink)" : undefined}
          armIndex={2}
          className="col-span-2 lg:col-span-1"
          foot={
            <p className="eyebrow leading-relaxed">
              across <Num className="text-ink-2">{active.length}</Num> active {active.length === 1 ? "plan" : "plans"}
            </p>
          }
        />
      </section>

      {showForm && (
        <Plate className="p-5">
          <div className="eyebrow">New maintenance contract</div>
          <form onSubmit={createContract} className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field id="ct-client" label="Client" required className="sm:col-span-2">
              {(f) => (
                <select
                  {...f}
                  value={form.clientId}
                  onChange={(e) => setForm({ ...form, clientId: e.target.value })}
                >
                  <option value="">Pick a client…</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.address ? ` · ${c.address}` : ""}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Field id="ct-name" label="Contract name">
              {(f) => (
                <input
                  {...f}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              )}
            </Field>
            <Field id="ct-price" label="Price per visit" hint="Dollars, before tax.">
              {(f) => (
                <input
                  {...f}
                  type="number"
                  step="1"
                  value={form.pricePerVisit}
                  onChange={(e) => setForm({ ...form, pricePerVisit: Number(e.target.value) })}
                  className={cn(f.className, "mono")}
                />
              )}
            </Field>

            {/* A set of choices where one wins is a radio group. It was a row of
                buttons whose only state was a border colour, so a keyboard and a
                screen reader had nothing to go on. */}
            <div className="sm:col-span-2">
              <span className="eyebrow block" id="ct-schedule-label">
                Schedule
              </span>
              <div
                role="radiogroup"
                aria-labelledby="ct-schedule-label"
                className="mt-2 flex flex-wrap gap-2"
              >
                {CONTRACT_PLANS.map((p) => {
                  const picked = form.plan === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      role="radio"
                      aria-checked={picked}
                      onClick={() => setForm({ ...form, plan: p.id })}
                      className="flex items-center gap-2.5 rounded border px-3 py-2 text-left transition-[background-color,border-color] duration-fast ease-instrument"
                      style={{
                        borderColor: picked ? "var(--navy-900)" : "var(--line)",
                        background: picked ? "var(--sunk)" : "var(--plate)",
                      }}
                    >
                      <span
                        aria-hidden
                        className="inline-block h-2.5 w-2.5 shrink-0 rounded-full border"
                        style={{
                          borderColor: picked ? "var(--navy-900)" : "var(--field-line)",
                          background: picked ? "var(--navy-900)" : "transparent",
                        }}
                      />
                      <span>
                        <span className="t-body block font-bold leading-tight text-ink">
                          {p.label}
                        </span>
                        <span className="mono t-micro uppercase tracking-[0.08em] text-ink-3">
                          {p.months.map((m) => MONTH_NAMES[m]).join(" · ")}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className="t-meta measure mt-2 text-ink-2">
                {CONTRACT_PLANS.find((p) => p.id === form.plan)?.hint}
              </p>
            </div>

            <div className="sm:col-span-2">
              <label className="t-body flex items-center gap-2 text-ink-2">
                <input
                  type="checkbox"
                  checked={form.autoInvoice}
                  onChange={(e) => setForm({ ...form, autoInvoice: e.target.checked })}
                  className="h-3.5 w-3.5"
                />
                Draft an invoice when the visit is booked
              </label>
            </div>
            <Field id="ct-notes" label="Notes" className="sm:col-span-2">
              {(f) => (
                <input
                  {...f}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="Access code, pets, roof key…"
                />
              )}
            </Field>
            <div className="actions sm:col-span-2">
              <Button type="submit" variant="primary">
                Start contract
              </Button>
              <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </Plate>
      )}

      {/* ------------------------------------------------------------------
          THE CONTRACTS — ruled rows, each carrying its own 12-cell year strip:
          due next = amber under a tick, verifiably booked = emerald,
          past-unbooked = pale, still ahead = slate. The legend sits on the lane
          head, because four fills with nothing to read them by are one grey bar
          in sunlight.
          ------------------------------------------------------------------ */}
      <div>
        <LaneHead title="Contracts" right={rows.length > 0 ? <StripLegend /> : undefined} />
        {loading ? (
          <Skeleton lines={3} />
        ) : rows.length === 0 ? (
          <Empty
            hint="A contract puts the seasonal visits on the board a month ahead and bills them when they are done."
            action={
              <Button variant="primary" onClick={() => setShowForm(true)}>
                <Plus className="h-4 w-4" /> New contract
              </Button>
            }
          >
            No maintenance contracts on the book yet
          </Empty>
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
                    ? lateWord(c.daysUntilNext!, true)
                    : dueWord(c.daysUntilNext!, true)
                  : "NO SCHEDULE";
              const countdownTone = !c.active
                ? "var(--slate-ink)"
                : late
                  ? "var(--rose-ink)"
                  : due
                    ? "var(--amber-ink)"
                    : "var(--ink-3)";
              const cells = MONTH_INITIALS.map((_, i) => monthCellKind(c, i + 1, thisYear));
              const visitWords = c.visitMonths.map((m) => MONTH_NAMES[m]).join(", ");
              return (
                <div
                  key={c.id}
                  className="row row-hover"
                  style={{ ["--spine" as string]: spine } as React.CSSProperties}
                >
                  {/* line 1 — contract, client, price per visit */}
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <p className="min-w-0 truncate">
                      <span className="t-row font-bold leading-tight text-ink">{c.name}</span>{" "}
                      <span className="t-body text-ink-2">
                        <Link
                          href={`/clients/${c.client.id}`}
                          className="inline-flex py-0.5 font-medium text-ink underline underline-offset-4"
                        >
                          {c.client.name}
                        </Link>
                        {c.client.address ? ` · ${c.client.address}` : ""}
                      </span>
                    </p>
                    <span className="shrink-0 whitespace-nowrap">
                      <Money cents={c.pricePerVisitCents} className="t-body font-medium" />
                      <span className="eyebrow ml-1.5">/ visit</span>
                    </span>
                  </div>

                  {/* line 2 — the contract's own year rule. Three bands: the tick
                      that marks the next visit by SHAPE, the twelve cells, and
                      the month letters, which were set at 8px — 72 of them, the
                      whole group's drift off the scale in one place. */}
                  <div className="mt-3 grid w-max grid-cols-12 gap-x-[3px]" aria-hidden="true">
                    {cells.map((kind, i) => (
                      <div key={`t${i}`} className="h-1 w-[14px]">
                        {kind === "next" && (
                          <div className="h-1 w-full" style={{ background: "var(--amber-ink)" }} />
                        )}
                      </div>
                    ))}
                    {cells.map((kind, i) => (
                      <div
                        key={`c${i}`}
                        className="mt-1 flex h-3 w-[14px] items-end"
                        title={`${MONTH_NAMES[i + 1]} — ${CELL_WORD[kind]}`}
                      >
                        <div
                          className={cn("w-full", CELL_HEIGHT[kind])}
                          style={CELL_FILL[kind]}
                        />
                      </div>
                    ))}
                    {MONTH_INITIALS.map((letter, i) => (
                      <span
                        key={`l${i}`}
                        className="mono t-micro mt-1 w-[14px] text-center text-ink-3"
                      >
                        {letter}
                      </span>
                    ))}
                  </div>
                  <span className="sr-only t-body">
                    {`Visits in ${visitWords}. ${
                      c.nextVisit ? `Next visit ${formatDate(c.nextVisit)}.` : "No visit scheduled."
                    } ${c.visitsBooked} booked so far.`}
                  </span>

                  {/* line 3 — meta + the book action */}
                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                    {c.equipment && (
                      <Chip>
                        {c.equipment.kind.replace(/_/g, " ")}
                        {c.equipment.brand ? ` · ${c.equipment.brand}` : ""}
                      </Chip>
                    )}
                    {c.autoInvoice && (
                      <span className="mono t-meta tracking-[0.08em] text-ink-2">AUTO-INVOICE</span>
                    )}
                    <span className="mono t-meta tracking-[0.08em] text-ink-3">
                      {c.visitsBooked} BOOKED
                    </span>
                    <span
                      className="mono t-meta font-bold tracking-[0.08em]"
                      style={{ color: countdownTone }}
                    >
                      {countdown}
                    </span>
                    {c.active && c.nextVisit && (
                      <Button
                        variant="quiet"
                        disabled={busy}
                        onClick={() => book(c.id)}
                        className="ml-auto"
                      >
                        Book {formatDate(c.nextVisit)}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
