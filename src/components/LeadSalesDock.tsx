"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
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

type SmsTemplate = { id: string; label: string; message: string };
type SmsHistory = {
  id: string;
  action: string;
  actorName: string;
  createdAt: string;
  meta?: { message?: string; direction?: string } | null;
};
type SmsDesk = {
  ready: boolean;
  fromNumber: string | null;
  phone: string | null;
  optedOut: boolean;
  templates: SmsTemplate[];
  history: SmsHistory[];
};

function smsAction(action: string): string {
  if (action.endsWith("sms_sent")) return "SENT";
  if (action.endsWith("sms_received")) return "RECEIVED";
  if (action.endsWith("sms_opt_out")) return "OPTED OUT";
  if (action.endsWith("sms_opt_in")) return "OPTED IN";
  if (action.endsWith("sms_failed")) return "FAILED";
  return "SMS";
}

export default function LeadSalesDock() {
  const pathname = usePathname();
  const match = pathname.match(/^\/leads\/([^/]+)$/);
  const leadId = match?.[1] || "";
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [followUpAt, setFollowUpAt] = useState("");
  const [sending, setSending] = useState<LeadOutcome | null>(null);
  const [sms, setSms] = useState<SmsDesk | null>(null);
  const [smsLoading, setSmsLoading] = useState(false);
  const [smsSending, setSmsSending] = useState(false);
  const [smsTemplateId, setSmsTemplateId] = useState("");
  const [smsText, setSmsText] = useState("");

  async function loadSms() {
    if (!leadId) return;
    setSmsLoading(true);
    const res = await fetch(`/api/leads/${leadId}/sms`);
    setSmsLoading(false);
    if (!res.ok) return;
    const data = (await res.json()) as SmsDesk;
    setSms(data);
    if (!smsText && data.templates[0]) {
      setSmsTemplateId(data.templates[0].id);
      setSmsText(data.templates[0].message);
    }
  }

  useEffect(() => {
    if (open && leadId) loadSms();
    // `smsText` deliberately stays out: opening the dock must not overwrite an edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, leadId]);

  if (!match) return null;

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

  function chooseTemplate(id: string) {
    setSmsTemplateId(id);
    const template = sms?.templates.find((item) => item.id === id);
    if (template) setSmsText(template.message);
  }

  async function sendText() {
    const message = smsText.trim();
    if (!message) return;
    setSmsSending(true);
    const res = await fetch(`/api/leads/${leadId}/sms`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, templateId: smsTemplateId || undefined }),
    });
    setSmsSending(false);
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      toast(body?.error || "SMS was not sent", "bad");
      await loadSms();
      return;
    }
    toast("SMS sent");
    window.location.reload();
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-20 right-4 z-40 rounded bg-navy-900 px-4 py-3 t-body font-bold text-plate shadow-none md:bottom-6 md:right-6"
      >
        Work lead
      </button>
    );
  }

  return (
    <aside className="plate fixed bottom-20 right-4 z-40 max-h-[78vh] w-[min(440px,calc(100vw-2rem))] overflow-y-auto p-4 md:bottom-6 md:right-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="eyebrow">Sales desk</div>
          <p className="t-row mt-1 font-bold text-ink">Call, text, set the next promise</p>
        </div>
        <button type="button" className="eyebrow hover:text-ink" onClick={() => setOpen(false)}>
          Close
        </button>
      </div>

      <div className="mt-4 border-t border-line pt-3">
        <div className="eyebrow">Call outcome</div>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
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

        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="danger" disabled={!!sending} onClick={() => work("NOT_INTERESTED")}>
            Not interested
          </Button>
          <Button variant="quiet" disabled={!!sending} onClick={() => work("BAD_LEAD")}>
            Bad lead
          </Button>
        </div>
      </div>

      <div className="mt-4 border-t border-line pt-3">
        <div className="flex items-baseline justify-between gap-3">
          <div className="eyebrow">SMS</div>
          <div className="mono t-micro text-ink-3">
            {sms?.fromNumber || (smsLoading ? "LOADING…" : "NOT CONFIGURED")}
          </div>
        </div>

        {sms && !sms.ready && (
          <p className="t-meta mt-2 text-ink-2">
            SMS is not ready. Configure the Twilio channel in <a className="underline" href="/settings/sms">Settings → SMS</a>.
          </p>
        )}

        {sms?.optedOut && (
          <p className="t-meta mt-2 font-bold text-rose-ink">
            Customer opted out. Do not text until they reply START.
          </p>
        )}

        {sms?.ready && (
          <>
            <label className="mt-3 block">
              <span className="eyebrow">Quick message</span>
              <select
                value={smsTemplateId}
                onChange={(e) => chooseTemplate(e.target.value)}
                className="control mt-1"
                disabled={sms.optedOut}
              >
                {sms.templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="mt-2 block">
              <span className="sr-only">SMS message</span>
              <textarea
                rows={4}
                maxLength={1600}
                value={smsText}
                onChange={(e) => setSmsText(e.target.value)}
                className="control"
                disabled={sms.optedOut}
              />
            </label>
            <div className="mt-2 flex items-center justify-between gap-3">
              <span className="mono t-micro text-ink-3">{smsText.length}/1600</span>
              <Button
                variant="primary"
                onClick={sendText}
                disabled={smsSending || sms.optedOut || !smsText.trim()}
              >
                {smsSending ? "Sending…" : "Send SMS"}
              </Button>
            </div>
          </>
        )}

        {sms?.history && sms.history.length > 0 && (
          <div className="mt-3 border-t border-line">
            {sms.history.slice(0, 6).map((entry) => (
              <div key={entry.id} className="border-b border-line py-2.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="eyebrow">{smsAction(entry.action)}</span>
                  <span className="mono t-micro text-ink-3">
                    {new Date(entry.createdAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                  </span>
                </div>
                {entry.meta?.message && (
                  <p className="t-meta mt-1 whitespace-pre-wrap text-ink-2">{entry.meta.message}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
