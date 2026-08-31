"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/primitives";
import { toast } from "@/components/ui/Toaster";
import type { LeadOutcome } from "@/lib/lead-sales";

function localInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function plusHours(hours: number): string {
  return localInput(new Date(Date.now() + hours * 3600_000));
}

function tomorrowMorning(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return localInput(d);
}

/** A datetime-local value is in the dispatcher's wall clock. Give the server an
 * unambiguous instant so a UTC host cannot turn 15:00 Ottawa into 11:00 Ottawa. */
function followUpIso(value: string): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}

/**
 * Beaver's dispatcher should not turn every phone call into three forms. This dock lives
 * only on a lead record and records the outcome + the next promise in one action. The
 * existing lead page remains untouched, which keeps the first-client wave small enough
 * to roll back independently.
 */
export default function LeadSalesDock() {
  const pathname = usePathname();
  const match = pathname.match(/^\/leads\/([^/]+)$/);
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [followUpAt, setFollowUpAt] = useState("");
  const [sending, setSending] = useState<LeadOutcome | null>(null);

  if (!match) return null;
  const leadId = match[1];

  async function work(outcome: LeadOutcome, suggestedFollowUp?: string) {
    const due = followUpIso(followUpAt || suggestedFollowUp || "");
    setSending(outcome);
    const res = await fetch(`/api/leads/${leadId}/activity`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ outcome, note, followUpAt: due }),
    });
    setSending(null);

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      toast(body?.error || "The call outcome was not saved", "bad");
      return;
    }

    const labels: Record<LeadOutcome, string> = {
      NO_ANSWER: "No answer logged",
      CONNECTED: "Connected logged",
      CALL_BACK: "Callback scheduled",
      QUALIFIED: "Lead qualified",
      QUOTE_SENT: "Quote sent logged",
      BOOKED: "Booked — opening job",
      NOT_INTERESTED: "Lead closed — not interested",
      BAD_LEAD: "Lead closed — bad lead",
    };
    toast(labels[outcome]);

    if (outcome === "BOOKED") {
      window.location.assign(`${pathname}?convert=1`);
      return;
    }
    window.location.reload();
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-20 right-4 z-40 rounded bg-navy-900 px-4 py-3 t-body font-bold text-plate shadow-none md:bottom-6 md:right-6"
      >
        Log call outcome
      </button>
    );
  }

  return (
    <aside className="plate fixed bottom-20 right-4 z-40 w-[min(420px,calc(100vw-2rem))] p-4 md:bottom-6 md:right-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="eyebrow">Sales desk</div>
          <p className="t-row mt-1 font-bold text-ink">What happened on the call?</p>
        </div>
        <button type="button" className="eyebrow hover:text-ink" onClick={() => setOpen(false)}>
          Close
        </button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Button variant="ghost" disabled={!!sending} onClick={() => work("NO_ANSWER", plusHours(4))}>
          No answer
        </Button>
        <Button variant="ghost" disabled={!!sending} onClick={() => work("CONNECTED")}>
          Connected
        </Button>
        <Button variant="ghost" disabled={!!sending} onClick={() => work("CALL_BACK", tomorrowMorning())}>
          Call back
        </Button>
        <Button variant="ghost" disabled={!!sending} onClick={() => work("QUALIFIED")}>
          Qualified
        </Button>
        <Button variant="ghost" disabled={!!sending} onClick={() => work("QUOTE_SENT", tomorrowMorning())}>
          Quote sent
        </Button>
        <Button variant="primary" disabled={!!sending} onClick={() => work("BOOKED")}>
          Booked
        </Button>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <label className="block">
          <span className="eyebrow">Next follow-up</span>
          <input
            type="datetime-local"
            value={followUpAt}
            onChange={(e) => setFollowUpAt(e.target.value)}
            className="control mono mt-1"
          />
        </label>
        <label className="block">
          <span className="eyebrow">Note</span>
          <input
            value={note}
            maxLength={2000}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Voicemail, 2BR move…"
            className="control mt-1"
          />
        </label>
      </div>

      <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3">
        <Button variant="danger" disabled={!!sending} onClick={() => work("NOT_INTERESTED")}>
          Not interested
        </Button>
        <Button variant="quiet" disabled={!!sending} onClick={() => work("BAD_LEAD")}>
          Bad lead
        </Button>
      </div>
    </aside>
  );
}
