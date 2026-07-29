"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  BadgeCheck,
  Clock3,
  ExternalLink,
  FileWarning,
  Loader2,
  MessageSquareText,
  RefreshCw,
  Scale,
  Send,
} from "lucide-react";

const CATEGORIES = [
  ["INVALID_CONTACT", "Invalid contact"],
  ["DUPLICATE_LEAD", "Duplicate lead"],
  ["WRONG_SCOPE", "Wrong scope or category"],
  ["CUSTOMER_UNAVAILABLE", "Customer unavailable"],
  ["MISREPRESENTED_BUDGET", "Misrepresented budget"],
  ["OTHER", "Other"],
] as const;

const RESOLUTION_ACTIONS = [
  ["REQUEST_INFO", "Request information"],
  ["RESOLVE_REFUND", "Resolve with refund"],
  ["RESOLVE_NO_REFUND", "Resolve without refund"],
  ["CLOSE", "Close case"],
] as const;

type Message = {
  id: string;
  disputeId: string;
  tenantId: string | null;
  authorEmail: string | null;
  tenantName: string | null;
  body: string;
  evidenceUrls: string[];
  createdAt: string;
};

type Dispute = {
  id: string;
  claimId: string;
  openedByTenantId: string;
  respondentTenantId: string;
  category: string;
  summary: string;
  evidenceUrls: string[];
  status: string;
  resolution: string | null;
  resolvedByEmail: string | null;
  slaDueAt: string;
  createdAt: string;
  updatedAt: string;
  listingTitle: string;
  listingId: string;
  claimStatus: string;
  creditsPaid: number;
  openerName: string;
  respondentName: string;
  messages: Message[];
};

type ClaimOption = {
  id: string;
  status: string;
  creditsPaid: number;
  listing: {
    id: string;
    title: string;
    city: string;
    province: string;
    owner: string;
  };
  claimant: string;
  role: "CLAIMANT" | "OWNER";
};

type Payload = {
  data: Dispute[];
  eligibleClaims: ClaimOption[];
  isSuperAdmin: boolean;
  meta: { count: number; overdue: number };
};

function label(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function statusClass(status: string) {
  if (status === "RESOLVED") return "bg-emerald-50 text-emerald-700";
  if (status === "CLOSED") return "bg-slate-100 text-slate-700";
  if (status === "NEEDS_INFO") return "bg-blue-50 text-blue-700";
  return "bg-amber-50 text-amber-800";
}

export default function NetworkDisputesManager({ allCases = false }: { allCases?: boolean }) {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selectedClaimId, setSelectedClaimId] = useState("");

  const load = useCallback(async () => {
    setError("");
    const response = await fetch(`/api/network/disputes${allCases ? "?scope=all" : ""}`, {
      cache: "no-store",
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Unable to load disputes.");
    setPayload(result);
    setSelectedClaimId((current) => current || result.eligibleClaims[0]?.id || "");
  }, [allCases]);

  useEffect(() => {
    load().catch((reason) => {
      setError(reason instanceof Error ? reason.message : "Unable to load disputes.");
    });
  }, [load]);

  const sorted = useMemo(() => {
    if (!payload) return [];
    return [...payload.data].sort((a, b) => {
      const aClosed = ["RESOLVED", "CLOSED"].includes(a.status);
      const bClosed = ["RESOLVED", "CLOSED"].includes(b.status);
      if (aClosed !== bClosed) return Number(aClosed) - Number(bClosed);
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  }, [payload]);

  async function createDispute(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("create");
    setError("");
    setNotice("");
    const form = new FormData(event.currentTarget);

    try {
      const response = await fetch("/api/network/disputes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          claimId: selectedClaimId,
          category: form.get("category"),
          summary: form.get("summary"),
          evidenceUrls: form.get("evidenceUrls"),
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        const details = Array.isArray(result.details) ? result.details.join(" ") : result.error;
        throw new Error(details || "Unable to open dispute.");
      }
      event.currentTarget.reset();
      setSelectedClaimId("");
      setNotice("Dispute opened and the other party was notified.");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to open dispute.");
    } finally {
      setBusy("");
    }
  }

  async function reply(event: FormEvent<HTMLFormElement>, disputeId: string) {
    event.preventDefault();
    setBusy(`reply:${disputeId}`);
    setError("");
    setNotice("");
    const form = new FormData(event.currentTarget);

    try {
      const response = await fetch(`/api/network/disputes/${disputeId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: form.get("message"),
          evidenceUrls: form.get("evidenceUrls"),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to post response.");
      event.currentTarget.reset();
      setNotice("Response added to the dispute thread.");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to post response.");
    } finally {
      setBusy("");
    }
  }

  async function resolve(event: FormEvent<HTMLFormElement>, disputeId: string) {
    event.preventDefault();
    setBusy(`resolve:${disputeId}`);
    setError("");
    setNotice("");
    const form = new FormData(event.currentTarget);

    try {
      const response = await fetch(`/api/network/disputes/${disputeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: form.get("action"),
          resolution: form.get("resolution"),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to resolve dispute.");
      setNotice(
        result.walletBalance != null
          ? `Case resolved. Claimant wallet balance: ${result.walletBalance}.`
          : "Case status updated."
      );
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to resolve dispute.");
    } finally {
      setBusy("");
    }
  }

  if (!payload) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading dispute cases...
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-24 md:pb-8">
      <section className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-3xl font-black">{payload.meta.count}</div>
          <div className="mt-1 text-sm text-slate-500">Visible cases</div>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
          <div className="text-3xl font-black text-amber-950">
            {payload.data.filter((item) => !["RESOLVED", "CLOSED"].includes(item.status)).length}
          </div>
          <div className="mt-1 text-sm text-amber-800">Open cases</div>
        </div>
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 shadow-sm">
          <div className="text-3xl font-black text-red-950">{payload.meta.overdue}</div>
          <div className="mt-1 text-sm text-red-800">Past SLA</div>
        </div>
      </section>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
          {error}
        </div>
      )}
      {notice && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-700">
          {notice}
        </div>
      )}

      {!allCases && (
        <form onSubmit={createDispute} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <FileWarning className="h-5 w-5 text-amber-600" />
            <h2 className="text-lg font-black">Open a dispute</h2>
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            One case is allowed per claim. The listing is paused as `DISPUTED` until the case is
            resolved or closed.
          </p>

          {payload.eligibleClaims.length ? (
            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              <label>
                <span className="text-sm font-bold">Lead claim</span>
                <select
                  value={selectedClaimId}
                  onChange={(event) => setSelectedClaimId(event.target.value)}
                  required
                  className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm"
                >
                  <option value="" disabled>Select claim</option>
                  {payload.eligibleClaims.map((claim) => (
                    <option key={claim.id} value={claim.id}>
                      {claim.role} · {claim.listing.title} · {claim.listing.city} · {claim.status}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="text-sm font-bold">Category</span>
                <select name="category" required className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm">
                  {CATEGORIES.map(([value, title]) => (
                    <option key={value} value={value}>{title}</option>
                  ))}
                </select>
              </label>
              <label className="lg:col-span-2">
                <span className="text-sm font-bold">Case summary</span>
                <textarea name="summary" required minLength={30} maxLength={5000} rows={6} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-3 text-sm" placeholder="Describe what was promised, what happened, dates, attempted contacts and requested outcome." />
              </label>
              <label className="lg:col-span-2">
                <span className="text-sm font-bold">Evidence links</span>
                <textarea name="evidenceUrls" rows={3} maxLength={5000} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-3 text-sm" placeholder={"https://...\nhttps://..."} />
                <span className="mt-1 block text-xs text-slate-500">Up to 10 HTTPS links. Private file uploads remain a separate storage workflow.</span>
              </label>
              <div className="lg:col-span-2">
                <button disabled={busy === "create" || !selectedClaimId} className="inline-flex items-center rounded-xl bg-amber-500 px-5 py-3 text-sm font-black text-amber-950 disabled:opacity-50">
                  {busy === "create" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Open dispute case
                </button>
              </div>
            </div>
          ) : (
            <p className="mt-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
              No eligible lead claims are available. Approved, unlocked, won or lost claims without an
              existing dispute will appear here.
            </p>
          )}
        </form>
      )}

      <section className="space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Scale className="h-5 w-5 text-slate-600" />
            <h2 className="text-xl font-black">Dispute cases</h2>
          </div>
          <button onClick={() => void load()} className="inline-flex items-center rounded-lg border border-slate-200 px-3 py-2 text-xs font-black">
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Refresh
          </button>
        </div>

        {sorted.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center">
            <BadgeCheck className="mx-auto h-10 w-10 text-slate-300" />
            <h3 className="mt-4 text-xl font-black">No dispute cases</h3>
            <p className="mt-2 text-sm text-slate-500">Cases and evidence threads will appear here.</p>
          </div>
        ) : (
          sorted.map((dispute) => {
            const closed = ["RESOLVED", "CLOSED"].includes(dispute.status);
            const overdue = !closed && new Date(dispute.slaDueAt).getTime() < Date.now();
            return (
              <article key={dispute.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-100 p-5">
                  <div className="flex flex-col justify-between gap-4 lg:flex-row">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-lg font-black">{dispute.listingTitle}</h3>
                        <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${statusClass(dispute.status)}`}>
                          {label(dispute.status)}
                        </span>
                        {overdue && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-red-700">
                            <AlertTriangle className="h-3.5 w-3.5" /> SLA overdue
                          </span>
                        )}
                      </div>
                      <p className="mt-2 text-sm text-slate-600">
                        {dispute.openerName} vs {dispute.respondentName} · {label(dispute.category)}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-xs text-slate-500">
                        <span>Claim {dispute.claimStatus}</span>
                        <span>{dispute.creditsPaid} credits at issue</span>
                        <span className="inline-flex items-center gap-1">
                          <Clock3 className="h-3.5 w-3.5" /> SLA {new Date(dispute.slaDueAt).toLocaleString("en-CA")}
                        </span>
                      </div>
                    </div>
                    <Link href={`/network`} className="inline-flex h-fit items-center text-xs font-black text-blue-700">
                      Open lead network <ExternalLink className="ml-1 h-3.5 w-3.5" />
                    </Link>
                  </div>
                  <p className="mt-4 whitespace-pre-line rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">{dispute.summary}</p>
                  {dispute.evidenceUrls.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {dispute.evidenceUrls.map((url, index) => (
                        <a key={url} href={url} target="_blank" rel="nofollow noopener noreferrer" className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-blue-700">
                          Evidence {index + 1}
                        </a>
                      ))}
                    </div>
                  )}
                </div>

                <div className="p-5">
                  <div className="flex items-center gap-2 font-black">
                    <MessageSquareText className="h-4 w-4 text-slate-500" /> Thread
                  </div>
                  <div className="mt-4 space-y-3">
                    {dispute.messages.map((message) => (
                      <div key={message.id} className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                        <div className="flex flex-wrap justify-between gap-2 text-xs text-slate-500">
                          <span className="font-bold text-slate-700">{message.tenantName || message.authorEmail || "Platform moderation"}</span>
                          <span>{new Date(message.createdAt).toLocaleString("en-CA")}</span>
                        </div>
                        <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-600">{message.body}</p>
                        {message.evidenceUrls.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {message.evidenceUrls.map((url, index) => (
                              <a key={url} href={url} target="_blank" rel="nofollow noopener noreferrer" className="text-xs font-bold text-blue-700 underline">
                                Attachment {index + 1}
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {!closed && (
                    <form onSubmit={(event) => reply(event, dispute.id)} className="mt-5 grid gap-3 rounded-xl border border-slate-200 p-4">
                      <textarea name="message" required minLength={10} maxLength={5000} rows={4} className="w-full rounded-xl border border-slate-200 px-3 py-3 text-sm" placeholder="Add facts, response or requested information..." />
                      <input name="evidenceUrls" maxLength={5000} className="w-full rounded-xl border border-slate-200 px-3 py-3 text-sm" placeholder="HTTPS evidence links, comma-separated" />
                      <button disabled={busy === `reply:${dispute.id}`} className="inline-flex w-fit items-center rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white disabled:opacity-50">
                        {busy === `reply:${dispute.id}` ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                        Add response
                      </button>
                    </form>
                  )}

                  {allCases && payload.isSuperAdmin && !closed && (
                    <form onSubmit={(event) => resolve(event, dispute.id)} className="mt-5 grid gap-3 rounded-xl border border-violet-200 bg-violet-50/50 p-4">
                      <div className="font-black text-violet-950">Super-admin resolution</div>
                      <select name="action" className="rounded-xl border border-violet-200 bg-white px-3 py-3 text-sm">
                        {RESOLUTION_ACTIONS.map(([value, title]) => (
                          <option key={value} value={value}>{title}</option>
                        ))}
                      </select>
                      <textarea name="resolution" required minLength={10} maxLength={5000} rows={4} className="rounded-xl border border-violet-200 bg-white px-3 py-3 text-sm" placeholder="Decision, evidence considered and next steps..." />
                      <button disabled={busy === `resolve:${dispute.id}`} className="inline-flex w-fit items-center rounded-xl bg-violet-700 px-4 py-2.5 text-sm font-black text-white disabled:opacity-50">
                        {busy === `resolve:${dispute.id}` && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Apply resolution
                      </button>
                    </form>
                  )}

                  {dispute.resolution && (
                    <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                      <div className="font-black text-emerald-950">Resolution</div>
                      <p className="mt-2 whitespace-pre-line text-sm leading-6 text-emerald-800">{dispute.resolution}</p>
                    </div>
                  )}
                </div>
              </article>
            );
          })
        )}
      </section>
    </div>
  );
}
