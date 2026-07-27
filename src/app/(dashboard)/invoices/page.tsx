"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { isOverdue, daysOverdue } from "@/lib/invoice-state";
import {
  PageHead,
  Ticket,
  Empty,
  Money,
  Skeleton,
  textToneFor,
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
  const outstanding = live
    .filter((i) => i.status === "SENT" || i.status === "PARTIAL")
    .reduce((s, i) => s + (i.total - i.amountPaid), 0);
  const collected = live.reduce((s, i) => s + i.amountPaid, 0);


  return (
    <div className="space-y-6 pb-24 md:pb-0">
      <PageHead
        eyebrow="Billing"
        title="Invoices"
        sub="Issued from an accepted estimate — same lines, same totals, new number."
      />

      {/* Two readouts only: what is owed, what landed. */}
      <div className="grid grid-cols-2 border border-line bg-plate sm:divide-x sm:divide-line">
        <div className="border-r border-line px-4 py-4">
          <div className="eyebrow">Outstanding</div>
          <Money
            value={outstanding}
            className="mt-3 block text-[28px] leading-none"
            tone={outstanding > 0 ? "var(--rose)" : "var(--emerald)"}
          />
        </div>
        <div className="px-4 py-4">
          <div className="eyebrow">Collected</div>
          <Money
            value={collected}
            className="mt-3 block text-[28px] leading-none"
            tone="var(--emerald)"
          />
        </div>
      </div>

      <div className="flex flex-col gap-2 border border-line bg-sunk p-2 sm:flex-row">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3"
            strokeWidth={2}
          />
          <input
            placeholder="Invoice number or client…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full py-2 pl-9 pr-3 text-[13px]"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="mono px-3 py-2 text-[12px] uppercase tracking-[0.06em]"
        >
          <option value="">All statuses</option>
          <option value={OVERDUE}>Overdue</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2.5">
        {loading ? (
          <Skeleton lines={3} />
        ) : shown.length === 0 ? (
          <Empty>
            {statusFilter === OVERDUE
              ? "Nothing overdue — the street is clean"
              : "No invoices issued yet — start from a job estimate"}
          </Empty>
        ) : (
          shown.map((inv) => {
            const owing = inv.total - inv.amountPaid;
            const overdue = isOverdue(inv);
            return (
              <Ticket
                key={inv.id}
                href={`/invoices/${inv.id}`}
                status={overdue ? "OVERDUE" : inv.status}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="mono text-[11px] font-bold tracking-[0.08em] text-ink-2">
                    {inv.number}
                  </span>
                  <span
                    className="eyebrow"
                    style={{
                      color: overdue ? "var(--rose-ink)" : textToneFor(inv.status),
                    }}
                  >
                    {overdue ? `OVERDUE · ${daysOverdue(inv)}D` : inv.status}
                  </span>
                </div>
                <div className="mt-1.5 flex items-end justify-between gap-4">
                  <div className="min-w-0">
                    <p className="truncate text-[15px] font-bold leading-tight text-ink">
                      {inv.clientName}
                    </p>
                    <p className="truncate text-[13px] text-ink-2">
                      {inv.project?.title || "—"}
                      {inv.dueDate
                        ? ` · due ${new Date(inv.dueDate).toLocaleDateString("en-CA")}`
                        : ""}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <Money value={inv.total} className="block text-[17px]" />
                    {owing > 0.005 && inv.amountPaid > 0 && (
                      <span className="mono text-[11px] text-ink-3">
                        owing {formatCurrency(owing)}
                      </span>
                    )}
                  </div>
                </div>
              </Ticket>
            );
          })
        )}
      </div>
    </div>
  );
}
