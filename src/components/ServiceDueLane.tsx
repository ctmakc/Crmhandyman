"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LaneHead, Money, Num, Stamp } from "@/components/ui/primitives";
import { dueTail, lateTail } from "@/lib/invoice-state";
import { toast } from "@/components/ui/Toaster";

interface DueContract {
  id: string;
  name: string;
  clientName: string;
  address: string | null;
  pricePerVisitCents: number;
  dueOn: string;
  daysUntil: number;
}

/** `1 DAY`, `19 DAYS` — one phrasing, shared with the invoice book (`lib/invoice-state`). */
const dayWord = dueTail;

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

  const valueCents = contracts.reduce((s, c) => s + c.pricePerVisitCents, 0);

  return (
    <section>
      {/* The rail is 300px wide — the header wraps instead of fighting for a row. */}
      <LaneHead
        title="Service due"
        lamp="var(--amber)"
        right={<Money cents={valueCents} className="t-meta text-ink-3" />}
      />
      <div className="flex items-baseline gap-4 pb-2.5">
        <button
          disabled={busy}
          onClick={bookAll}
          /* The dimmed-while-working button was `opacity-50` — 1.9:1, which in a truck
             cab is a button that is simply not there. It recedes to the label tone
             instead, and keeps saying what it is doing. */
          className="eyebrow underline underline-offset-4 hover:text-ink disabled:no-underline"
        >
          {busy ? "Booking…" : "Book all"}
        </button>
        <Link href="/contracts" className="eyebrow hover:text-ink">
          Contracts →
        </Link>
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
                <Stamp date={c.dueOn} className="eyebrow" />
                <span
                  className="eyebrow"
                  style={{ color: late ? "var(--rose-ink)" : "var(--amber-ink)" }}
                >
                  {late ? (
                    <>
                      <Num>{Math.abs(c.daysUntil)}</Num> {lateTail(c.daysUntil)}
                    </>
                  ) : (
                    <>
                      IN <Num>{c.daysUntil}</Num> {dayWord(c.daysUntil)}
                    </>
                  )}
                </span>
              </div>
              <div className="mt-1 flex items-baseline justify-between gap-3">
                <p className="t-row truncate font-bold text-ink">{c.clientName}</p>
                <Money cents={c.pricePerVisitCents} className="t-row shrink-0" />
              </div>
              <p className="t-meta mt-1 truncate text-ink-2">{c.name}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
