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
  Readout,
  MeterBar,
  AgingBar,
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

  /* Issued paper still owed — SENT and PARTIAL, overdue or not. Drafts are excluded:
     a bill the client has never seen is not owed. This is the money on the street. */
  const owingOnStreetCents = overdueCents + partialCents + awaitingCents;
  const unpaidCount = live.filter(
    (i) => (i.status === "SENT" || i.status === "PARTIAL") && owingCents(i) > 0
  ).length;
  const overdueCount = live.filter((i) => isOverdue(i)).length;

  /* Owing split by how late it is — the aging book's headline instrument. On-terms
     (SENT/PARTIAL not yet due) sits in `current`; past due escalates amber→rose the
     same ladder the chase lane climbs. */
  let curCents = 0;
  let d1to30Cents = 0;
  let d31to60Cents = 0;
  let d60plusCents = 0;
  for (const i of live) {
    if (i.status !== "SENT" && i.status !== "PARTIAL") continue;
    const owe = owingCents(i);
    if (owe <= 0) continue;
    const late = daysOverdue(i);
    if (late <= 0) curCents += owe;
    else if (late <= 30) d1to30Cents += owe;
    else if (late <= 60) d31to60Cents += owe;
    else d60plusCents += owe;
  }

  const hasMoney = owingOnStreetCents + collectedCents + draftedCents > 0;

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

    /* THE PER-ROW METER — collected against what is still owed, tinted by how late
       the owed part is. A paid bill reads full emerald, a draft full slate, and an
       overdue bill's owed segment escalates amber (≤30) → rose (past a month) so the
       aging is legible on the row itself, not only in the well up top. */
    const paidPart = inv.amountPaidCents;
    const owePart = owingCents(inv);
    const late = daysOverdue(inv);
    let rowSegs: { value: number; tone: string; label?: string }[];
    if (settled) {
      rowSegs = voided
        ? [{ value: 1, tone: "var(--slate)" }]
        : [{ value: inv.totalCents, tone: "var(--emerald)", label: "Collected" }];
    } else if (band.key === "drafts") {
      rowSegs = [{ value: inv.totalCents, tone: "var(--slate)", label: "Not sent" }];
    } else {
      const oweTone = overdue
        ? late > 30
          ? "var(--rose)"
          : "var(--amber)"
        : "var(--sky)";
      rowSegs = [
        { value: paidPart, tone: "var(--emerald)", label: "Collected" },
        { value: owePart, tone: oweTone, label: "Owing" },
      ];
    }

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
        <MeterBar className="mt-2" height={3} segments={rowSegs} />
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

      {/* THE RECEIVABLES WELL — the whole book at a glance, sunk into the deck as
          the foreground instrument. Left: what is owed and how bad it is. Right: the
          owed-against-collected meter, then the same money split by age. The aging
          book, read top down. */}
      {hasMoney ? (
        <div className="border border-line bg-sunk px-5 py-5 md:px-6 md:py-6">
          <div className="grid gap-x-10 gap-y-6 md:grid-cols-[auto_minmax(0,1fr)] md:items-center">
            <div className="shrink-0">
              <div className="eyebrow">Owing on the street</div>
              <Readout
                value={formatCents(owingOnStreetCents)}
                tone={
                  overdueCount > 0
                    ? "var(--rose-ink)"
                    : owingOnStreetCents > 0
                      ? "var(--ink)"
                      : "var(--ink-3)"
                }
                className="mt-2 block"
              />
              <div className="eyebrow mt-2 text-ink-3">
                <Num>{unpaidCount}</Num> unpaid
                {overdueCount > 0 ? (
                  <>
                    {" · "}
                    <span style={{ color: "var(--rose-ink)" }}>
                      <Num>{overdueCount}</Num> overdue
                    </span>
                  </>
                ) : (
                  ""
                )}
              </div>
              {draftedCents > 0 && (
                <div className="eyebrow mt-1.5 text-ink-3">
                  <Money cents={draftedCents} className="t-micro" tone="var(--slate-ink)" /> in
                  drafts, not sent
                </div>
              )}
            </div>

            <div className="min-w-0">
              <div className="flex items-baseline justify-between gap-3">
                <span className="eyebrow">Collected against owing</span>
                <span className="eyebrow">
                  <Money cents={collectedCents} className="t-micro" tone="var(--emerald-ink)" /> in
                  {" · "}
                  <Money cents={owingOnStreetCents} className="t-micro" tone="var(--rose-ink)" /> out
                </span>
              </div>
              <MeterBar
                className="mt-2.5"
                height={10}
                segments={[
                  { value: collectedCents, tone: "var(--emerald)", label: "Collected" },
                  { value: owingOnStreetCents, tone: "var(--rose)", label: "Owing" },
                ]}
                ariaLabel="Collected against owing"
              />
              <div className="eyebrow mb-2.5 mt-5">Owing by age</div>
              <AgingBar
                height={10}
                showLabels
                buckets={{
                  currentCents: curCents,
                  d1to30Cents,
                  d31to60Cents,
                  d60plusCents,
                }}
              />
            </div>
          </div>
        </div>
      ) : (
        /* The book reads whatever the filter left behind, so empty has two meanings. */
        <div className="border-t border-line pt-4">
          <span className="eyebrow">
            {search || statusFilter
              ? "Nothing on the book matches that filter"
              : "No money on the books yet"}
          </span>
        </div>
      )}

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
