import { formatCents, lineTotalCents, type LineItem } from "@/lib/money";

/**
 * The printable document — one renderer for estimates and invoices.
 *
 * It deliberately re-states the «НАРЯД» tokens inline instead of importing the app
 * stylesheet: this HTML is opened standalone, printed, and mailed as an attachment,
 * so it cannot depend on the app's CSS bundle being present.
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

const date = (d?: Date | string | null) =>
  d ? new Date(d).toLocaleDateString("en-CA") : "—";

export function renderDocument(doc: DocumentSpec): string {
  const owingCents = doc.totalCents - (doc.amountPaidCents ?? 0);
  const isInvoice = doc.kind === "INVOICE";
  const overdue =
    isInvoice &&
    doc.dueDate != null &&
    new Date(doc.dueDate) < new Date() &&
    owingCents > 0;

  // The supplier block. Each line appears only once it has been filled in, so a shop
  // that has not entered its HST number prints a clean sheet instead of an empty label.
  const b = doc.business ?? {};
  const supplierLines = [
    b.address && `<div>${esc(b.address)}</div>`,
    b.phone && `<div class="mono" style="font-size:12px">${esc(b.phone)}</div>`,
    b.email && `<div class="mono" style="font-size:12px">${esc(b.email)}</div>`,
    b.hstNumber &&
      `<div class="mono" style="font-size:12px">GST/HST ${esc(b.hstNumber)}</div>`,
  ].filter(Boolean);

  const supplier = supplierLines.length
    ? `<div style="margin-top:6px; color:var(--ink-3); line-height:1.5">${supplierLines.join("")}</div>`
    : "";

  const spine = overdue
    ? "var(--rose)"
    : doc.status === "PAID" || doc.status === "ACCEPTED"
      ? "var(--emerald)"
      : doc.status === "DRAFT"
        ? "var(--slate)"
        : "var(--sky)";

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
  :root {
    --ink: #131a26; --ink-2: #45536c; --ink-3: #5d6b82;
    --line: #d3dbe4; --deck: #edf0f4; --plate: #ffffff;
    --amber-ink: #7a5200; --sky: #2f6be0; --emerald: #1b7f55;
    --rose: #c7332f; --slate: #64748b; --navy: #0e1626;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 32px;
    background: var(--deck); color: var(--ink);
    font-family: "Chivo", system-ui, sans-serif; font-size: 14px; line-height: 1.45;
    -webkit-font-smoothing: antialiased;
  }
  .mono { font-family: "Chivo Mono", ui-monospace, monospace; font-variant-numeric: tabular-nums; }
  .eyebrow {
    font-family: "Chivo Mono", ui-monospace, monospace;
    font-size: 10px; letter-spacing: .09em; text-transform: uppercase; color: var(--ink-3);
  }
  .sheet {
    max-width: 760px; margin: 0 auto; background: var(--plate);
    border: 1px solid var(--line); border-left: 4px solid ${spine}; border-radius: 3px;
  }
  .head { display: flex; justify-content: space-between; gap: 32px; padding: 28px 32px; border-bottom: 1px solid var(--line); }
  .wordmark { font-size: 17px; font-weight: 900; letter-spacing: -.01em; }
  .docno { font-family: "Chivo Mono", monospace; font-size: 22px; font-weight: 700; margin-top: 6px; }
  .meta { text-align: right; font-size: 12px; }
  .meta div { margin-top: 3px; }
  .meta .k { color: var(--ink-3); margin-right: 10px; }
  table { width: 100%; border-collapse: collapse; }
  thead th {
    font-family: "Chivo Mono", monospace; font-size: 10px; font-weight: 500;
    letter-spacing: .09em; text-transform: uppercase; color: var(--ink-3);
    text-align: left; padding: 10px 12px; border-bottom: 1px solid var(--line);
  }
  thead th.r, td.r { text-align: right; }
  tbody td { padding: 11px 12px; border-bottom: 1px solid var(--line); }
  tbody td:first-child, thead th:first-child { padding-left: 32px; }
  tbody td:last-child, thead th:last-child { padding-right: 32px; }
  .totals { display: flex; justify-content: flex-end; padding: 20px 32px; }
  .totals dl { width: 260px; margin: 0; }
  .totals .row { display: flex; justify-content: space-between; padding: 3px 0; }
  .totals .grand { border-top: 1px solid var(--line); margin-top: 6px; padding-top: 8px; font-weight: 700; }
  .totals .grand .v { font-size: 18px; }
  .perf {
    height: 2px; margin: 0 32px;
    background-image: radial-gradient(circle, var(--ink-3) 1px, transparent 1.3px);
    background-size: 8px 2px; background-repeat: repeat-x;
  }
  .stub { display: flex; justify-content: space-between; align-items: flex-end; gap: 24px; padding: 18px 32px; }
  .notes { padding: 18px 32px; border-top: 1px solid var(--line); font-size: 13px; color: var(--ink-2); }
  .foot { padding: 18px 32px; border-top: 1px solid var(--line); font-size: 12px; color: var(--ink-3); }
  .status { font-family: "Chivo Mono", monospace; font-size: 10px; letter-spacing: .09em; text-transform: uppercase; color: ${spine}; }
  .print-btn {
    display: block; max-width: 760px; margin: 0 auto 16px;
    text-align: right;
  }
  .print-btn button {
    font-family: "Chivo Mono", monospace; font-size: 11px; letter-spacing: .06em; text-transform: uppercase;
    background: var(--navy); color: #fff; border: 0; border-radius: 3px; padding: 9px 14px; cursor: pointer;
  }
  @media print {
    body { background: #fff; padding: 0; }
    .sheet { border: 0; border-left: 4px solid ${spine}; max-width: none; }
    .print-btn { display: none; }
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
      <div class="eyebrow" style="margin-top:8px">${isInvoice ? "Invoice" : "Estimate"}</div>
      <div class="docno">${esc(doc.number)}</div>
      <div style="margin-top:14px; font-weight:700">${esc(doc.clientName)}</div>
      ${doc.address ? `<div style="color:var(--ink-2)">${esc(doc.address)}</div>` : ""}
      ${doc.phone ? `<div class="mono" style="font-size:12px; color:var(--ink-3)">${esc(doc.phone)}</div>` : ""}
      ${doc.email ? `<div class="mono" style="font-size:12px; color:var(--ink-3)">${esc(doc.email)}</div>` : ""}
    </div>
    <div class="meta">
      <div class="status">${overdue ? "OVERDUE" : esc(doc.status)}</div>
      <div style="margin-top:12px"><span class="k">Issued</span><span class="mono">${date(doc.issuedAt)}</span></div>
      ${
        isInvoice
          ? `<div><span class="k">Due</span><span class="mono" ${overdue ? 'style="color:var(--rose)"' : ""}>${date(doc.dueDate)}</span></div>`
          : `<div><span class="k">Valid until</span><span class="mono">${date(doc.validUntil)}</span></div>`
      }
      <div><span class="k">Job</span>${esc(doc.jobTitle)}</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Description</th>
        <th class="r">Qty</th>
        <th>Unit</th>
        <th class="r">Rate</th>
        <th class="r">Amount</th>
      </tr>
    </thead>
    <tbody>
      ${doc.lineItems
        .map(
          (i) => `<tr>
        <td>${esc(i.description)}</td>
        <td class="r mono" style="color:var(--ink-2)">${esc(i.qty)}</td>
        <td style="color:var(--ink-3)">${esc(i.unit)}</td>
        <td class="r mono" style="color:var(--ink-2)">${formatCents(i.unitPriceCents)}</td>
        <td class="r mono" style="font-weight:500">${formatCents(lineTotalCents(i))}</td>
      </tr>`
        )
        .join("")}
    </tbody>
  </table>

  <div class="totals">
    <dl>
      <div class="row"><span style="color:var(--ink-2)">Subtotal</span><span class="mono">${formatCents(doc.subtotalCents)}</span></div>
      <div class="row"><span style="color:var(--ink-2)">HST / GST</span><span class="mono">${formatCents(doc.taxCents)}</span></div>
      <div class="row grand"><span>TOTAL</span><span class="mono v">${formatCents(doc.totalCents)}</span></div>
      ${
        doc.amountPaidCents && doc.amountPaidCents > 0
          ? `<div class="row" style="margin-top:6px"><span style="color:var(--ink-2)">Paid</span><span class="mono" style="color:var(--emerald)">−${formatCents(doc.amountPaidCents)}</span></div>
             <div class="row grand"><span>OWING</span><span class="mono v" style="color:${owingCents > 0 ? "var(--rose)" : "var(--emerald)"}">${formatCents(Math.max(owingCents, 0))}</span></div>`
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
      <div class="mono" style="font-size:12px; color:var(--ink-2); margin-top:6px">${esc(doc.number)} · ${esc(doc.clientName)}</div>
      ${
        b.paymentInstructions
          ? `<div style="font-size:12px; color:var(--ink-2); margin-top:8px; max-width:46ch; white-space:pre-line">${esc(b.paymentInstructions)}</div>`
          : ""
      }
    </div>
    <div style="text-align:right">
      <div class="eyebrow">Amount due</div>
      <div class="mono" style="font-size:19px; font-weight:700; margin-top:4px">${formatCents(Math.max(owingCents, 0))}</div>
    </div>
  </div>`
      : `<div class="foot">To accept this estimate, reply to this email or call us. Prices hold until the date above.</div>`
  }
</div>

${doc.autoPrint ? "<script>window.addEventListener('load', () => window.print());</script>" : ""}
</body>
</html>`;
}
