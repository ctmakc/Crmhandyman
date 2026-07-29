"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Loader2,
  Mail,
  Play,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
} from "lucide-react";

type OutboxMessage = {
  id: string;
  idempotencyKey: string;
  toEmail: string;
  replyTo: string | null;
  subject: string;
  status: string;
  attempts: number;
  maxAttempts: number;
  nextAttemptAt: string;
  lockedAt: string | null;
  lastError: string | null;
  providerMessageId: string | null;
  createdAt: string;
  updatedAt: string;
  sentAt: string | null;
  overdue: boolean;
};

type Payload = {
  data: OutboxMessage[];
  meta: {
    counts: { pending: number; sending: number; sent: number; failed: number };
    selected: number;
  };
};

function statusClass(status: string) {
  if (status === "SENT") return "bg-emerald-50 text-emerald-700";
  if (status === "FAILED") return "bg-red-50 text-red-700";
  if (status === "SENDING") return "bg-blue-50 text-blue-700";
  return "bg-amber-50 text-amber-800";
}

export default function AdminEmailOutbox() {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [status, setStatus] = useState("");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setError("");
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (query.trim()) params.set("q", query.trim());
    const response = await fetch(`/api/admin/email-outbox?${params.toString()}`, {
      cache: "no-store",
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Unable to load email outbox.");
    setPayload(result);
  }, [query, status]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      load().catch((reason) =>
        setError(reason instanceof Error ? reason.message : "Unable to load email outbox.")
      );
    }, 250);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function action(input: { action: string; id?: string; limit?: number }) {
    const key = input.id ? `${input.action}:${input.id}` : input.action;
    setBusy(key);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/admin/email-outbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to update email outbox.");
      setNotice(
        input.action === "PROCESS_DUE"
          ? `Processed ${result.selected}: ${result.sent} sent, ${result.queued} queued, ${result.failed} failed.`
          : input.action === "REQUEUE_FAILED"
            ? `${result.updated} failed messages returned to the queue.`
            : "Message returned to the delivery queue."
      );
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to update email outbox.");
    } finally {
      setBusy("");
    }
  }

  const messages = useMemo(() => payload?.data ?? [], [payload]);
  const counts = payload?.meta.counts ?? { pending: 0, sending: 0, sent: 0, failed: 0 };
  const metricCards = [
    {
      label: "Pending",
      count: counts.pending,
      Icon: Clock3,
      classes: "border-amber-200 bg-amber-50 text-amber-950",
    },
    {
      label: "Sending",
      count: counts.sending,
      Icon: Send,
      classes: "border-blue-200 bg-blue-50 text-blue-950",
    },
    {
      label: "Sent",
      count: counts.sent,
      Icon: CheckCircle2,
      classes: "border-emerald-200 bg-emerald-50 text-emerald-950",
    },
    {
      label: "Failed",
      count: counts.failed,
      Icon: AlertTriangle,
      classes: "border-red-200 bg-red-50 text-red-950",
    },
  ];

  return (
    <div className="space-y-6">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metricCards.map(({ label, count, Icon, classes }) => (
          <div key={label} className={`rounded-2xl border p-5 shadow-sm ${classes}`}>
            <Icon className="h-5 w-5" />
            <div className="mt-4 text-3xl font-black">{count}</div>
            <div className="mt-1 text-sm font-bold">{label}</div>
          </div>
        ))}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-slate-200 p-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-black">Delivery queue</h2>
            <p className="mt-1 text-sm text-slate-500">{messages.length} messages in the current view</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void action({ action: "PROCESS_DUE", limit: 50 })}
              disabled={Boolean(busy)}
              className="inline-flex items-center rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white disabled:opacity-50"
            >
              {busy === "PROCESS_DUE" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
              Process due
            </button>
            <button
              type="button"
              onClick={() => void action({ action: "REQUEUE_FAILED" })}
              disabled={Boolean(busy) || counts.failed === 0}
              className="inline-flex items-center rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-black text-slate-700 disabled:opacity-50"
            >
              <RotateCcw className="mr-2 h-4 w-4" /> Requeue failed
            </button>
            <button
              type="button"
              onClick={() => void load()}
              className="rounded-xl border border-slate-200 p-3 text-slate-600"
              aria-label="Refresh email outbox"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </div>

        <form onSubmit={(event: FormEvent) => event.preventDefault()} className="grid gap-3 border-b border-slate-100 p-5 sm:grid-cols-[180px_1fr]">
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm"
          >
            <option value="">All statuses</option>
            <option value="PENDING">Pending</option>
            <option value="SENDING">Sending</option>
            <option value="SENT">Sent</option>
            <option value="FAILED">Failed</option>
          </select>
          <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 focus-within:border-violet-400">
            <Search className="h-4 w-4 text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search recipient, subject or idempotency key"
              className="w-full bg-transparent py-3 text-sm outline-none"
            />
          </label>
        </form>

        {error && <div className="m-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</div>}
        {notice && <div className="m-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-700">{notice}</div>}

        <div className="divide-y divide-slate-100">
          {messages.length === 0 ? (
            <div className="p-10 text-center">
              <Mail className="mx-auto h-10 w-10 text-slate-300" />
              <h3 className="mt-4 font-black">No outbox messages found</h3>
            </div>
          ) : (
            messages.map((message) => (
              <article key={message.id} className="p-5">
                <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${statusClass(message.status)}`}>
                        {message.status}
                      </span>
                      {message.overdue && <span className="text-xs font-black text-amber-700">Due now</span>}
                      <span className="text-xs text-slate-500">Attempts {message.attempts}/{message.maxAttempts}</span>
                    </div>
                    <h3 className="mt-3 font-black text-slate-900">{message.subject}</h3>
                    <p className="mt-1 text-sm text-slate-600">To: {message.toEmail}{message.replyTo ? ` · Reply-to: ${message.replyTo}` : ""}</p>
                    <p className="mt-2 break-all font-mono text-[11px] text-slate-400">{message.idempotencyKey}</p>
                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-slate-500">
                      <span>Created {new Date(message.createdAt).toLocaleString("en-CA")}</span>
                      <span>Next {new Date(message.nextAttemptAt).toLocaleString("en-CA")}</span>
                      {message.sentAt && <span>Sent {new Date(message.sentAt).toLocaleString("en-CA")}</span>}
                    </div>
                    {message.lastError && (
                      <pre className="mt-3 max-h-32 overflow-auto whitespace-pre-wrap rounded-xl bg-red-50 p-3 text-xs text-red-700">{message.lastError}</pre>
                    )}
                  </div>
                  {message.status !== "SENT" && (
                    <button
                      type="button"
                      onClick={() => void action({ action: "RETRY", id: message.id })}
                      disabled={Boolean(busy)}
                      className="inline-flex shrink-0 items-center rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-black text-slate-700 disabled:opacity-50"
                    >
                      {busy === `RETRY:${message.id}` ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-2 h-4 w-4" />}
                      Retry
                    </button>
                  )}
                </div>
              </article>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
