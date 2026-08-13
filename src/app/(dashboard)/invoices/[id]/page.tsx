"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Printer } from "lucide-react";
import {
  formatCents,
  inCents,
  lineTotalCents,
  parseLineItems,
  toCents,
  toDollars,
  type InCents,
  type LineItem,
} from "@/lib/money";
import { buttonClass, Empty, spineFor, textToneFor, Skeleton } from "@/components/ui/primitives";
import { toast } from "@/components/ui/Toaster";
import { isOverdue, daysOverdue, chaseStage } from "@/lib/invoice-state";

interface ApiPayment {
  id: string;
  amount: number;
  method: string;
  date: string;
  notes?: string | null;
}

/** The payload as the API serves it: dollars. */
interface ApiInvoice {
  id: string;
  number: string;
  clientName: string;
  address?: string | null;
  email?: string | null;
  lineItems: string;
  subtotal: number;
  tax: number;
  total: number;
  notes?: string | null;
  status: string;
  issuedAt: string;
  dueDate: string | null;
  amountPaid: number;
  reminderCount: number;
  remindedAt?: string | null;
  kind: string;
  payments: ApiPayment[];
  project: { id: string; title: string; jobType?: string | null } | null;
}

/** What this screen holds. */
type Invoice = InCents<ApiInvoice>;

const METHODS = ["E_TRANSFER", "CASH", "CHEQUE", "CARD"];

export default function InvoiceDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("E_TRANSFER");
  const [reminding, setReminding] = useState(false);

  async function sendReminder() {
    setReminding(true);
    const res = await fetch(`/api/invoices/${params.id}/remind`, { method: "POST" });
    const data = await res.json();
    setReminding(false);
    // Report what actually happened — a reminder the desk thinks it sent but did not
    // is worse than none at all.
    if (data.sent) toast(`Reminder sent — ${data.stage}`);
    else toast(`Not sent: ${data.reason || data.error}`, "bad");
    load();
  }

  const load = useCallback(async () => {
    const res = await fetch(`/api/invoices/${params.id}`);
    if (res.ok) {
      // The one door on this screen: dollars off the wire, cents from here on. The pay
      // field is the other direction — it is typed and posted in dollars.
      const data = inCents((await res.json()) as ApiInvoice);
      setInvoice(data);
      setPayAmount(toDollars(data.totalCents - data.amountPaidCents).toFixed(2));
    }
    setLoading(false);
  }, [params.id]);

  useEffect(() => {
    load();
  }, [load]);

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    await fetch(`/api/invoices/${params.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    await load();
    setBusy(false);
    if (body.action === "pay")
      toast(`Payment of ${formatCents(toCents(Number(body.amount)))} recorded`);
    else if (body.status) toast(`Invoice marked ${String(body.status).toLowerCase()}`);
  }

  if (loading) return <Skeleton lines={6} />;
  if (!invoice) return <Empty>Invoice not found</Empty>;

  const items: LineItem[] = parseLineItems(invoice.lineItems);
  const owingCents = invoice.totalCents - invoice.amountPaidCents;
  const overdue = isOverdue(invoice);
  const stage = chaseStage(invoice);

  return (
    <div className="space-y-6 pb-24 md:pb-0">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <Link href="/invoices" className="eyebrow inline-flex items-center gap-1.5 hover:text-ink">
          <ArrowLeft className="h-3.5 w-3.5" /> All invoices
        </Link>
        <div className="flex flex-wrap gap-2">
          {invoice.status === "DRAFT" && (
            <button
              disabled={busy}
              onClick={() => patch({ status: "SENT" })}
              className={buttonClass("primary")}
            >
              Mark sent
            </button>
          )}
          <a
            href={`/api/invoices/${params.id}/pdf`}
            target="_blank"
            rel="noopener"
            className={buttonClass("ghost")}
          >
            <Printer className="h-4 w-4" /> Printable sheet
          </a>
          {invoice.status !== "VOID" && invoice.status !== "PAID" && (
            <button
              disabled={busy}
              onClick={async () => {
                await fetch(`/api/invoices/${params.id}`, { method: "DELETE" });
                toast("Invoice voided");
                router.push("/invoices");
              }}
              className={buttonClass("danger")}
            >
              Void
            </button>
          )}
        </div>
      </div>

      {/* THE DOCUMENT. Ends in a perforated tear-off stub — see DESIGN.md. */}
      <div
        className="plate"
        style={{ borderLeft: `4px solid ${spineFor(overdue ? "OVERDUE" : invoice.status)}` }}
      >
        <div className="flex flex-wrap items-start justify-between gap-6 border-b border-line px-6 py-6">
          <div>
            <div className="eyebrow">
              {invoice.kind === "DEPOSIT"
                ? "Deposit invoice"
                : invoice.kind === "BALANCE"
                  ? "Balance invoice"
                  : "Invoice"}
            </div>
            <h1 className="mono mt-2 text-[26px] font-bold leading-none tracking-tight text-ink">
              {invoice.number}
            </h1>
            <p className="mt-3 text-[15px] font-bold text-ink">{invoice.clientName}</p>
            {invoice.address && <p className="text-[13px] text-ink-2">{invoice.address}</p>}
            {invoice.email && <p className="mono text-[12px] text-ink-3">{invoice.email}</p>}
          </div>
          <div className="text-right">
            <span
              className="eyebrow"
              style={{ color: overdue ? "var(--rose-ink)" : textToneFor(invoice.status) }}
            >
              {overdue ? `OVERDUE · ${daysOverdue(invoice)}D` : invoice.status}
            </span>
            <dl className="mt-3 space-y-1 text-[12px]">
              <div className="flex justify-end gap-3">
                <dt className="text-ink-3">Issued</dt>
                <dd className="mono text-ink-2">
                  {new Date(invoice.issuedAt).toLocaleDateString("en-CA")}
                </dd>
              </div>
              {invoice.dueDate && (
                <div className="flex justify-end gap-3">
                  <dt className="text-ink-3">Due</dt>
                  <dd className="mono" style={{ color: overdue ? "var(--rose-ink)" : "var(--ink-2)" }}>
                    {new Date(invoice.dueDate).toLocaleDateString("en-CA")}
                  </dd>
                </div>
              )}
              {invoice.project && (
                <div className="flex justify-end gap-3">
                  <dt className="text-ink-3">Job</dt>
                  <dd className="text-ink-2">
                    <Link href={`/projects/${invoice.project.id}`} className="hover:text-ink">
                      {invoice.project.title}
                    </Link>
                  </dd>
                </div>
              )}
            </dl>
          </div>
        </div>

        {/* Ruled rows — no zebra stripes, no card per line. Five money columns do not
            fit a phone, so the table scrolls inside its own box rather than pushing the
            page sideways; `scope` on the headers is what lets a reader say which column
            an amount belongs to. */}
        <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-line">
              <th scope="col" className="eyebrow px-6 py-2.5 text-left">Description</th>
              <th scope="col" className="eyebrow px-3 py-2.5 text-right">Qty</th>
              <th scope="col" className="eyebrow px-3 py-2.5 text-left">Unit</th>
              <th scope="col" className="eyebrow px-3 py-2.5 text-right">Rate</th>
              <th scope="col" className="eyebrow px-6 py-2.5 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => (
              <tr key={i} className="border-b border-line">
                <td className="px-6 py-3 text-[14px] text-ink">{item.description}</td>
                <td className="mono px-3 py-3 text-right text-[13px] text-ink-2">{item.qty}</td>
                <td className="px-3 py-3 text-[13px] text-ink-3">{item.unit}</td>
                <td className="mono px-3 py-3 text-right text-[13px] text-ink-2">
                  {formatCents(item.unitPriceCents)}
                </td>
                <td className="mono px-6 py-3 text-right text-[14px] font-medium text-ink">
                  {formatCents(lineTotalCents(item))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

        <div className="flex justify-end px-6 py-5">
          <dl className="w-full max-w-[260px] space-y-2 text-[13px]">
            <div className="flex justify-between">
              <dt className="text-ink-2">Subtotal</dt>
              <dd className="mono text-ink">{formatCents(invoice.subtotalCents)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-2">HST / GST</dt>
              <dd className="mono text-ink">{formatCents(invoice.taxCents)}</dd>
            </div>
            <div className="flex justify-between border-t border-line pt-2">
              <dt className="text-[13px] font-bold uppercase tracking-[0.06em] text-ink">Total</dt>
              <dd className="mono text-[19px] font-bold text-ink">
                {formatCents(invoice.totalCents)}
              </dd>
            </div>
            {invoice.amountPaidCents > 0 && (
              <>
                <div className="flex justify-between">
                  <dt className="text-ink-2">Paid</dt>
                  <dd className="mono" style={{ color: "var(--emerald-ink)" }}>
                    −{formatCents(invoice.amountPaidCents)}
                  </dd>
                </div>
                <div className="flex justify-between border-t border-line pt-2">
                  <dt className="text-[13px] font-bold uppercase tracking-[0.06em] text-ink">
                    Owing
                  </dt>
                  <dd
                    className="mono text-[19px] font-bold"
                    style={{ color: owingCents > 0 ? "var(--rose-ink)" : "var(--emerald)" }}
                  >
                    {formatCents(Math.max(owingCents, 0))}
                  </dd>
                </div>
              </>
            )}
          </dl>
        </div>

        {invoice.notes && (
          <div className="border-t border-line px-6 py-4">
            <div className="eyebrow">Notes</div>
            <p className="mt-2 text-[13px] text-ink-2">{invoice.notes}</p>
          </div>
        )}

        {/* The stub: the part the client tears off and returns with payment. */}
        <div className="perf mx-6" />
        <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div>
            <div className="eyebrow">Remittance stub</div>
            <p className="mono mt-1.5 text-[12px] text-ink-2">
              {invoice.number} · {invoice.clientName}
            </p>
          </div>
          <div className="text-right">
            <div className="eyebrow">Amount due</div>
            <p
              className="mono mt-1 text-[20px] font-bold"
              style={{ color: owingCents > 0 ? "var(--ink)" : "var(--emerald)" }}
            >
              {formatCents(Math.max(owingCents, 0))}
            </p>
          </div>
        </div>
      </div>

      {stage && (
        <div
          className="no-print flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4"
          style={{ borderTopColor: "var(--rose)" }}
        >
          <div>
            <span className="eyebrow" style={{ color: "var(--rose-ink)" }}>
              {stage.label}
            </span>
            <p className="mt-1 text-[13px] text-ink-2">{stage.hint}</p>
            {invoice.reminderCount > 0 && (
              <p className="mono mt-1 text-[12px] text-ink-3">
                {invoice.reminderCount} reminder{invoice.reminderCount === 1 ? "" : "s"} sent
                {invoice.remindedAt
                  ? ` · last ${new Date(invoice.remindedAt).toLocaleDateString("en-CA")}`
                  : ""}
              </p>
            )}
          </div>
          <button disabled={reminding} onClick={sendReminder} className={buttonClass("ghost")}>
            {reminding ? "Sending…" : "Send reminder"}
          </button>
        </div>
      )}

      {/* Payment desk */}
      {invoice.status !== "VOID" && (
        <div className="no-print plate p-5">
          <div className="eyebrow">Record a payment</div>
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <div>
              <label className="eyebrow">Amount</label>
              <input
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                className="mono mt-1.5 w-[140px] px-3 py-2 text-[14px]"
              />
            </div>
            <div>
              <label className="eyebrow">Method</label>
              <select
                value={payMethod}
                onChange={(e) => setPayMethod(e.target.value)}
                className="mono mt-1.5 px-3 py-2 text-[12px] uppercase tracking-[0.06em]"
              >
                {METHODS.map((m) => (
                  <option key={m} value={m}>
                    {m.replace("_", "-")}
                  </option>
                ))}
              </select>
            </div>
            <button
              disabled={busy || owingCents <= 0}
              onClick={() => patch({ action: "pay", amount: Number(payAmount), method: payMethod })}
              className={buttonClass("primary")}
            >
              Log payment
            </button>
          </div>

          {invoice.payments.length > 0 && (
            <div className="mt-5 border-t border-line pt-4">
              {invoice.payments.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between border-b border-line py-2 last:border-b-0"
                >
                  <span className="mono text-[12px] text-ink-3">
                    {new Date(p.date).toLocaleDateString("en-CA")} · {p.method.replace("_", "-")}
                  </span>
                  <span className="mono text-[13px] font-medium" style={{ color: "var(--emerald-ink)" }}>
                    {formatCents(p.amountCents)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
