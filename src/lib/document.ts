import { formatCents, lineTotalCents, type LineItem } from "@/lib/money";
import { lateWord } from "@/lib/invoice-state";

/**
 * The printable document — one renderer for estimates and invoices.
 *
 * It deliberately re-states the «НАРЯД» tokens inline instead of importing the app
 * stylesheet: this HTML is opened standalone, printed, and mailed as an attachment,
 * so it cannot depend on the app's CSS bundle being present.
 *
 * This is the ONE screen in the product a client sees. Three things were fixed on
 * 2026-08-13 after looking at the actual print and the actual phone:
 *
 *   1. The head was a single column of eleven stacked lines — supplier, then the
 *      document number, then the client, all in the same styling. Nobody could tell
 *      where the shop ended and the customer began. It is now the shape a Canadian
 *      invoice has: supplier top left, the document and its dates top right, and a
 *      labelled BILL TO / JOB band under a rule.
 *   2. A printed line broke across the page: its description ended up on page 3 and
 *      its amount stayed on page 2. Rows, the totals and the stub now hold together,
 *      and every printed page carries the number and the client so a loose sheet can
 *      be put back where it belongs.
 *   3. On a phone — how half of these are read — the table pushed AMOUNT off the
 *      right edge of the sheet. Under 640px the lines stack instead.
 */

/**
 * The reference a client and a contractor say out loud. Derived from the record id, so
 * it is stable: the estimate list used to number by position on screen (EST-2026-001)
 * while the paper and the journal printed the id form (EST-2026-RQBV) — two names for
 * one document, and the positional one changed whenever an estimate was added.
 */
export function docRef(prefix: string, id: string, date: Date | string | null | undefined) {
  const year = (date ? new Date(date) : new Date()).getFullYear();
  return `${prefix}-${year}-${id.slice(-4).toUpperCase()}`;
}

/** The paper prints the same line the record stores — cents in, dollars on the page. */
export type DocLineItem = LineItem;

export interface DocumentSpec {
  kind: "ESTIMATE" | "INVOICE";
  number: string;
  status: string;
  businessName: string;
  /** The contractor's own details, as they must appear on the paper. */
  business?: {
    address?: string | null;
    phone?: string | null;
    email?: string | null;
    hstNumber?: string | null;
    paymentInstructions?: string | null;
  };
  clientName: string;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  jobTitle: string;
  lineItems: DocLineItem[];
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  amountPaidCents?: number;
  notes?: string | null;
  issuedAt: Date | string;
  dueDate?: Date | string | null;
  validUntil?: Date | string | null;
  /** Open the browser print dialog as soon as the page loads. */
  autoPrint?: boolean;
}

const esc = (s: unknown) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/**
 * One date form in the product, on screen and on paper: `Aug 13, 2026`.
 *
 * The sheet used to print `2026-08-13` while every screen behind it printed
 * `Aug 13, 2026` — and a purely numeric date is the one form a Canadian and an
 * American read differently (05-08 is May or August depending on the reader).
 */
const DATE = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "short",
  day: "numeric",
});
const date = (d?: Date | string | null) => (d ? DATE.format(new Date(d)) : "—");

/** Whole days past the due date, counted on the calendar the shop hangs on the wall. */
function daysPast(due: Date | string) {
  const d = new Date(due);
  const then = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((today.getTime() - then.getTime()) / 86_400_000);
}

export function renderDocument(doc: DocumentSpec): string {
  const owingCents = doc.totalCents - (doc.amountPaidCents ?? 0);
  const isInvoice = doc.kind === "INVOICE";
  const overdue =
    isInvoice &&
    doc.dueDate != null &&
    new Date(doc.dueDate) < new Date() &&
    owingCents > 0;
  const late = overdue && doc.dueDate ? daysPast(doc.dueDate) : 0;
  const isDraft = doc.status === "DRAFT";

  // The supplier block. Each line appears only once it has been filled in, so a shop
  // that has not entered its HST number prints a clean sheet instead of an empty label.
  const b = doc.business ?? {};
  const supplierLines = [
    b.address && `<div>${esc(b.address)}</div>`,
    b.phone && `<div class="mono t-meta">${esc(b.phone)}</div>`,
    b.email && `<div class="mono t-meta">${esc(b.email)}</div>`,
    b.hstNumber && `<div class="mono t-meta">GST/HST ${esc(b.hstNumber)}</div>`,
  ].filter(Boolean);

  const supplier = supplierLines.length
    ? `<div class="supplier">${supplierLines.join("")}</div>`
    : "";

  const clientLines = [
    doc.address && `<div class="t-body ink-2">${esc(doc.address)}</div>`,
    doc.phone && `<div class="mono t-meta ink-3">${esc(doc.phone)}</div>`,
    doc.email && `<div class="mono t-meta ink-3">${esc(doc.email)}</div>`,
  ].filter(Boolean);

  const spine = overdue
    ? "var(--rose)"
    : doc.status === "PAID" || doc.status === "ACCEPTED"
      ? "var(--emerald)"
      : doc.status === "DRAFT"
        ? "var(--slate)"
        : "var(--sky)";

  /**
   * The corner of the sheet the CLIENT holds. It used to print the database status,
   * so a live estimate said `SENT` (which tells him nothing) and a turned-down one
   * said `REJECTED` (which tells him more than the contractor meant to).
   */
  const PAPER_STATUS: Record<string, string> = {
    DRAFT: "DRAFT",
    SENT: "",
    PARTIAL: "PART PAID",
    PAID: "PAID IN FULL",
    VOID: "CANCELLED",
    ACCEPTED: "ACCEPTED",
    REJECTED: "",
    DECLINED: "",
  };
  const statusWord = overdue
    ? `OVERDUE · ${lateWord(late)}`
    : (PAPER_STATUS[doc.status] ?? "");

  const rows = doc.lineItems
    .map(
      (i) => `<tr>
        <td class="desc">${esc(i.description)}</td>
        <td class="r mono num qty">${esc(i.qty)}</td>
        <td class="mono num unit">${esc(i.unit)}</td>
        <td class="r mono num rate">${formatCents(i.unitPriceCents)}</td>
        <td class="r mono num amt">${formatCents(lineTotalCents(i))}</td>
      </tr>`
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(doc.number)} — ${esc(doc.clientName)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Chivo:wght@400;500;700;900&family=Chivo+Mono:wght@400;500;700&display=swap" rel="stylesheet">
<style>
  /* The «НАРЯД» tokens, copied because this sheet travels alone. Kept in step with
     src/app/globals.css — the copy had drifted (--ink-3 was still the pre-2026-08-12
     #5d6b82, which is the value that failed AA on a recessed lane). The one deliberate
     difference: paper is white. --plate is #fbfcfd on a screen because a screen has a
     deck behind it; a sheet coming out of a printer is the paper's own white. */
  :root {
    --ink: #131a26;
    --ink-2: #45536c;
    --ink-3: #59677d;
    --line: #d3dbe4;
    --deck: #edf0f4;
    --paper: #ffffff;
    --sunk: #e1e7ee;
    --amber-ink: #7a5200;
    --sky: #2f6be0;
    --emerald: #1b7f55;
    --emerald-ink: #17714b;
    --rose: #c7332f;
    --rose-ink: #b82b27;
    --slate: #64748b;
    --slate-ink: #5a6979;
    --navy: #0e1626;
    --r: 3px;
    /* The type scale, the same ten steps the product uses. */
    --fs-micro: 10px;
    --fs-eyebrow: 11px;
    --fs-meta: 12px;
    --fs-body: 13px;
    --fs-lede: 14px;
    --fs-row: 15px;
    --fs-record: 22px;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 32px 24px;
    background: var(--deck); color: var(--ink);
    font-family: "Chivo", system-ui, sans-serif; font-size: var(--fs-lede); line-height: 1.45;
    -webkit-font-smoothing: antialiased;
  }
  .mono { font-family: "Chivo Mono", ui-monospace, monospace; font-variant-numeric: tabular-nums; }
  .t-micro { font-size: var(--fs-micro); }
  .t-meta { font-size: var(--fs-meta); }
  .t-body { font-size: var(--fs-body); }
  .ink-2 { color: var(--ink-2); }
  .ink-3 { color: var(--ink-3); }
  .eyebrow {
    font-family: "Chivo Mono", ui-monospace, monospace;
    font-size: var(--fs-eyebrow); line-height: 1;
    letter-spacing: .09em; text-transform: uppercase; color: var(--ink-3);
  }
  .sheet {
    max-width: 760px; margin: 0 auto; background: var(--paper);
    border: 1px solid var(--line); border-left: 4px solid ${spine}; border-radius: var(--r);
  }

  /* THE HEAD — supplier left, document right. */
  .head { display: flex; justify-content: space-between; gap: 32px; padding: 28px 32px 20px; }
  /* The letterhead and the document number are the sheet's two anchors, so they
     carry the same weight: the shop on the left, what this piece of paper is on
     the right. Everything else on the head is detail underneath one of them. */
  .wordmark { font-size: var(--fs-record); font-weight: 900; letter-spacing: -.02em; line-height: 1.1; }
  .supplier { margin-top: 6px; color: var(--ink-3); line-height: 1.5; }
  .docblock { text-align: right; flex: 0 0 auto; }
  .docno { font-family: "Chivo Mono", monospace; font-size: var(--fs-record); font-weight: 700; margin-top: 4px; letter-spacing: -.01em; }
  .docdates { margin-top: 12px; }
  .docdates div { display: flex; justify-content: flex-end; gap: 12px; margin-top: 4px; }
  .docdates .k { color: var(--ink-3); }
  .status { font-family: "Chivo Mono", monospace; font-size: var(--fs-eyebrow); letter-spacing: .09em; text-transform: uppercase; color: ${spine}; }
  .draftmark { margin: 0 32px; padding: 8px 0; border-top: 1px solid var(--line); color: var(--slate-ink); }

  /* WHO AND WHAT — the band a bookkeeper looks for first. */
  .parties { display: flex; gap: 40px; padding: 16px 32px 20px; border-top: 1px solid var(--line); }
  .parties > div { min-width: 0; }
  .party-name { font-size: var(--fs-row); font-weight: 700; margin-top: 6px; }
  .job { font-size: var(--fs-body); margin-top: 6px; color: var(--ink-2); }

  /* THE LINES */
  table { width: 100%; border-collapse: collapse; }
  thead th {
    font-family: "Chivo Mono", monospace; font-size: var(--fs-micro); font-weight: 500;
    letter-spacing: .09em; text-transform: uppercase; color: var(--ink-3);
    text-align: left; padding: 10px 12px; border-top: 1px solid var(--line); border-bottom: 1px solid var(--line);
  }
  thead th.r, td.r { text-align: right; }
  /* Printed on every page: a loose second sheet still says whose bill it is. */
  thead tr.runhead th { display: none; }
  tbody td { padding: 11px 12px; border-bottom: 1px solid var(--line); font-size: var(--fs-body); }
  tbody td.desc { font-size: var(--fs-lede); }
  td.num { color: var(--ink-2); white-space: nowrap; }
  td.amt { color: var(--ink); font-weight: 500; }
  tbody td:first-child, thead th:first-child { padding-left: 32px; }
  tbody td:last-child, thead th:last-child { padding-right: 32px; }
  /* A line holds together. Split across a page break, its description landed on one
     sheet and its amount on the other. */
  tr { break-inside: avoid; page-break-inside: avoid; }

  /* THE TOTALS — one block, never split. */
  .totals { display: flex; justify-content: flex-end; padding: 20px 32px; break-inside: avoid; page-break-inside: avoid; }
  .totals dl { width: 280px; margin: 0; }
  .totals .row { display: flex; justify-content: space-between; gap: 24px; padding: 3px 0; font-size: var(--fs-body); }
  .totals .row .l { color: var(--ink-2); }
  .totals .grand { border-top: 1px solid var(--line); margin-top: 6px; padding-top: 8px; font-weight: 700; }
  .totals .grand .l { color: var(--ink); font-family: "Chivo Mono", monospace; font-size: var(--fs-eyebrow); letter-spacing: .09em; text-transform: uppercase; }
  .totals .grand .v { font-size: 19px; }

  .perf {
    height: 2px; margin: 0 32px;
    background-image: radial-gradient(circle, var(--ink-3) 1px, transparent 1.3px);
    background-size: 8px 2px; background-repeat: repeat-x;
  }
  .stub { display: flex; justify-content: space-between; align-items: flex-end; gap: 24px; padding: 18px 32px; break-inside: avoid; page-break-inside: avoid; }
  .stub .due { font-family: "Chivo Mono", monospace; font-size: 19px; font-weight: 700; margin-top: 4px; }
  .pay { font-size: var(--fs-meta); color: var(--ink-2); margin-top: 8px; max-width: 46ch; white-space: pre-line; }
  .notes { padding: 18px 32px; border-top: 1px solid var(--line); font-size: var(--fs-body); color: var(--ink-2); break-inside: avoid; }
  .foot { padding: 18px 32px; border-top: 1px solid var(--line); font-size: var(--fs-meta); color: var(--ink-3); break-inside: avoid; }
  /* The estimate's own stub: where a client signs it off. */
  .sign { display: flex; gap: 32px; padding: 18px 32px 24px; break-inside: avoid; }
  .sign > div { flex: 1 1 0; }
  .signline { margin-top: 26px; border-bottom: 1px solid var(--ink-3); }

  .print-btn { display: block; max-width: 760px; margin: 0 auto 16px; text-align: right; }
  .print-btn button {
    font-family: "Chivo Mono", monospace; font-size: var(--fs-eyebrow); letter-spacing: .06em; text-transform: uppercase;
    background: var(--navy); color: var(--paper); border: 0; border-radius: var(--r); padding: 11px 14px; cursor: pointer;
  }
  .print-btn button:focus-visible { outline: 2px solid var(--navy); outline-offset: 2px; }

  /* THE PHONE — half of these are opened on one. The table used to push AMOUNT off
     the right edge of the sheet, so the client read the rate and never the money. */
  @media (max-width: 640px) {
    body { padding: 16px 12px; }
    .head { flex-direction: column; gap: 16px; padding: 20px 16px 16px; }
    .docblock { text-align: left; }
    .docdates div { justify-content: flex-start; }
    .parties { flex-direction: column; gap: 16px; padding: 14px 16px 16px; }
    .draftmark { margin: 0 16px; }
    thead { display: none; }
    tbody tr { display: block; border-bottom: 1px solid var(--line); padding: 10px 16px; overflow: hidden; }
    tbody tr:last-child { border-bottom: 0; }
    /* The desk's column padding would otherwise indent the stacked line by 32px on
       one side and hold the amount 32px off the edge on the other. */
    tbody td { display: inline; border: 0; padding: 0; }
    tbody td:first-child, tbody td:last-child { padding: 0; }
    tbody td.desc { display: block; font-size: var(--fs-body); font-weight: 500; }
    td.qty, td.unit, td.rate { font-size: var(--fs-meta); }
    td.rate::before { content: " × "; color: var(--ink-3); }
    /* Quantity, rate and amount stay on one line: 8 hr × $115.00 …… $920.00 */
    td.amt { float: right; font-size: var(--fs-lede); font-weight: 700; }
    /* The lines lose their closing rule when the last one drops it, so the totals
       block brings its own — otherwise the money runs straight out of the work. */
    .totals { padding: 16px; border-top: 1px solid var(--line); }
    .totals dl { width: 100%; }
    .perf { margin: 0 16px; }
    .stub, .sign { flex-direction: column; align-items: stretch; gap: 12px; padding: 16px; }
    .stub .amt-due { text-align: left; }
    .notes, .foot { padding: 14px 16px; }
  }

  @media print {
    body { background: var(--paper); padding: 0; font-size: var(--fs-body); }
    .sheet { border: 0; border-left: 4px solid ${spine}; max-width: none; border-radius: 0; }
    .print-btn { display: none; }
    /* The column heads repeat on every page (the browser does that for a thead), and
       this line rides with them: page two of a bill names its own invoice. */
    thead tr.runhead th {
      display: table-cell; border-top: 0; border-bottom: 0; padding-bottom: 0;
      text-transform: none; letter-spacing: .04em; color: var(--ink-3);
    }
    @page { size: A4; margin: 14mm; }
  }
</style>
</head>
<body>
<div class="print-btn"><button onclick="window.print()">Print / save as PDF</button></div>

<div class="sheet">
  <div class="head">
    <div>
      <div class="wordmark">${esc(doc.businessName)}</div>
      ${supplier}
    </div>
    <div class="docblock">
      <div class="eyebrow">${isInvoice ? "Invoice" : "Estimate"}</div>
      <div class="docno">${esc(doc.number)}</div>
      <div class="docdates t-meta">
        <div><span class="k">Issued</span><span class="mono">${date(doc.issuedAt)}</span></div>
        ${
          isInvoice
            ? `<div><span class="k">Due</span><span class="mono" ${overdue ? 'style="color:var(--rose-ink)"' : ""}>${date(doc.dueDate)}</span></div>`
            : doc.validUntil
              ? `<div><span class="k">Valid until</span><span class="mono">${date(doc.validUntil)}</span></div>`
              : ""
        }
        <div style="margin-top:8px"><span class="status">${esc(statusWord)}</span></div>
      </div>
    </div>
  </div>

  ${
    isDraft
      ? `<div class="draftmark eyebrow">Draft — not issued yet</div>`
      : ""
  }

  <div class="parties">
    <div style="flex:1 1 0">
      <div class="eyebrow">${isInvoice ? "Bill to" : "Prepared for"}</div>
      <div class="party-name">${esc(doc.clientName)}</div>
      ${clientLines.join("")}
    </div>
    <div style="flex:1 1 0">
      <div class="eyebrow">Job</div>
      <div class="job">${esc(doc.jobTitle)}</div>
    </div>
  </div>

  <table>
    <thead>
      <tr class="runhead">
        <th colspan="5" class="mono t-micro">${esc(doc.number)} · ${esc(doc.clientName)}</th>
      </tr>
      <tr>
        <th>Description</th>
        <th class="r">Qty</th>
        <th>Unit</th>
        <th class="r">Rate</th>
        <th class="r">Amount</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>

  <div class="totals">
    <dl>
      <div class="row"><span class="l">Subtotal</span><span class="mono">${formatCents(doc.subtotalCents)}</span></div>
      <div class="row"><span class="l">HST</span><span class="mono">${formatCents(doc.taxCents)}</span></div>
      <div class="row grand"><span class="l">TOTAL</span><span class="mono v">${formatCents(doc.totalCents)}</span></div>
      ${
        doc.amountPaidCents && doc.amountPaidCents > 0
          ? `<div class="row" style="margin-top:6px"><span class="l">Paid</span><span class="mono" style="color:var(--emerald-ink)">−${formatCents(doc.amountPaidCents)}</span></div>
             <div class="row grand"><span class="l">${isInvoice ? "OWING" : "BALANCE"}</span><span class="mono v" style="color:${owingCents > 0 ? "var(--rose-ink)" : "var(--emerald-ink)"}">${formatCents(Math.max(owingCents, 0))}</span></div>`
          : ""
      }
    </dl>
  </div>

  ${doc.notes ? `<div class="notes"><div class="eyebrow">Notes</div><div style="margin-top:6px">${esc(doc.notes)}</div></div>` : ""}

  ${
    isInvoice
      ? `<div class="perf"></div>
  <div class="stub">
    <div>
      <div class="eyebrow">Remittance stub</div>
      <div class="mono t-meta ink-2" style="margin-top:6px">${esc(doc.number)} · ${esc(doc.clientName)}</div>
      ${
        b.paymentInstructions
          ? `<div class="pay">${esc(b.paymentInstructions)}</div>`
          : b.email
            ? `<div class="pay">Return this stub with payment, or reply to ${esc(b.email)} to arrange it.</div>`
            : `<div class="pay">Ask us where to send payment — reply to the message this invoice came with.</div>`
      }
    </div>
    <div class="amt-due" style="text-align:right">
      <div class="eyebrow">Amount due</div>
      <div class="due" ${overdue ? 'style="color:var(--rose-ink)"' : ""}>${formatCents(Math.max(owingCents, 0))}</div>
    </div>
  </div>
  <div class="foot">Amounts in Canadian dollars.${b.hstNumber ? ` GST/HST ${esc(b.hstNumber)}.` : ""}</div>`
      : `<div class="perf"></div>
  <div class="sign">
    <div>
      <div class="eyebrow">Accepted by</div>
      <div class="signline"></div>
      <div class="t-meta ink-3" style="margin-top:6px">Signature</div>
    </div>
    <div>
      <div class="eyebrow">Date</div>
      <div class="signline"></div>
      <div class="t-meta ink-3" style="margin-top:6px">${esc(doc.validUntil ? `Prices hold until ${date(doc.validUntil)}` : "Prices hold for 30 days from the date issued")}</div>
    </div>
  </div>
  <div class="foot">Sign and return this page, or reply to the message this estimate came with. Amounts in Canadian dollars.</div>`
  }
</div>

${doc.autoPrint ? "<script>window.addEventListener('load', () => window.print());</script>" : ""}
</body>
</html>`;
}
