"use client";

import Link from "next/link";
import { formatCurrency } from "@/lib/utils";
import { daysOverdue, chaseStage } from "@/lib/invoice-state";

interface ChaseInvoice {
  id: string;
  number: string;
  clientName: string;
  total: number;
  amountPaid: number;
  dueDate: string | null;
  status: string;
}

/**
 * The chase lane — the money already earned and not yet in the bank, ordered by how
 * late it is. This is the one thing an owner opens the CRM for.
 */
export default function ChaseLane({ invoices }: { invoices: ChaseInvoice[] }) {
  if (!invoices.length) return null;

  return (
    <section>
      <div className="mb-3 flex items-center justify-between border-b border-line pb-2">
        <h2 className="flex items-center gap-2 text-[13px] font-bold uppercase tracking-[0.06em] text-ink">
          <span
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ background: "var(--rose)" }}
          />
          Chase list
        </h2>
        <Link href="/invoices?status=overdue" className="eyebrow hover:text-ink">
          All invoices →
        </Link>
      </div>

      <div className="space-y-3">
        {invoices.map((inv) => {
          const stage = chaseStage({ ...inv, dueDate: inv.dueDate });
          const days = daysOverdue({ ...inv, dueDate: inv.dueDate });
          const owing = inv.total - inv.amountPaid;
          return (
            <Link
              key={inv.id}
              href={`/invoices/${inv.id}`}
              className="ticket block px-4 py-3"
              style={{ ["--spine" as string]: "var(--rose)" } as React.CSSProperties}
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="mono text-[11px] font-bold tracking-[0.08em] text-ink-2">
                  {inv.number}
                </span>
                <span className="mono text-[11px] tracking-[0.08em]" style={{ color: "var(--rose-ink)" }}>
                  {days} {days === 1 ? "DAY" : "DAYS"} LATE
                </span>
              </div>
              <div className="mt-1.5 flex items-end justify-between gap-4">
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-bold leading-tight text-ink">
                    {inv.clientName}
                  </p>
                  <p className="text-[13px] text-ink-2">{stage?.hint}</p>
                </div>
                <div className="shrink-0 text-right">
                  <span className="mono text-[17px] font-medium" style={{ color: "var(--rose-ink)" }}>
                    {formatCurrency(owing)}
                  </span>
                  <span className="eyebrow mt-0.5 block">{stage?.label}</span>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
