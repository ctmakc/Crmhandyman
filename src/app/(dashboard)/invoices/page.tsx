"use client";

/**
 * INVOICES — «the ledger» (DESIGN.md revision 3).
 *
 * This screen's device is the green-bar receivables book: an aging bar up top
 * (one stacked rule — where the money sits by state), then the body grouped into
 * aging bands, each row a single ledger line with a dotted leader walking the
 * eye to a right-aligned amount, each band closed by the accountant's double
 * rule over its subtotal.
 *
 * Search and the state filter sit on their own rule under the aging bar. Folded
 * into the first band's head (where they lived until 2026-08-13) they read as
 * that band's controls, and whichever band happened to come first was the one
 * band without a count beside its name.
 */

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { formatCents, inCents, type InCents } from "@/lib/money";
import { isOverdue, daysOverdue, lateWord, owingCents } from "@/lib/invoice-state";
import {
  PageHead,
  LaneHead,
  Row,
  Lane,
  Empty,
  Money,
  Num,
  Skeleton,
  Button,
  controlClass,
} from "@/components/ui/primitives";

/** What the API serves — dollars, because that is what an API client reads. */
interface ApiInvoice {
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

/** What this screen works in. Every band subtotal below is an integer sum of integers. */
type Invoice = InCents<ApiInvoice>;

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
  /** A lamp marks a lane that is live today. Settled is an archive; it gets none. */
  lamp?: string;
  rows: Invoice[];
  /** Band subtotal under the double rule. */
  subCents: number;
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
      .then((d: ApiInvoice[]) => {
        // The one door on this screen: dollars off the wire, cents from here on.
        setInvoices(Array.isArray(d) ? inCents(d) : []);
        setLoading(false);
      });
  }, [search, statusFilter]);

  const shown =
    statusFilter === OVERDUE ? invoices.filter((i) => isOverdue(i)) : invoices;
  const live = invoices.filter((i) => i.status !== "VOID");

  /* ------------------------------------------------------------------
     The aging bar — where the book's money sits, by state.
     ------------------------------------------------------------------ */
  const overdueCents = live.filter((i) => isOverdue(i)).reduce((s, i) => s + owingCents(i), 0);
  const partialCents = live
    .filter((i) => i.status === "PARTIAL" && !isOverdue(i))
    .reduce((s, i) => s + owingCents(i), 0);
  /* `OPEN` used to hold SENT and DRAFT together, and on a real book the drafts are
     the bigger half: $19,741 of paper the client has never seen was being read as
     receivables. The bar now names exactly the same four bands the rows below are
     grouped into, so the reader can match a segment to a lane by its word. */
  const awaitingCents = live
    .filter((i) => i.status === "SENT" && !isOverdue(i))
    .reduce((s, i) => s + owingCents(i), 0);
  const draftedCents = live
    .filter((i) => i.status === "DRAFT")
    .reduce((s, i) => s + i.totalCents, 0);
  const collectedCents = live.reduce((s, i) => s + i.amountPaidCents, 0);

  const segments = [
    { key: "OVERDUE", amt: overdueCents, bar: "var(--rose)", ink: "var(--rose-ink)" },
    { key: "PARTIAL", amt: partialCents, bar: "var(--amber)", ink: "var(--amber-ink)" },
    { key: "AWAITING", amt: awaitingCents, bar: "var(--sky)", ink: "var(--sky-ink)" },
    { key: "DRAFTS", amt: draftedCents, bar: "var(--slate)", ink: "var(--slate-ink)" },
    { key: "COLLECTED", amt: collectedCents, bar: "var(--emerald)", ink: "var(--emerald-ink)" },
  ].filter((s) => s.amt > 0);
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
      subCents: overdueRows.reduce((s, i) => s + owingCents(i), 0),
      subLabel: "Owing",
      subTone: "var(--rose-ink)",
    },
    {
      key: "awaiting" as const,
      label: "Awaiting payment",
      lamp: "var(--sky)",
      rows: awaitingRows,
      subCents: awaitingRows.reduce((s, i) => s + owingCents(i), 0),
      subLabel: "Owing",
    },
    {
      key: "drafts" as const,
      label: "Drafts",
      lamp: "var(--slate)",
      rows: draftRows,
      subCents: draftRows.reduce((s, i) => s + i.totalCents, 0),
      subLabel: "Drafted",
    },
    {
      key: "settled" as const,
      label: "Settled",
      rows: settledRows,
      subCents: settledRows.reduce((s, i) => s + i.amountPaidCents, 0),
      subLabel: "Collected",
      subTone: "var(--emerald-ink)",
    },
  ].filter((b) => b.rows.length > 0);

  /* Search and the status filter narrow the WHOLE book, so they sit on the book's
     own rule under the aging bar. Folded into the first band's head they read as
     that band's controls, and the band that happened to be first lost its count. */
  const controls = (
    <div className="flex flex-wrap items-center gap-2 border-b border-line pb-4">
      <label htmlFor="inv-search" className="sr-only">
        Search invoices by number or client
      </label>
      <div className="relative min-w-0 flex-1 sm:max-w-[280px]">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-3"
          strokeWidth={2}
          aria-hidden
        />
        <input
          id="inv-search"
          placeholder="Number or client…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={controlClass()}
          /* `.control` is a class and Tailwind's padding utilities are classes too —
             the one written later in the sheet wins, and that is `.control`. The
             clearance for the magnifier is spelled where nothing can override it. */
          style={{ paddingLeft: 34 }}
        />
      </div>
      <label htmlFor="inv-status" className="sr-only">
        Show only invoices in one state
      </label>
      {/* Same reason: the box is sized by its wrapper, since `.control` owns width. */}
      <div className="w-[132px] shrink-0">
        <select
          id="inv-status"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className={controlClass("mono uppercase tracking-[0.06em]")}
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
    </div>
  );

  /** One ledger line: number · client · job ……… aging · amount. */
  function ledgerLine(inv: Invoice, band: Band) {
    const overdue = band.key === "overdue";
    const settled = band.key === "settled";
    const voided = inv.status === "VOID";
    const amountCents = settled
      ? voided
        ? inv.totalCents
        : inv.amountPaidCents
      : band.key === "drafts"
        ? inv.totalCents
        : owingCents(inv);
    return (
      <Row
        key={inv.id}
        href={`/invoices/${inv.id}`}
        status={overdue ? "OVERDUE" : inv.status}
        className="row-tight"
      >
        <div className="flex items-baseline gap-3">
          {/* On a phone the number and the dot leader yield to the name —
              spine + aging + money carry the line. */}
          <span className="eyebrow hidden shrink-0 tracking-[0.08em] sm:inline">
            {inv.number}
          </span>
          <span
            className={`t-row min-w-0 flex-1 truncate font-bold sm:flex-none ${
              settled ? "text-ink-2" : "text-ink"
            }`}
          >
            {inv.clientName}
          </span>
          {inv.project?.title && (
            <span className="t-body hidden min-w-0 truncate text-ink-3 md:inline">
              {inv.project.title}
            </span>
          )}
          <span className="dotlead hidden sm:block" aria-hidden="true" />
          {/* Two fixed columns down the right edge. Sized to the widest thing each
              one holds, so the aging word and the money keep their own line of
              travel instead of sliding left when a bill runs to five figures. */}
          {/* On the phone this column yields for the two bands whose head already
              says the word — DRAFT under DRAFTS, PAID under SETTLED — and the client
              gets his whole name back. Lateness never yields: it is the reason the
              row is being read. */}
          <span
            className={`eyebrow w-[84px] shrink-0 text-right tracking-[0.04em] ${
              overdue || band.key === "awaiting" ? "" : "hidden sm:inline"
            }`}
            style={{ color: overdue ? "var(--rose-ink)" : "var(--ink-3)" }}
          >
            {overdue ? lateWord(daysOverdue(inv), true) : dueLabel(inv)}
          </span>
          <Money
            cents={amountCents}
            className="t-lede w-[100px] shrink-0 text-right"
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
      <div className="flex justify-end pr-4">
        <div className="rule-double mt-1 flex min-w-[190px] items-baseline justify-between gap-6 pt-1.5">
          <span className="eyebrow">{band.subLabel}</span>
          <Money cents={band.subCents} className="t-body" tone={band.subTone} />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-10 pb-24 md:pb-0">
      <PageHead
        eyebrow="Billing"
        title="Invoices"
        sub="Issued from an accepted estimate — same lines, same totals, new number."
      />

      {/* THE AGING BAR: one stacked rule — the whole book at a glance.
          It was an 8px band of solid colour running the width of the deck, which
          made the semantic hues read as paint. A rule states the same proportion
          and lets the readouts under it carry the weight. */}
      <div>
        <div
          className="flex h-1 w-full gap-px overflow-hidden bg-sunk"
          role="img"
          aria-label={
            barTotal > 0
              ? `Receivables aging: ${segments
                  .map((s) => `${s.key.toLowerCase()} ${formatCents(s.amt)}`)
                  .join(", ")}`
              : "No money on the books yet"
          }
        >
          {barTotal > 0 &&
            segments.map((s) => (
              <div
                key={s.key}
                style={{ width: `${(s.amt / barTotal) * 100}%`, background: s.bar }}
              />
            ))}
        </div>
        <div className="mt-4 flex flex-wrap items-baseline gap-x-10 gap-y-3">
          {segments.length > 0 ? (
            segments.map((s) => (
              <div key={s.key} className="flex flex-col gap-1.5">
                <span className="eyebrow" style={{ color: s.ink }}>
                  {s.key}
                </span>
                <Money cents={s.amt} className="t-row" tone={s.ink} />
              </div>
            ))
          ) : (
            /* The bar reads whatever the filter left behind, so an empty bar has
               two meanings. Saying «no money on the books» over a $26,900 book
               that a search box is hiding is the screen telling a lie. */
            <span className="eyebrow">
              {search || statusFilter
                ? "Nothing on the book matches that filter"
                : "No money on the books yet"}
            </span>
          )}
        </div>
      </div>

      {controls}

      {/* The body: aging bands, overdue first. */}
      <section className="space-y-10">
        {loading ? (
          <Skeleton lines={3} />
        ) : bands.length === 0 ? (
          <Empty
            /* Two ways to empty the book, two answers. A typed search echoes the
               words back and says where it looked; a state filter that caught
               nothing is about the state, not a search nobody ran — the hint that
               named «the invoice number and the client name» read as a lie under
               a PAID filter with an empty search box. */
            hint={
              search
                ? `Nothing matches “${search}”. The search runs over the invoice number and the client name.`
                : statusFilter
                  ? "No invoice is in that state right now."
                  : "An accepted estimate turns into an invoice on the job it came from."
            }
            action={
              search || statusFilter ? (
                <Button
                  variant="quiet"
                  onClick={() => {
                    setSearch("");
                    setStatusFilter("");
                  }}
                >
                  {search ? "Clear search" : "Clear filter"}
                </Button>
              ) : undefined
            }
          >
            {statusFilter === OVERDUE
              ? "Nothing overdue — the street is clean"
              : search || statusFilter
                ? "No invoice matches that"
                : "No invoices issued yet"}
          </Empty>
        ) : (
          bands.map((band) => (
            <div key={band.key}>
              <LaneHead
                title={band.label}
                lamp={band.lamp}
                right={
                  <span className="eyebrow">
                    <Num>{band.rows.length}</Num>{" "}
                    {band.rows.length === 1 ? "invoice" : "invoices"}
                  </span>
                }
              />
              <Lane>{band.rows.map((inv) => ledgerLine(inv, band))}</Lane>
              {bandSubtotal(band)}
            </div>
          ))
        )}
      </section>
    </div>
  );
}
