"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  BadgeCheck,
  Check,
  ExternalLink,
  Loader2,
  Mail,
  MapPin,
  Phone,
  Search,
  UserRoundSearch,
  X,
} from "lucide-react";
import { titleFromSlug } from "@/lib/marketplace-config";

type Application = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  city: string | null;
  address: string | null;
  jobType: string | null;
  notes: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  vacancy: {
    id: string;
    slug: string;
    title: string;
    status: string;
  } | null;
};

type Payload = {
  data: Application[];
  meta: {
    count: number;
    statuses: {
      new: number;
      contacted: number;
      shortlisted: number;
      rejected: number;
    };
  };
};

function statusClass(status: string) {
  if (status === "VERIFIED") return "bg-emerald-50 text-emerald-700";
  if (status === "CONTACTED") return "bg-blue-50 text-blue-700";
  if (status === "REJECTED") return "bg-red-50 text-red-700";
  return "bg-amber-50 text-amber-700";
}

function statusLabel(status: string) {
  if (status === "VERIFIED") return "Shortlisted";
  if (status === "CONTACTED") return "Contacted";
  if (status === "REJECTED") return "Rejected";
  return "New";
}

export default function ApplicationsManager() {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async (nextQuery = query, nextStatus = status) => {
    const params = new URLSearchParams();
    if (nextQuery.trim()) params.set("q", nextQuery.trim());
    if (nextStatus) params.set("status", nextStatus);

    const response = await fetch(`/api/recruiting/applications?${params.toString()}`, {
      cache: "no-store",
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Unable to load applications.");
    setPayload(result);
  }, [query, status]);

  useEffect(() => {
    load().catch((reason) => {
      setError(reason instanceof Error ? reason.message : "Unable to load applications.");
    });
  }, [load]);

  async function search(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      await load(query, status);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to search applications.");
    }
  }

  async function changeStatus(application: Application, nextStatus: string) {
    setBusy(application.id);
    setError("");
    try {
      const response = await fetch(`/api/leads/${application.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...application, status: nextStatus }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to update candidate status.");
      await load(query, status);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to update candidate status.");
    } finally {
      setBusy("");
    }
  }

  if (!payload) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading applications...
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-24 md:pb-8">
      <section className="grid gap-4 sm:grid-cols-4">
        {[
          ["New", payload.meta.statuses.new],
          ["Contacted", payload.meta.statuses.contacted],
          ["Shortlisted", payload.meta.statuses.shortlisted],
          ["Rejected", payload.meta.statuses.rejected],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-3xl font-black">{value}</div>
            <div className="mt-1 text-sm text-slate-500">{label}</div>
          </div>
        ))}
      </section>

      <form
        onSubmit={search}
        className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-[1fr_200px_auto]"
      >
        <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3">
          <Search className="h-4 w-4 text-slate-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="w-full bg-transparent py-3 text-sm outline-none"
            placeholder="Name, skill, city, vacancy, experience..."
          />
        </label>
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm"
        >
          <option value="">All statuses</option>
          <option value="NEW">New</option>
          <option value="CONTACTED">Contacted</option>
          <option value="VERIFIED">Shortlisted</option>
          <option value="REJECTED">Rejected</option>
        </select>
        <button className="rounded-xl bg-slate-950 px-5 py-3 text-sm font-black text-white">
          Search candidates
        </button>
      </form>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
          {error}
        </div>
      )}

      {payload.data.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <UserRoundSearch className="mx-auto h-10 w-10 text-slate-300" />
          <h2 className="mt-4 text-xl font-black">No matching applications</h2>
          <p className="mt-2 text-sm text-slate-500">
            New public job applications will appear here and in the normal lead pipeline.
          </p>
        </div>
      ) : (
        <section className="space-y-4">
          {payload.data.map((application) => (
            <article
              key={application.id}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div className="flex flex-col justify-between gap-5 lg:flex-row">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-black">{application.name}</h2>
                    <span
                      className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${statusClass(
                        application.status
                      )}`}
                    >
                      {statusLabel(application.status)}
                    </span>
                  </div>

                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-xs font-semibold text-slate-500">
                    {application.email && (
                      <a href={`mailto:${application.email}`} className="inline-flex items-center gap-1 hover:text-slate-900">
                        <Mail className="h-3.5 w-3.5" />
                        {application.email}
                      </a>
                    )}
                    {application.phone && (
                      <a href={`tel:${application.phone}`} className="inline-flex items-center gap-1 hover:text-slate-900">
                        <Phone className="h-3.5 w-3.5" />
                        {application.phone}
                      </a>
                    )}
                    {(application.city || application.address) && (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5" />
                        {application.city || application.address}
                      </span>
                    )}
                    <span>Applied {new Date(application.createdAt).toLocaleDateString("en-CA")}</span>
                  </div>

                  {application.vacancy && (
                    <div className="mt-3 text-sm text-slate-600">
                      Vacancy:{" "}
                      <Link
                        href={`/jobs/${application.vacancy.slug}`}
                        target="_blank"
                        className="inline-flex items-center font-bold text-blue-700"
                      >
                        {application.vacancy.title}
                        <ExternalLink className="ml-1 h-3.5 w-3.5" />
                      </Link>
                    </div>
                  )}

                  {application.notes && (
                    <pre className="mt-4 max-h-64 overflow-auto whitespace-pre-wrap rounded-xl bg-slate-50 p-4 font-sans text-sm leading-6 text-slate-600">
                      {application.notes}
                    </pre>
                  )}
                </div>

                <div className="flex shrink-0 flex-wrap items-start gap-2 lg:max-w-52 lg:justify-end">
                  <Link
                    href={`/leads/${application.id}`}
                    className="inline-flex items-center rounded-lg border border-slate-200 px-3 py-2 text-xs font-black text-slate-700"
                  >
                    Full record
                    <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
                  </Link>
                  {application.status !== "CONTACTED" && (
                    <button
                      disabled={busy === application.id}
                      onClick={() => changeStatus(application, "CONTACTED")}
                      className="inline-flex items-center rounded-lg border border-blue-200 px-3 py-2 text-xs font-black text-blue-700 disabled:opacity-50"
                    >
                      <Phone className="mr-1.5 h-3.5 w-3.5" />
                      Contacted
                    </button>
                  )}
                  {application.status !== "VERIFIED" && (
                    <button
                      disabled={busy === application.id}
                      onClick={() => changeStatus(application, "VERIFIED")}
                      className="inline-flex items-center rounded-lg bg-emerald-600 px-3 py-2 text-xs font-black text-white disabled:opacity-50"
                    >
                      <BadgeCheck className="mr-1.5 h-3.5 w-3.5" />
                      Shortlist
                    </button>
                  )}
                  {application.status !== "REJECTED" && (
                    <button
                      disabled={busy === application.id}
                      onClick={() => changeStatus(application, "REJECTED")}
                      className="inline-flex items-center rounded-lg border border-red-200 px-3 py-2 text-xs font-black text-red-700 disabled:opacity-50"
                    >
                      <X className="mr-1.5 h-3.5 w-3.5" />
                      Reject
                    </button>
                  )}
                  {application.status === "REJECTED" && (
                    <button
                      disabled={busy === application.id}
                      onClick={() => changeStatus(application, "NEW")}
                      className="inline-flex items-center rounded-lg border border-slate-200 px-3 py-2 text-xs font-black text-slate-700 disabled:opacity-50"
                    >
                      <Check className="mr-1.5 h-3.5 w-3.5" />
                      Restore
                    </button>
                  )}
                </div>
              </div>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
