"use client";

/**
 * INVOICES — «the ledger» (DESIGN.md revision 3).
 *
 * This screen's device is the green-bar receivables book: an aging bar up top
 * (one stacked rule — where the money sits by state), then the body grouped into
 * aging bands, each row a single ledger line with a dotted leader walking the
 * eye to a right-aligned amount, each band closed by the accountant's double
 * rule over its subtotal. Search and the status filter fold into the first
 * lane head — the search-bar-first header is dead.
 */

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { isOverdue, daysOverdue, owingOf } from "@/lib/invoice-state";
import {
  PageHead,
  LaneHead,
  Row,
  Lane,
  Empty,
  Money,
  Skeleton,
} from "@/components/ui/primitives";

interface Invoice {
  id: string;
  number: string;
  clientName: string;
  total: number;
  amountPaid: number;
  status: string;
  issuedAt: string;
  dueDate: string | null;
  project: { id: string; title: string } | null;
}

const STATUSES = ["DRAFT", "SENT", "PARTIAL", "PAID", "VOID"];
/** "overdue" is derived, so it is filtered client-side rather than sent to the API. */
const OVERDUE = "overdue";

/** The aging-info column of a ledger line. Overdue lines are handled separately. */
function dueLabel(inv: Invoice) {
  if (inv.status === "PAID") return "PAID";
  if (inv.status === "VOID") return "VOID";
  if (inv.status === "DRAFT") return "DRAFT";
  if (!inv.dueDate) return "—";
  const due = new Date(inv.dueDate)
    .toLocaleDateString("en-US", { month: "short", day: "numeric" })
    .toUpperCase();
  return `DUE ${due}`;
}

const dueTime = (inv: Invoice) =>
  inv.dueDate ? new Date(inv.dueDate).getTime() : Number.POSITIVE_INFINITY;

interface Band {
  key: "overdue" | "awaiting" | "drafts" | "settled";
  label: string;
  lamp: string;
  rows: Invoice[];
  /** Band subtotal under the double rule. */
  sub: number;
  subLabel: string;
  subTone?: string;
}

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const params = useSearchParams();
  const [statusFilter, setStatusFilter] = useState(params.get("status") || "");

  useEffect(() => {
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    if (statusFilter && statusFilter !== OVERDUE) params.set("status", statusFilter);
    fetch(`/api/invoices?${params}`)
      .then((r) => r.json())
      .then((d) => {
        setInvoices(Array.isArray(d) ? d : []);
        setLoading(false);
      });
  }, [search, statusFilter]);

  const shown =
    statusFilter === OVERDUE ? invoices.filter((i) => isOverdue(i)) : invoices;
  const live = invoices.filter((i) => i.status !== "VOID");

  /* ------------------------------------------------------------------
     The aging bar — where the book's money sits, by state.
     ------------------------------------------------------------------ */
  const overdueAmt = live.filter((i) => isOverdue(i)).reduce((s, i) => s + owingOf(i), 0);
  const partialAmt = live
    .filter((i) => i.status === "PARTIAL" && !isOverdue(i))
    .reduce((s, i) => s + owingOf(i), 0);
  const openAmt = live
    .filter((i) => (i.status === "SENT" && !isOverdue(i)) || i.status === "DRAFT")
    .reduce((s, i) => s + owingOf(i), 0);
  const collected = live.reduce((s, i) => s + i.amountPaid, 0);

  const segments = [
    { key: "OVERDUE", amt: overdueAmt, bar: "var(--rose)", ink: "var(--rose-ink)" },
    { key: "PARTIAL", amt: partialAmt, bar: "var(--amber)", ink: "var(--amber-ink)" },
    { key: "OPEN", amt: openAmt, bar: "var(--sky)", ink: "var(--sky-ink)" },
    { key: "COLLECTED", amt: collected, bar: "var(--emerald)", ink: "var(--emerald-ink)" },
  ].filter((s) => s.amt > 0.005);
  const barTotal = segments.reduce((s, x) => s + x.amt, 0);

  /* ------------------------------------------------------------------
     Aging bands. Overdue first and dominant; settled compressed last.
     ------------------------------------------------------------------ */
  const overdueRows = shown
    .filter((i) => i.status === "OVERDUE" || isOverdue(i))
    .sort((a, b) => daysOverdue(b) - daysOverdue(a));
  const awaitingRows = shown
    .filter((i) => (i.status === "SENT" || i.status === "PARTIAL") && !isOverdue(i))
    .sort((a, b) => dueTime(a) - dueTime(b));
  const draftRows = shown.filter((i) => i.status === "DRAFT");
  const settledRows = shown.filter((i) => i.status === "PAID" || i.status === "VOID");

  const bands: Band[] = [
    {
      key: "overdue" as const,
      label: "Overdue",
      lamp: "var(--rose)",
      rows: overdueRows,
      sub: overdueRows.reduce((s, i) => s + owingOf(i), 0),
      subLabel: "Owed",
      subTone: "var(--rose-ink)",
    },
    {
      key: "awaiting" as const,
      label: "Awaiting payment",
      lamp: "var(--sky)",
      rows: awaitingRows,
      sub: awaitingRows.reduce((s, i) => s + owingOf(i), 0),
      subLabel: "Owed",
    },
    {
      key: "drafts" as const,
      label: "Drafts",
      lamp: "var(--slate)",
      rows: draftRows,
      sub: draftRows.reduce((s, i) => s + i.total, 0),
      subLabel: "Drafted",
    },
    {
      key: "settled" as const,
      label: "Settled",
      lamp: "var(--emerald)",
      rows: settledRows,
      sub: settledRows.reduce((s, i) => s + i.amountPaid, 0),
      subLabel: "Collected",
      subTone: "var(--emerald-ink)",
    },
  ].filter((b) => b.rows.length > 0);

  /* Search + filter live in the first lane head. Rendered at a stable tree
     position so the input keeps focus while results (and the first band) change. */
  const controls = (
    <div className="flex shrink-0 items-center gap-2">
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-3"
          strokeWidth={2}
        />
        <input
          placeholder="Number or client…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-[130px] py-1.5 pl-8 pr-2 text-[12px] sm:w-[180px] md:w-[220px]"
        />
      </div>
      <select
        value={statusFilter}
        onChange={(e) => setStatusFilter(e.target.value)}
        className="mono px-2 py-1.5 text-[11px] uppercase tracking-[0.06em]"
      >
        <option value="">All</option>
        <option value={OVERDUE}>Overdue</option>
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
    </div>
  );

  /** One ledger line: number · client · job ……… aging · amount. */
  function ledgerLine(inv: Invoice, band: Band) {
    const overdue = band.key === "overdue";
    const settled = band.key === "settled";
    const voided = inv.status === "VOID";
    const amount = settled
      ? voided
        ? inv.total
        : inv.amountPaid
      : band.key === "drafts"
        ? inv.total
        : owingOf(inv);
    return (
      <Row
        key={inv.id}
        href={`/invoices/${inv.id}`}
        status={overdue ? "OVERDUE" : inv.status}
        className={settled ? "!py-2" : "!py-2.5"}
      >
        <div className="flex items-baseline gap-3">
          {/* On a phone the number and the dot leader yield to the name —
              spine + aging + money carry the line. */}
          <span className="mono hidden shrink-0 text-[11px] tracking-[0.08em] text-ink-3 sm:inline">
            {inv.number}
          </span>
          <span
            className={`min-w-0 flex-1 truncate text-[14px] font-bold sm:flex-none ${
              settled ? "text-ink-2" : "text-ink"
            }`}
          >
            {inv.clientName}
          </span>
          {inv.project?.title && (
            <span className="hidden min-w-0 truncate text-[13px] text-ink-3 md:inline">
              {inv.project.title}
            </span>
          )}
          <span className="dotlead hidden sm:block" aria-hidden="true" />
          <span
            className="mono shrink-0 text-[11px] tracking-[0.04em]"
            style={{ color: overdue ? "var(--rose-ink)" : "var(--ink-3)" }}
          >
            {overdue ? `${daysOverdue(inv)}D LATE` : dueLabel(inv)}
          </span>
          <Money
            value={amount}
            className="shrink-0 text-[14px]"
            tone={
              settled
                ? voided
                  ? "var(--slate-ink)"
                  : "var(--emerald-ink)"
                : undefined
            }
          />
        </div>
      </Row>
    );
  }

  /** The double rule under a band: this line is final. */
  function bandSubtotal(band: Band) {
    return (
      <div className="flex justify-end">
        <div className="rule-double mt-1 flex min-w-[170px] items-baseline justify-between gap-6 pt-1.5">
          <span className="eyebrow">{band.subLabel}</span>
          <Money value={band.sub} className="text-[13px]" tone={band.subTone} />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-24 md:pb-0">
      <PageHead
        eyebrow="Billing"
        title="Invoices"
        sub="Issued from an accepted estimate — same lines, same totals, new number."
      />

      {/* The aging bar: one stacked rule — the whole book at a glance. */}
      <div className="border-b border-line pb-5">
        <div
          className="flex h-2 w-full"
          role="img"
          aria-label={
            barTotal > 0
              ? `Receivables aging: ${segments
                  .map((s) => `${s.key.toLowerCase()} ${formatCurrency(s.amt)}`)
                  .join(", ")}`
              : "No money on the books yet"
          }
        >
          {barTotal > 0 ? (
            segments.map((s) => (
              <div
                key={s.key}
                style={{ width: `${(s.amt / barTotal) * 100}%`, background: s.bar }}
              />
            ))
          ) : (
            <div className="w-full bg-sunk" />
          )}
        </div>
        <div className="mt-3 flex flex-wrap items-baseline gap-x-6 gap-y-2">
          {segments.length > 0 ? (
            segments.map((s) => (
              <div key={s.key} className="flex items-baseline gap-2">
                <span className="eyebrow" style={{ color: s.ink }}>
                  {s.key}
                </span>
                <Money value={s.amt} className="text-[13px]" tone={s.ink} />
              </div>
            ))
          ) : (
            <span className="eyebrow">No money on the books yet</span>
          )}
        </div>
      </div>

      {/* The body: aging bands. The first lane head carries search + filter and
          stays mounted, so the input never loses focus as bands change. */}
      <section>
        <LaneHead
          title={bands[0]?.label ?? "Ledger"}
          lamp={bands[0]?.lamp}
          right={controls}
        />
        {loading ? (
          <Skeleton lines={3} />
        ) : bands.length === 0 ? (
          <Empty>
            {statusFilter === OVERDUE
              ? "Nothing overdue — the street is clean"
              : "No invoices issued yet — start from a job estimate"}
          </Empty>
        ) : (
          <div className="space-y-8">
            {bands.map((band, i) => (
              <div key={band.key}>
                {i > 0 && (
                  <LaneHead
                    title={band.label}
                    lamp={band.lamp}
                    right={
                      <span className="eyebrow">
                        {band.rows.length} {band.rows.length === 1 ? "invoice" : "invoices"}
                      </span>
                    }
                  />
                )}
                <Lane>{band.rows.map((inv) => ledgerLine(inv, band))}</Lane>
                {bandSubtotal(band)}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
