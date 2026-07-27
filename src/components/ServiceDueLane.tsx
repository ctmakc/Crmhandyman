"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatCurrency, formatDate } from "@/lib/utils";
import { buttonClass } from "@/components/ui/primitives";
import { toast } from "@/components/ui/Toaster";

interface DueContract {
  id: string;
  name: string;
  clientName: string;
  address: string | null;
  pricePerVisit: number;
  dueOn: string;
  daysUntil: number;
}

/**
 * Maintenance coming due. This is the money a shop already sold and can lose simply
 * by forgetting to call — so it sits on the deck, one press from being on the board.
 */
export default function ServiceDueLane({ contracts }: { contracts: DueContract[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function bookAll() {
    setBusy(true);
    const res = await fetch("/api/contracts/book", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ withinDays: 45 }),
    });
    const data = await res.json();
    setBusy(false);
    toast(
      data.count
        ? `${data.count} visit${data.count === 1 ? "" : "s"} booked`
        : "Nothing due to book"
    );
    router.refresh();
  }

  const value = contracts.reduce((s, c) => s + c.pricePerVisit, 0);

  return (
    <section>
      <div className="mb-3 flex items-center justify-between border-b border-line pb-2">
        <h2 className="flex items-center gap-2 text-[13px] font-bold uppercase tracking-[0.06em] text-ink">
          <span
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ background: "var(--amber)" }}
          />
          Service coming due
          <span className="mono text-[12px] font-normal text-ink-3">
            {formatCurrency(value)}
          </span>
        </h2>
        <div className="flex items-center gap-4">
          <button disabled={busy} onClick={bookAll} className={buttonClass("ghost")}>
            {busy ? "Booking…" : "Book all"}
          </button>
          <Link href="/contracts" className="eyebrow hover:text-ink">
            Contracts →
          </Link>
        </div>
      </div>

      <div className="space-y-3">
        {contracts.map((c) => {
          const late = c.daysUntil < 0;
          return (
            <div
              key={c.id}
              className="ticket ticket-hover px-4 py-3"
              style={
                {
                  ["--spine"]: late ? "var(--rose)" : "var(--amber)",
                } as React.CSSProperties
              }
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="mono text-[11px] tracking-[0.08em] text-ink-3">
                  {formatDate(c.dueOn)}
                </span>
                <span
                  className="mono text-[11px] tracking-[0.08em]"
                  style={{ color: late ? "var(--rose-ink)" : "var(--amber-ink)" }}
                >
                  {late ? `${Math.abs(c.daysUntil)}D LATE` : `IN ${c.daysUntil}D`}
                </span>
              </div>
              <div className="mt-1.5 flex items-end justify-between gap-4">
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-bold leading-tight text-ink">
                    {c.clientName}
                  </p>
                  <p className="truncate text-[13px] text-ink-2">
                    {c.name}
                    {c.address ? ` · ${c.address}` : ""}
                  </p>
                </div>
                <span className="mono shrink-0 text-[15px] text-ink">
                  {formatCurrency(c.pricePerVisit)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
