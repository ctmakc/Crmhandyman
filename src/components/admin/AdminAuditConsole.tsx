"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  Webhook,
} from "lucide-react";

type AuditEvent = {
  id: string;
  actorType: string;
  actorId: string | null;
  actorEmail: string | null;
  tenantId: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  metadata: Record<string, unknown>;
  ipHash: string | null;
  createdAt: string;
  tenantName: string | null;
};

type WebhookReceipt = {
  id: string;
  provider: string;
  eventId: string;
  eventType: string;
  objectId: string | null;
  payloadSha256: string;
  livemode: boolean;
  status: string;
  attempts: number;
  lastError: string | null;
  receivedAt: string;
  processedAt: string | null;
  updatedAt: string;
};

type Payload = {
  audit: AuditEvent[];
  webhooks: WebhookReceipt[];
  meta: {
    auditCounts: Record<string, number>;
    webhookCounts: Record<string, number>;
    auditSelected: number;
    webhookSelected: number;
  };
};

function webhookStatusClass(status: string) {
  if (status === "PROCESSED") return "bg-emerald-50 text-emerald-700";
  if (status === "FAILED") return "bg-red-50 text-red-700";
  if (status === "IGNORED") return "bg-slate-100 text-slate-700";
  return "bg-amber-50 text-amber-800";
}

function prettyJson(value: Record<string, unknown>) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "{}";
  }
}

export default function AdminAuditConsole() {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [tab, setTab] = useState<"audit" | "webhooks">("audit");
  const [query, setQuery] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [webhookStatus, setWebhookStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      if (actionFilter) params.set("action", actionFilter);
      if (webhookStatus) params.set("webhookStatus", webhookStatus);
      const response = await fetch(`/api/admin/audit?${params.toString()}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to load audit data.");
      setPayload(result);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load audit data.");
    } finally {
      setLoading(false);
    }
  }, [actionFilter, query, webhookStatus]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 250);
    return () => window.clearTimeout(timer);
  }, [load]);

  const actions = useMemo(
    () => Array.from(new Set((payload?.audit ?? []).map((item) => item.action))).sort(),
    [payload]
  );
  const auditCounts = payload?.meta.auditCounts ?? {};
  const webhookCounts = payload?.meta.webhookCounts ?? {};

  return (
    <div className="space-y-6">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-violet-200 bg-violet-50 p-5 shadow-sm">
          <ShieldCheck className="h-5 w-5 text-violet-700" />
          <div className="mt-4 text-3xl font-black text-violet-950">
            {(auditCounts.USER ?? 0) + (auditCounts.SYSTEM ?? 0) + (auditCounts.WEBHOOK ?? 0)}
          </div>
          <div className="mt-1 text-sm font-bold text-violet-800">Audit events</div>
        </div>
        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5 shadow-sm">
          <Webhook className="h-5 w-5 text-blue-700" />
          <div className="mt-4 text-3xl font-black text-blue-950">
            {Object.values(webhookCounts).reduce((sum, count) => sum + count, 0)}
          </div>
          <div className="mt-1 text-sm font-bold text-blue-800">Webhook receipts</div>
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
          <CheckCircle2 className="h-5 w-5 text-emerald-700" />
          <div className="mt-4 text-3xl font-black text-emerald-950">{webhookCounts.PROCESSED ?? 0}</div>
          <div className="mt-1 text-sm font-bold text-emerald-800">Processed webhooks</div>
        </div>
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 shadow-sm">
          <AlertTriangle className="h-5 w-5 text-red-700" />
          <div className="mt-4 text-3xl font-black text-red-950">{webhookCounts.FAILED ?? 0}</div>
          <div className="mt-1 text-sm font-bold text-red-800">Failed webhooks</div>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col justify-between gap-4 border-b border-slate-200 p-5 lg:flex-row lg:items-center">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setTab("audit")}
              className={`inline-flex items-center rounded-xl px-4 py-2.5 text-sm font-black ${tab === "audit" ? "bg-violet-700 text-white" : "bg-slate-100 text-slate-700"}`}
            >
              <Activity className="mr-2 h-4 w-4" /> Audit events
            </button>
            <button
              type="button"
              onClick={() => setTab("webhooks")}
              className={`inline-flex items-center rounded-xl px-4 py-2.5 text-sm font-black ${tab === "webhooks" ? "bg-blue-700 text-white" : "bg-slate-100 text-slate-700"}`}
            >
              <Webhook className="mr-2 h-4 w-4" /> Webhook receipts
            </button>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-black text-slate-700 disabled:opacity-50"
          >
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Refresh
          </button>
        </div>

        <div className="grid gap-3 border-b border-slate-100 p-5 md:grid-cols-[1fr_240px]">
          <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 focus-within:border-violet-400">
            <Search className="h-4 w-4 text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search actor, tenant, action, target or webhook ID"
              className="w-full bg-transparent py-3 text-sm outline-none"
            />
          </label>
          {tab === "audit" ? (
            <select
              value={actionFilter}
              onChange={(event) => setActionFilter(event.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm"
            >
              <option value="">All audit actions</option>
              {actions.map((action) => <option key={action} value={action}>{action}</option>)}
            </select>
          ) : (
            <select
              value={webhookStatus}
              onChange={(event) => setWebhookStatus(event.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm"
            >
              <option value="">All webhook statuses</option>
              <option value="RECEIVED">Received</option>
              <option value="PROCESSED">Processed</option>
              <option value="IGNORED">Ignored</option>
              <option value="FAILED">Failed</option>
            </select>
          )}
        </div>

        {error && <div className="m-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</div>}

        {tab === "audit" ? (
          <div className="divide-y divide-slate-100">
            {(payload?.audit ?? []).length === 0 ? (
              <div className="p-10 text-center text-sm text-slate-500">No audit events found.</div>
            ) : (
              payload?.audit.map((event) => (
                <article key={event.id} className="p-5">
                  <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-start">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-violet-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-violet-700">{event.actorType}</span>
                        <span className="text-xs text-slate-500">{new Date(event.createdAt).toLocaleString("en-CA")}</span>
                      </div>
                      <h3 className="mt-3 font-black text-slate-950">{event.action}</h3>
                      <p className="mt-1 text-sm text-slate-600">
                        Actor: {event.actorEmail || event.actorId || event.actorType}
                        {event.tenantName ? ` · Tenant: ${event.tenantName}` : ""}
                      </p>
                      <p className="mt-1 text-sm text-slate-500">
                        Target: {event.targetType}{event.targetId ? ` · ${event.targetId}` : ""}
                        {event.ipHash ? ` · IP hash ${event.ipHash}` : ""}
                      </p>
                    </div>
                  </div>
                  <pre className="mt-4 max-h-64 overflow-auto whitespace-pre-wrap rounded-xl bg-slate-950 p-4 text-xs text-slate-200">{prettyJson(event.metadata)}</pre>
                </article>
              ))
            )}
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {(payload?.webhooks ?? []).length === 0 ? (
              <div className="p-10 text-center text-sm text-slate-500">No webhook receipts found.</div>
            ) : (
              payload?.webhooks.map((receipt) => (
                <article key={receipt.id} className="p-5">
                  <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${webhookStatusClass(receipt.status)}`}>{receipt.status}</span>
                        <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-blue-700">{receipt.provider}</span>
                        {receipt.livemode && <span className="rounded-full bg-red-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-red-700">Live</span>}
                      </div>
                      <h3 className="mt-3 font-black text-slate-950">{receipt.eventType}</h3>
                      <p className="mt-1 break-all font-mono text-xs text-slate-500">{receipt.eventId}</p>
                      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-slate-500">
                        <span className="inline-flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" /> Received {new Date(receipt.receivedAt).toLocaleString("en-CA")}</span>
                        <span>Attempts {receipt.attempts}</span>
                        {receipt.objectId && <span>Object {receipt.objectId}</span>}
                        <span>Payload {receipt.payloadSha256}</span>
                      </div>
                      {receipt.lastError && <pre className="mt-4 max-h-40 overflow-auto whitespace-pre-wrap rounded-xl bg-red-50 p-3 text-xs text-red-700">{receipt.lastError}</pre>}
                    </div>
                  </div>
                </article>
              ))
            )}
          </div>
        )}
      </section>
    </div>
  );
}
