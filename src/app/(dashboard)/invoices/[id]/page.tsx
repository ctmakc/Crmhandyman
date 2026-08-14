"use client";

/**
 * THE INVOICE RECORD — the piece of paper, and what to do about it.
 *
 * Read top to bottom it answers the four questions the owner asks at six in the
 * morning: what do they owe, when was it due, what have they already paid, and what
 * do I do next. The document keeps its closed frame (it is literally paper); the
 * chase note and the payment desk are ruled sections under it, because they are not.
 */

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Printer } from "lucide-react";
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
import {
  BackLink,
  Button,
  buttonClass,
  Empty,
  Field,
  LaneHead,
  Money,
  Readout,
  Skeleton,
  Stamp,
  Th,
  TableWrap,
  spineFor,
  textToneFor,
} from "@/components/ui/primitives";
import { toast } from "@/components/ui/Toaster";
import { isOverdue, daysOverdue, chaseStage, lateWord } from "@/lib/invoice-state";

/**
 * The chase ladder's rungs are named for the code that walks them. `Reminder sent —
 * nudge` told the owner nothing about what left his desk; this says which letter went.
 */
const STAGE_WORD: Record<string, string> = {
  notice: "a copy of the invoice",
  nudge: "a reminder",
  call: "a request for a date",
  final: "a final notice",
};

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
    if (data.sent) toast(`Sent ${STAGE_WORD[data.stage] ?? "a reminder"} to ${invoice?.clientName ?? "the client"}`);
    else
      toast(
        data.reason === "no email on file"
          ? `No email on file for ${invoice?.clientName ?? "this client"} — call the number on the invoice`
          : "The reminder did not go out — email is not set up on this desk yet",
        "bad"
      );
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
  if (!invoice)
    return (
      <Empty
        hint="It may have been voided, or the link may be pointing at another workspace."
        action={
          <Button variant="ghost" onClick={() => router.push("/invoices")}>
            All invoices
          </Button>
        }
      >
        That invoice is not on the books
      </Empty>
    );

  const items: LineItem[] = parseLineItems(invoice.lineItems);
  const owingCents = invoice.totalCents - invoice.amountPaidCents;
  const overdue = isOverdue(invoice);
  const stage = chaseStage(invoice);
  const settled = owingCents <= 0;

  /** What the owner is actually looking for: the number, and how late it is. */
  const owingTone = settled
    ? "var(--emerald-ink)"
    : overdue
      ? "var(--rose-ink)"
      : "var(--ink)";

  return (
    <div className="page-doc space-y-6 pb-24 md:pb-0">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <BackLink href="/invoices" label="All invoices" />
        <div className="actions">
          {invoice.status === "DRAFT" && (
            <Button disabled={busy} onClick={() => patch({ status: "SENT" })}>
              Mark sent
            </Button>
          )}
          <a
            href={`/api/invoices/${params.id}/pdf`}
            target="_blank"
            rel="noopener"
            className={buttonClass("ghost")}
          >
            <Printer className="h-4 w-4" aria-hidden /> Print sheet
          </a>
          {invoice.status !== "VOID" && invoice.status !== "PAID" && (
            <Button
              variant="danger"
              disabled={busy}
              onClick={async () => {
                await fetch(`/api/invoices/${params.id}`, { method: "DELETE" });
                toast("Invoice voided");
                router.push("/invoices");
              }}
            >
              Void
            </Button>
          )}
        </div>
      </div>

      {/* THE DOCUMENT. Ends in a perforated tear-off stub — see DESIGN.md. */}
      <div
        className="plate"
        style={{ borderLeft: `4px solid ${spineFor(overdue ? "OVERDUE" : invoice.status)}` }}
      >
        <div className="flex flex-wrap items-start justify-between gap-6 border-b border-line px-6 py-6">
          <div className="min-w-0">
            <div className="eyebrow">
              {invoice.kind === "DEPOSIT"
                ? "Deposit invoice"
                : invoice.kind === "BALANCE"
                  ? "Balance invoice"
                  : "Invoice"}
            </div>
            <h1 className="mono t-record mt-2 font-bold tracking-tight text-ink">
              {invoice.number}
            </h1>
            <p className="t-row mt-3 font-bold text-ink">{invoice.clientName}</p>
            {invoice.address && <p className="t-body text-ink-2">{invoice.address}</p>}
            {invoice.email && <p className="mono t-meta text-ink-3">{invoice.email}</p>}
          </div>
          {/* The one number this screen exists for, at gauge size, with the state
              of the clock under it. It used to be a 19px line inside the totals
              block, below four other amounts of the same weight. */}
          <div className="text-right">
            {/* A draft is not owed yet — nobody has been asked for it. */}
            <div className="eyebrow">
              {settled ? "Settled" : invoice.status === "DRAFT" ? "To bill" : "Owing"}
            </div>
            <div className="mt-1.5">
              <Readout value={formatCents(Math.max(owingCents, 0))} tone={owingTone} />
            </div>
            <p
              className="eyebrow mt-2"
              style={{ color: overdue ? "var(--rose-ink)" : textToneFor(invoice.status) }}
            >
              {overdue
                ? lateWord(daysOverdue(invoice))
                : invoice.status === "PAID"
                  ? "PAID IN FULL"
                  : invoice.status}
            </p>
            <dl className="t-meta mt-3 space-y-1">
              <div className="flex justify-end gap-3">
                <dt className="text-ink-3">Issued</dt>
                <dd className="text-ink-2">
                  <Stamp date={invoice.issuedAt} />
                </dd>
              </div>
              {invoice.dueDate && (
                <div className="flex justify-end gap-3">
                  <dt className="text-ink-3">Due</dt>
                  <dd>
                    <Stamp
                      date={invoice.dueDate}
                      tone={overdue ? "var(--rose-ink)" : "var(--ink-2)"}
                    />
                  </dd>
                </div>
              )}
              {invoice.project && (
                <div className="flex justify-end gap-3">
                  <dt className="text-ink-3">Job</dt>
                  <dd className="text-ink-2">
                    <Link
                      href={`/projects/${invoice.project.id}`}
                      className="inline-block py-1 hover:text-ink"
                    >
                      {invoice.project.title}
                    </Link>
                  </dd>
                </div>
              )}
            </dl>
          </div>
        </div>

        {/* The lines. Five money columns do not fit a phone: below `sm` each line
            stacks as description + `qty unit × rate` + amount, the same shape the
            printed sheet takes. Above it, the table with real column headers. */}
        <TableWrap className="hidden sm:block">
          <table className="w-full">
            <thead>
              <tr>
                <Th className="px-6">Description</Th>
                <Th align="right">Qty</Th>
                <Th>Unit</Th>
                <Th align="right">Rate</Th>
                <Th align="right" className="px-6">
                  Amount
                </Th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => (
                <tr key={i} className="border-b border-line last:border-b-0">
                  <td className="t-lede px-6 py-3 text-ink">{item.description}</td>
                  <td className="mono t-body px-3 py-3 text-right text-ink-2">{item.qty}</td>
                  <td className="mono t-body px-3 py-3 text-ink-3">{item.unit}</td>
                  <td className="mono t-body px-3 py-3 text-right text-ink-2">
                    {formatCents(item.unitPriceCents)}
                  </td>
                  <td className="px-6 py-3 text-right">
                    <Money cents={lineTotalCents(item)} className="t-lede" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
        <div className="sm:hidden">
          {items.map((item, i) => (
            <div key={i} className="border-b border-line px-5 py-3 last:border-b-0">
              <p className="t-body font-medium text-ink">{item.description}</p>
              <div className="mt-1 flex items-baseline justify-between gap-3">
                <span className="mono t-meta text-ink-3">
                  {item.qty} {item.unit} × {formatCents(item.unitPriceCents)}
                </span>
                <Money cents={lineTotalCents(item)} className="t-lede font-bold" />
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-end border-t border-line px-6 py-5">
          <dl className="t-body w-full max-w-[280px] space-y-2">
            <div className="flex justify-between gap-6">
              <dt className="text-ink-2">Subtotal</dt>
              <dd>
                <Money cents={invoice.subtotalCents} />
              </dd>
            </div>
            <div className="flex justify-between gap-6">
              <dt className="text-ink-2">HST / GST</dt>
              <dd>
                <Money cents={invoice.taxCents} />
              </dd>
            </div>
            <div className="flex justify-between gap-6 border-t border-line pt-2">
              <dt className="eyebrow text-ink">Total</dt>
              <dd>
                <Money cents={invoice.totalCents} className="t-row font-bold" />
              </dd>
            </div>
            {invoice.amountPaidCents > 0 && (
              <>
                <div className="flex justify-between gap-6">
                  <dt className="text-ink-2">Paid</dt>
                  <dd>
                    {/* The same minus glyph the printed sheet uses. */}
                    <span className="mono" style={{ color: "var(--emerald-ink)" }}>
                      −<Money cents={invoice.amountPaidCents} tone="var(--emerald-ink)" />
                    </span>
                  </dd>
                </div>
                <div className="rule-double flex justify-between gap-6 pt-2">
                  <dt className="eyebrow text-ink">Owing</dt>
                  <dd>
                    <Money
                      cents={Math.max(owingCents, 0)}
                      className="t-row font-bold"
                      tone={owingTone}
                    />
                  </dd>
                </div>
              </>
            )}
          </dl>
        </div>

        {invoice.notes && (
          <div className="border-t border-line px-6 py-4">
            <div className="eyebrow">Notes</div>
            <p className="measure t-body mt-2 text-ink-2">{invoice.notes}</p>
          </div>
        )}

        {/* The stub: the part the client tears off and returns with payment. */}
        <div className="perf mx-6" />
        <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div>
            <div className="eyebrow">Remittance stub</div>
            <p className="mono t-meta mt-1.5 text-ink-2">
              {invoice.number} · {invoice.clientName}
            </p>
          </div>
          <div className="text-right">
            <div className="eyebrow">Amount due</div>
            <p className="mt-1">
              <Money
                cents={Math.max(owingCents, 0)}
                className="t-row font-bold"
                tone={settled ? "var(--emerald-ink)" : "var(--ink)"}
              />
            </p>
          </div>
        </div>
      </div>

      {stage && (
        <div
          className="no-print flex flex-wrap items-center justify-between gap-3 border-t pt-4"
          style={{ borderTopColor: "var(--rose)" }}
        >
          <div>
            <span className="eyebrow" style={{ color: "var(--rose-ink)" }}>
              {stage.label}
            </span>
            <p className="measure t-body mt-1 text-ink-2">{stage.hint}</p>
            {invoice.reminderCount > 0 && (
              <p className="t-meta mt-1 text-ink-3">
                <span className="mono">{invoice.reminderCount}</span> reminder
                {invoice.reminderCount === 1 ? "" : "s"} sent
                {invoice.remindedAt ? (
                  <>
                    {" · last "}
                    <Stamp date={invoice.remindedAt} />
                  </>
                ) : (
                  ""
                )}
              </p>
            )}
          </div>
          <div className="actions">
            <Button variant="ghost" disabled={reminding} onClick={sendReminder}>
              {reminding ? "Sending…" : "Send reminder"}
            </Button>
          </div>
        </div>
      )}

      {/* THE PAYMENT DESK. A section opens with a rule, not a box — the plate is
          reserved for the paper above. A settled invoice shows what came in and
          drops the form: the button was there but dead, and a dead control on a
          finished job is furniture. */}
      {invoice.status !== "VOID" && (
        <section className="no-print">
          <LaneHead
            title={settled ? "Paid in full" : "Record a payment"}
            right={
              invoice.payments.length > 0 ? (
                <span className="eyebrow">
                  <Money cents={invoice.amountPaidCents} tone="var(--emerald-ink)" /> collected
                </span>
              ) : undefined
            }
          />

          {!settled && (
            <div className="flex flex-wrap items-end gap-4 border-t border-line pt-4">
              <Field id="pay-amount" label="Amount" className="w-[150px]">
                {(f) => (
                  <input
                    {...f}
                    inputMode="decimal"
                    value={payAmount}
                    onChange={(e) => setPayAmount(e.target.value)}
                    className={`${f.className} mono text-right`}
                  />
                )}
              </Field>
              <Field id="pay-method" label="Method" className="w-[170px]">
                {(f) => (
                  <select
                    {...f}
                    value={payMethod}
                    onChange={(e) => setPayMethod(e.target.value)}
                    className={`${f.className} mono uppercase tracking-[0.06em]`}
                  >
                    {METHODS.map((m) => (
                      <option key={m} value={m}>
                        {m.replace("_", "-")}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
              <div className="actions">
                <Button
                  disabled={busy || owingCents <= 0}
                  onClick={() =>
                    patch({ action: "pay", amount: Number(payAmount), method: payMethod })
                  }
                >
                  Log payment
                </Button>
              </div>
            </div>
          )}

          {invoice.payments.length > 0 && (
            <div className="lane mt-4">
              {invoice.payments.map((p) => (
                <div
                  key={p.id}
                  className="flex items-baseline justify-between gap-4 border-b border-line py-2.5 last:border-b-0"
                >
                  <span className="t-body text-ink-2">
                    <Stamp date={p.date} className="text-ink" /> ·{" "}
                    <span className="mono t-meta text-ink-3">{p.method.replace("_", "-")}</span>
                  </span>
                  <Money cents={p.amountCents} className="t-body" tone="var(--emerald-ink)" />
                </div>
              ))}
            </div>
          )}

          {settled && invoice.payments.length === 0 && (
            <p className="t-body border-t border-line pt-4 text-ink-2">
              Nothing is owing on this invoice.
            </p>
          )}
        </section>
      )}
    </div>
  );
}
