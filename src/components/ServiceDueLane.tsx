"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatCurrency, formatDate } from "@/lib/utils";
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
      {/* The rail is 300px wide — the header stacks instead of fighting for a row. */}
      <div className="pb-2.5">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.1em] text-ink">
            <span
              className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ background: "var(--amber)" }}
            />
            Service due
          </h2>
          <span className="mono text-[12px] text-ink-3">{formatCurrency(value)}</span>
        </div>
        <div className="mt-1.5 flex items-baseline gap-4">
          <button
            disabled={busy}
            onClick={bookAll}
            className="eyebrow underline underline-offset-4 hover:text-ink disabled:opacity-50"
          >
            {busy ? "Booking…" : "Book all"}
          </button>
          <Link href="/contracts" className="eyebrow hover:text-ink">
            Contracts →
          </Link>
        </div>
      </div>

      <div className="lane">
        {contracts.map((c) => {
          const late = c.daysUntil < 0;
          return (
            <div
              key={c.id}
              className="row row-hover"
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
              <div className="mt-1 flex items-baseline justify-between gap-3">
                <p className="truncate text-[14px] font-bold leading-tight text-ink">
                  {c.clientName}
                </p>
                <span className="mono shrink-0 text-[15px] text-ink">
                  {formatCurrency(c.pricePerVisit)}
                </span>
              </div>
              <p className="mt-0.5 truncate text-[12px] text-ink-2">{c.name}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
