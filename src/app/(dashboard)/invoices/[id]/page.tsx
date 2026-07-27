"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Printer } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { buttonClass, Empty, spineFor, textToneFor, Skeleton } from "@/components/ui/primitives";
import { toast } from "@/components/ui/Toaster";
import { isOverdue, daysOverdue, chaseStage } from "@/lib/invoice-state";

interface LineItem {
  description: string;
  qty: number;
  unit: string;
  unitPrice: number;
}

interface Payment {
  id: string;
  amount: number;
  method: string;
  date: string;
  notes?: string | null;
}

interface Invoice {
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
  payments: Payment[];
  project: { id: string; title: string; jobType?: string | null } | null;
}

const METHODS = ["E_TRANSFER", "CASH", "CHEQUE", "CARD"];

export default function InvoiceDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("E_TRANSFER");

  const load = useCallback(async () => {
    const res = await fetch(`/api/invoices/${params.id}`);
    if (res.ok) {
      const data = await res.json();
      setInvoice(data);
      setPayAmount((data.total - data.amountPaid).toFixed(2));
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
    if (body.action === "pay") toast(`Payment of ${formatCurrency(Number(body.amount))} recorded`);
    else if (body.status) toast(`Invoice marked ${String(body.status).toLowerCase()}`);
  }

  if (loading) return <Skeleton lines={6} />;
  if (!invoice) return <Empty>Invoice not found</Empty>;

  const items: LineItem[] = JSON.parse(invoice.lineItems);
  const owing = invoice.total - invoice.amountPaid;
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
            <div className="eyebrow">Invoice</div>
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

        {/* Ruled rows — no zebra stripes, no card per line. */}
        <table className="w-full">
          <thead>
            <tr className="border-b border-line">
              <th className="eyebrow px-6 py-2.5 text-left">Description</th>
              <th className="eyebrow px-3 py-2.5 text-right">Qty</th>
              <th className="eyebrow px-3 py-2.5 text-left">Unit</th>
              <th className="eyebrow px-3 py-2.5 text-right">Rate</th>
              <th className="eyebrow px-6 py-2.5 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => (
              <tr key={i} className="border-b border-line">
                <td className="px-6 py-3 text-[14px] text-ink">{item.description}</td>
                <td className="mono px-3 py-3 text-right text-[13px] text-ink-2">{item.qty}</td>
                <td className="px-3 py-3 text-[13px] text-ink-3">{item.unit}</td>
                <td className="mono px-3 py-3 text-right text-[13px] text-ink-2">
                  {formatCurrency(item.unitPrice)}
                </td>
                <td className="mono px-6 py-3 text-right text-[14px] font-medium text-ink">
                  {formatCurrency(item.qty * item.unitPrice)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex justify-end px-6 py-5">
          <dl className="w-full max-w-[260px] space-y-2 text-[13px]">
            <div className="flex justify-between">
              <dt className="text-ink-2">Subtotal</dt>
              <dd className="mono text-ink">{formatCurrency(invoice.subtotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-2">HST / GST</dt>
              <dd className="mono text-ink">{formatCurrency(invoice.tax)}</dd>
            </div>
            <div className="flex justify-between border-t border-line pt-2">
              <dt className="text-[13px] font-bold uppercase tracking-[0.06em] text-ink">Total</dt>
              <dd className="mono text-[19px] font-bold text-ink">
                {formatCurrency(invoice.total)}
              </dd>
            </div>
            {invoice.amountPaid > 0 && (
              <>
                <div className="flex justify-between">
                  <dt className="text-ink-2">Paid</dt>
                  <dd className="mono" style={{ color: "var(--emerald)" }}>
                    −{formatCurrency(invoice.amountPaid)}
                  </dd>
                </div>
                <div className="flex justify-between border-t border-line pt-2">
                  <dt className="text-[13px] font-bold uppercase tracking-[0.06em] text-ink">
                    Owing
                  </dt>
                  <dd
                    className="mono text-[19px] font-bold"
                    style={{ color: owing > 0.005 ? "var(--rose-ink)" : "var(--emerald)" }}
                  >
                    {formatCurrency(Math.max(owing, 0))}
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
              style={{ color: owing > 0.005 ? "var(--ink)" : "var(--emerald)" }}
            >
              {formatCurrency(Math.max(owing, 0))}
            </p>
          </div>
        </div>
      </div>

      {stage && (
        <div
          className="no-print flex flex-wrap items-center justify-between gap-3 border border-line bg-sunk px-5 py-3"
          style={{ borderLeft: "3px solid var(--rose)" }}
        >
          <span className="text-[13px] text-ink-2">{stage.hint}</span>
          <span className="eyebrow" style={{ color: "var(--rose-ink)" }}>
            {stage.label}
          </span>
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
              disabled={busy || owing <= 0.005}
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
                  <span className="mono text-[13px] font-medium" style={{ color: "var(--emerald)" }}>
                    {formatCurrency(p.amount)}
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
