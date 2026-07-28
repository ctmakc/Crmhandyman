"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  BadgeCheck,
  Check,
  CircleDollarSign,
  Clock3,
  Eye,
  Loader2,
  LockKeyhole,
  MapPin,
  Plus,
  RefreshCw,
  RotateCcw,
  Send,
  ShieldCheck,
  Store,
  X,
} from "lucide-react";
import { SERVICE_CATALOG, titleFromSlug } from "@/lib/marketplace-config";

type Owner = {
  businessName: string;
  profileSlug: string | null;
  verificationStatus: string;
};

type EligibleLead = {
  id: string;
  name: string;
  city: string | null;
  jobType: string | null;
  status: string;
  createdAt: string;
};

type AvailableListing = {
  id: string;
  title: string;
  summary: string;
  serviceSlug: string;
  city: string;
  province: string;
  budgetMin: number | null;
  budgetMax: number | null;
  exclusive: boolean;
  maxClaims: number;
  claimCount: number;
  contactUnlockPriceCredits: number;
  expiresAt: string | null;
  createdAt: string;
  owner: Owner;
  myClaim: { tenantId: string; status: string } | null;
};

type OwnedClaim = {
  id: string;
  status: string;
  creditsPaid: number;
  createdAt: string;
  claimant: Owner;
};

type OwnedListing = Omit<AvailableListing, "owner" | "myClaim" | "claimCount"> & {
  status: string;
  lead: {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    address: string | null;
    city: string | null;
    jobType: string | null;
    status: string;
  };
  claims: OwnedClaim[];
};

type MyClaim = {
  id: string;
  status: string;
  creditsPaid: number;
  createdAt: string;
  listing: {
    id: string;
    title: string;
    summary: string;
    serviceSlug: string;
    city: string;
    province: string;
    budgetMin: number | null;
    budgetMax: number | null;
    contactUnlockPriceCredits: number;
    owner: Owner;
    contact: {
      name: string;
      phone: string | null;
      email: string | null;
      address: string | null;
      notes: string | null;
    } | null;
  };
};

type NetworkPayload = {
  tenant: {
    id: string;
    businessName: string;
    plan: string;
    contractorProfile: {
      slug: string;
      displayName: string;
      profileStatus: string;
    } | null;
  } | null;
  eligibleLeads: EligibleLead[];
  available: AvailableListing[];
  owned: OwnedListing[];
  myClaims: MyClaim[];
};

type Tab = "available" | "owned" | "claims";

function formatMoney(min: number | null, max: number | null) {
  if (min == null && max == null) return "Budget not disclosed";
  if (min != null && max != null) return `$${Math.round(min).toLocaleString("en-CA")}–$${Math.round(max).toLocaleString("en-CA")}`;
  if (min != null) return `From $${Math.round(min).toLocaleString("en-CA")}`;
  return `Up to $${Math.round(max ?? 0).toLocaleString("en-CA")}`;
}

function statusClass(status: string) {
  if (["APPROVED", "CONTACT_UNLOCKED", "WON"].includes(status)) {
    return "bg-emerald-50 text-emerald-700";
  }
  if (["REJECTED", "LOST", "CLOSED", "EXPIRED"].includes(status)) {
    return "bg-red-50 text-red-700";
  }
  if (status === "REFUNDED") return "bg-blue-50 text-blue-700";
  return "bg-amber-50 text-amber-700";
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${statusClass(status)}`}>
      {titleFromSlug(status.toLowerCase())}
    </span>
  );
}

function OwnerName({ owner }: { owner: Owner }) {
  const content = (
    <span className="inline-flex items-center gap-1.5 font-bold text-slate-700">
      {owner.verificationStatus === "VERIFIED" && <BadgeCheck className="h-4 w-4 text-emerald-600" />}
      {owner.businessName}
    </span>
  );
  return owner.profileSlug ? <Link href={`/pro/${owner.profileSlug}`}>{content}</Link> : content;
}

export default function LeadNetwork({ initialLeadId = "" }: { initialLeadId?: string }) {
  const [data, setData] = useState<NetworkPayload | null>(null);
  const [tab, setTab] = useState<Tab>(initialLeadId ? "owned" : "available");
  const [showPublish, setShowPublish] = useState(Boolean(initialLeadId));
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const load = useCallback(async () => {
    const response = await fetch("/api/network", { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Unable to load lead network.");
    setData(payload);
  }, []);

  useEffect(() => {
    load().catch((error) => {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Unable to load lead network." });
    });
  }, [load]);

  const selectedLead = useMemo(
    () => data?.eligibleLeads.find((lead) => lead.id === initialLeadId) ?? null,
    [data, initialLeadId]
  );

  async function mutate(key: string, url: string, options: RequestInit, successText: string) {
    setBusy(key);
    setNotice(null);
    try {
      const response = await fetch(url, {
        ...options,
        headers: { "Content-Type": "application/json", ...(options.headers ?? {}) },
      });
      const payload = await response.json();
      if (!response.ok) {
        const details = Array.isArray(payload.details) ? payload.details.join(" ") : payload.error;
        throw new Error(details || "Action failed.");
      }
      await load();
      setNotice({ type: "success", text: successText });
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Action failed." });
    } finally {
      setBusy("");
    }
  }

  async function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await mutate(
      "publish",
      "/api/network",
      {
        method: "POST",
        body: JSON.stringify({
          ...Object.fromEntries(form.entries()),
          exclusive: form.get("exclusive") === "on",
        }),
      },
      "Lead published to the contractor network."
    );
    setShowPublish(false);
  }

  if (!data) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading contractor network...
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-24 md:pb-8">
      <section className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <Store className="h-5 w-5 text-orange-600" />
          <div className="mt-3 text-3xl font-black">{data.available.length}</div>
          <div className="text-sm text-slate-500">Open leads from other contractors</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <Send className="h-5 w-5 text-blue-600" />
          <div className="mt-3 text-3xl font-black">{data.owned.length}</div>
          <div className="text-sm text-slate-500">Listings published by your company</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <LockKeyhole className="h-5 w-5 text-emerald-600" />
          <div className="mt-3 text-3xl font-black">{data.myClaims.length}</div>
          <div className="text-sm text-slate-500">Lead requests made by your company</div>
        </div>
      </section>

      {!data.tenant?.contractorProfile || data.tenant.contractorProfile.profileStatus !== "PUBLISHED" ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          <div className="flex gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="font-black">Publish your contractor profile before actively trading leads.</p>
              <p className="mt-1 leading-6">
                The network still loads, but other businesses need a visible company identity and service area before trusting a request.
              </p>
              <Link href="/settings/profile" className="mt-3 inline-block font-black underline">
                Complete directory profile
              </Link>
            </div>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex rounded-xl bg-slate-100 p-1">
          {[
            ["available", `Available (${data.available.length})`],
            ["owned", `My listings (${data.owned.length})`],
            ["claims", `My requests (${data.myClaims.length})`],
          ].map(([value, label]) => (
            <button
              key={value}
              onClick={() => setTab(value as Tab)}
              className={`rounded-lg px-3 py-2 text-sm font-bold ${tab === value ? "bg-white text-slate-950 shadow-sm" : "text-slate-500"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => load()}
            className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-600"
          >
            <RefreshCw className="mr-2 h-4 w-4" /> Refresh
          </button>
          <button
            onClick={() => {
              setShowPublish((current) => !current);
              setTab("owned");
            }}
            className="inline-flex items-center rounded-xl bg-orange-500 px-4 py-2 text-sm font-black text-white hover:bg-orange-600"
          >
            <Plus className="mr-2 h-4 w-4" /> Send lead to network
          </button>
        </div>
      </div>

      {notice && (
        <div className={`rounded-xl border p-4 text-sm font-semibold ${notice.type === "error" ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
          {notice.text}
        </div>
      )}

      {showPublish && (
        <form onSubmit={publish} className="rounded-3xl border border-orange-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-black">Publish an overflow lead</h2>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                Only the summary, service and geography are visible before approval. Customer contacts remain private.
              </p>
            </div>
            <button type="button" onClick={() => setShowPublish(false)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <label className="sm:col-span-2">
              <span className="text-sm font-bold">CRM lead</span>
              <select name="leadId" required defaultValue={selectedLead?.id ?? ""} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-3 text-sm">
                <option value="" disabled>Select an eligible lead</option>
                {data.eligibleLeads.map((lead) => (
                  <option key={lead.id} value={lead.id}>
                    {lead.name} · {lead.jobType || "General work"} · {lead.city || "No city"}
                  </option>
                ))}
              </select>
              {data.eligibleLeads.length === 0 && <span className="mt-1 block text-xs text-amber-700">No unlisted active leads are available.</span>}
            </label>
            <label className="sm:col-span-2">
              <span className="text-sm font-bold">Listing title</span>
              <input name="title" required minLength={5} maxLength={140} defaultValue={selectedLead?.jobType ? `${selectedLead.jobType} lead in ${selectedLead.city || "local area"}` : ""} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-3 text-sm" />
            </label>
            <label className="sm:col-span-2">
              <span className="text-sm font-bold">Public summary</span>
              <textarea name="summary" required minLength={20} maxLength={2000} rows={5} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-3 text-sm" placeholder="Describe the work, approximate scope, timing and qualification. Do not paste customer contact details." />
            </label>
            <label>
              <span className="text-sm font-bold">Service</span>
              <select name="serviceSlug" required className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-3 text-sm">
                <option value="" disabled>Select service</option>
                {SERVICE_CATALOG.map((service) => <option key={service.slug} value={service.slug}>{service.name}</option>)}
              </select>
            </label>
            <label>
              <span className="text-sm font-bold">Province</span>
              <input name="province" required placeholder="Ontario" className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-3 text-sm" />
            </label>
            <label>
              <span className="text-sm font-bold">City</span>
              <input name="city" required defaultValue={selectedLead?.city ?? ""} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-3 text-sm" />
            </label>
            <label>
              <span className="text-sm font-bold">Unlock price, credits</span>
              <input name="contactUnlockPriceCredits" type="number" min="0" max="25" defaultValue="1" className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-3 text-sm" />
            </label>
            <label>
              <span className="text-sm font-bold">Budget from, CAD</span>
              <input name="budgetMin" type="number" min="0" step="50" className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-3 text-sm" />
            </label>
            <label>
              <span className="text-sm font-bold">Budget to, CAD</span>
              <input name="budgetMax" type="number" min="0" step="50" className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-3 text-sm" />
            </label>
            <label>
              <span className="text-sm font-bold">Maximum claimants</span>
              <input name="maxClaims" type="number" min="1" max="5" defaultValue="3" className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-3 text-sm" />
            </label>
            <label>
              <span className="text-sm font-bold">Expires in days</span>
              <input name="expiresInDays" type="number" min="1" max="30" defaultValue="7" className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-3 text-sm" />
            </label>
            <label className="flex items-center gap-3 rounded-xl bg-slate-50 p-4 sm:col-span-2">
              <input name="exclusive" type="checkbox" className="h-4 w-4" />
              <span>
                <strong className="block text-sm">Exclusive lead</strong>
                <span className="text-xs text-slate-500">Only one contractor may be approved.</span>
              </span>
            </label>
          </div>

          <button disabled={busy === "publish" || data.eligibleLeads.length === 0} className="mt-5 inline-flex items-center rounded-xl bg-slate-950 px-5 py-3 text-sm font-black text-white disabled:opacity-50">
            {busy === "publish" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
            Publish lead
          </button>
        </form>
      )}

      {tab === "available" && (
        <section className="grid gap-5 lg:grid-cols-2">
          {data.available.length === 0 ? (
            <EmptyState title="No open network leads" text="New overflow leads from other contractors will appear here." />
          ) : data.available.map((listing) => (
            <article key={listing.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-black">{listing.title}</h2>
                    {listing.exclusive && <span className="rounded-full bg-violet-50 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-violet-700">Exclusive</span>}
                  </div>
                  <div className="mt-1 text-sm"><OwnerName owner={listing.owner} /></div>
                </div>
                {listing.myClaim && <StatusBadge status={listing.myClaim.status} />}
              </div>
              <p className="mt-4 line-clamp-4 text-sm leading-6 text-slate-600">{listing.summary}</p>
              <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs font-semibold text-slate-500">
                <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{listing.city}, {listing.province}</span>
                <span>{titleFromSlug(listing.serviceSlug)}</span>
                <span>{formatMoney(listing.budgetMin, listing.budgetMax)}</span>
                <span>{listing.claimCount}/{listing.maxClaims} requests</span>
              </div>
              <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4">
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600"><CircleDollarSign className="h-4 w-4 text-orange-500" />{listing.contactUnlockPriceCredits} credit{listing.contactUnlockPriceCredits === 1 ? "" : "s"} after approval</span>
                <button
                  disabled={Boolean(listing.myClaim) || busy === `claim-${listing.id}`}
                  onClick={() => mutate(`claim-${listing.id}`, "/api/network/claims", { method: "POST", body: JSON.stringify({ listingId: listing.id }) }, "Lead request sent to the owner.")}
                  className="rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-black text-white disabled:bg-slate-200 disabled:text-slate-500"
                >
                  {listing.myClaim ? "Requested" : "Request lead"}
                </button>
              </div>
            </article>
          ))}
        </section>
      )}

      {tab === "owned" && (
        <section className="space-y-5">
          {data.owned.length === 0 ? (
            <EmptyState title="No published overflow leads" text="Select an active CRM lead and send it to the network instead of rejecting it." />
          ) : data.owned.map((listing) => (
            <article key={listing.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-black">{listing.title}</h2><StatusBadge status={listing.status} /></div>
                  <p className="mt-1 text-sm text-slate-500">CRM lead: <Link href={`/leads/${listing.lead.id}`} className="font-bold text-slate-800 underline">{listing.lead.name}</Link></p>
                </div>
                <button
                  onClick={() => mutate(`listing-${listing.id}`, `/api/network/listings/${listing.id}`, { method: "PATCH", body: JSON.stringify({ action: listing.status === "CLOSED" ? "REOPEN" : "CLOSE" }) }, listing.status === "CLOSED" ? "Listing reopened." : "Listing closed.")}
                  className="inline-flex items-center rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold"
                >
                  {listing.status === "CLOSED" ? <RotateCcw className="mr-1.5 h-4 w-4" /> : <X className="mr-1.5 h-4 w-4" />}
                  {listing.status === "CLOSED" ? "Reopen" : "Close"}
                </button>
              </div>
              <p className="mt-4 text-sm leading-6 text-slate-600">{listing.summary}</p>
              <div className="mt-5 border-t border-slate-100 pt-5">
                <h3 className="text-sm font-black">Requests ({listing.claims.length})</h3>
                {listing.claims.length === 0 ? <p className="mt-3 text-sm text-slate-500">No contractors have requested this lead.</p> : (
                  <div className="mt-3 space-y-3">
                    {listing.claims.map((claim) => (
                      <div key={claim.id} className="flex flex-col justify-between gap-3 rounded-xl bg-slate-50 p-4 sm:flex-row sm:items-center">
                        <div><OwnerName owner={claim.claimant} /><div className="mt-1"><StatusBadge status={claim.status} /></div></div>
                        <div className="flex flex-wrap gap-2">
                          {claim.status === "REQUESTED" && <>
                            <button onClick={() => mutate(`claim-${claim.id}`, `/api/network/claims/${claim.id}`, { method: "PATCH", body: JSON.stringify({ action: "APPROVE" }) }, "Contractor approved.")} className="inline-flex items-center rounded-lg bg-emerald-600 px-3 py-2 text-xs font-black text-white"><Check className="mr-1 h-3.5 w-3.5" />Approve</button>
                            <button onClick={() => mutate(`claim-${claim.id}`, `/api/network/claims/${claim.id}`, { method: "PATCH", body: JSON.stringify({ action: "REJECT" }) }, "Request rejected.")} className="inline-flex items-center rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-black text-red-700"><X className="mr-1 h-3.5 w-3.5" />Reject</button>
                          </>}
                          {["CONTACT_UNLOCKED", "WON", "LOST"].includes(claim.status) && <button onClick={() => mutate(`claim-${claim.id}`, `/api/network/claims/${claim.id}`, { method: "PATCH", body: JSON.stringify({ action: "REFUND" }) }, "Claim credits refunded in the exchange record.")} className="inline-flex items-center rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs font-black text-blue-700"><RotateCcw className="mr-1 h-3.5 w-3.5" />Refund</button>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </article>
          ))}
        </section>
      )}

      {tab === "claims" && (
        <section className="space-y-5">
          {data.myClaims.length === 0 ? (
            <EmptyState title="No requested leads" text="Request a relevant network lead and the owner will approve or reject access." />
          ) : data.myClaims.map((claim) => (
            <article key={claim.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><h2 className="text-lg font-black">{claim.listing.title}</h2><div className="mt-1 text-sm"><OwnerName owner={claim.listing.owner} /></div></div>
                <StatusBadge status={claim.status} />
              </div>
              <p className="mt-4 text-sm leading-6 text-slate-600">{claim.listing.summary}</p>
              <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs font-semibold text-slate-500"><span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{claim.listing.city}, {claim.listing.province}</span><span>{formatMoney(claim.listing.budgetMin, claim.listing.budgetMax)}</span></div>
              {claim.listing.contact && (
                <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
                  <div className="flex items-center gap-2 font-black"><Eye className="h-4 w-4" />Unlocked customer contact</div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2"><p><strong>Name:</strong> {claim.listing.contact.name}</p><p><strong>Phone:</strong> {claim.listing.contact.phone || "—"}</p><p><strong>Email:</strong> {claim.listing.contact.email || "—"}</p><p><strong>Address:</strong> {claim.listing.contact.address || "—"}</p></div>
                  {claim.listing.contact.notes && <p className="mt-3 whitespace-pre-line leading-6"><strong>CRM notes:</strong> {claim.listing.contact.notes}</p>}
                </div>
              )}
              <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
                {claim.status === "APPROVED" && <button onClick={() => mutate(`claim-${claim.id}`, `/api/network/claims/${claim.id}`, { method: "PATCH", body: JSON.stringify({ action: "UNLOCK" }) }, "Customer contact unlocked.")} className="inline-flex items-center rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-black text-white"><LockKeyhole className="mr-2 h-4 w-4" />Unlock for {claim.listing.contactUnlockPriceCredits} credit{claim.listing.contactUnlockPriceCredits === 1 ? "" : "s"}</button>}
                {claim.status === "CONTACT_UNLOCKED" && <><button onClick={() => mutate(`claim-${claim.id}`, `/api/network/claims/${claim.id}`, { method: "PATCH", body: JSON.stringify({ action: "WON" }) }, "Lead marked as won.")} className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-black text-white">Mark won</button><button onClick={() => mutate(`claim-${claim.id}`, `/api/network/claims/${claim.id}`, { method: "PATCH", body: JSON.stringify({ action: "LOST" }) }, "Lead marked as lost.")} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-black">Mark lost</button></>}
              </div>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center lg:col-span-2">
      <Clock3 className="mx-auto h-10 w-10 text-slate-300" />
      <h2 className="mt-4 text-xl font-black">{title}</h2>
      <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-500">{text}</p>
    </div>
  );
}
