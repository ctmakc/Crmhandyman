"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  BriefcaseBusiness,
  CalendarDays,
  ExternalLink,
  Loader2,
  MapPin,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";
import { titleFromSlug } from "@/lib/marketplace-config";

type Vacancy = {
  id: string;
  slug: string;
  title: string;
  description: string;
  serviceSlug: string;
  employmentType: string;
  city: string;
  province: string;
  compensationMin: number | null;
  compensationMax: number | null;
  compensationUnit: string;
  isRemote: boolean;
  status: string;
  validThrough: string | null;
  createdAt: string;
};

type Profile = {
  id: string;
  slug: string;
  displayName: string;
  profileStatus: string;
  city: string;
  province: string;
  services: Array<{ slug: string; name: string }>;
  vacancies: Vacancy[];
};

type Payload = { profile: Profile | null };

type Notice = { type: "success" | "error"; text: string };

const EMPLOYMENT_TYPES = [
  ["FULL_TIME", "Full time"],
  ["PART_TIME", "Part time"],
  ["CONTRACT", "Contract"],
  ["TEMPORARY", "Temporary"],
  ["GIG", "Gig / day work"],
  ["SUBCONTRACT", "Subcontract"],
] as const;

function statusClass(status: string) {
  if (status === "PUBLISHED") return "bg-emerald-50 text-emerald-700";
  if (status === "PAUSED") return "bg-amber-50 text-amber-700";
  if (status === "CLOSED" || status === "EXPIRED") return "bg-red-50 text-red-700";
  return "bg-slate-100 text-slate-600";
}

function formatCompensation(vacancy: Vacancy) {
  const unit = vacancy.compensationUnit.toLowerCase();
  const min = vacancy.compensationMin;
  const max = vacancy.compensationMax;

  if (min == null && max == null) return "Compensation not disclosed";
  if (min != null && max != null) {
    return `$${Math.round(min).toLocaleString("en-CA")}–$${Math.round(max).toLocaleString("en-CA")} / ${unit}`;
  }
  if (min != null) return `From $${Math.round(min).toLocaleString("en-CA")} / ${unit}`;
  return `Up to $${Math.round(max ?? 0).toLocaleString("en-CA")} / ${unit}`;
}

export default function RecruitingManager() {
  const [data, setData] = useState<Payload | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);

  const load = useCallback(async () => {
    const response = await fetch("/api/recruiting/vacancies", { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Unable to load vacancies.");
    setData(payload);
  }, []);

  useEffect(() => {
    load().catch((error) => {
      setNotice({
        type: "error",
        text: error instanceof Error ? error.message : "Unable to load vacancies.",
      });
    });
  }, [load]);

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
      return true;
    } catch (error) {
      setNotice({
        type: "error",
        text: error instanceof Error ? error.message : "Action failed.",
      });
      return false;
    } finally {
      setBusy("");
    }
  }

  async function createVacancy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const created = await mutate(
      "create",
      "/api/recruiting/vacancies",
      {
        method: "POST",
        body: JSON.stringify({
          ...Object.fromEntries(form.entries()),
          isRemote: form.get("isRemote") === "on",
        }),
      },
      "Vacancy created."
    );
    if (created) setShowForm(false);
  }

  if (!data) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading recruiting workspace...
      </div>
    );
  }

  const profile = data.profile;
  const vacancies = profile?.vacancies ?? [];

  if (!profile) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-900">
        <h2 className="font-black">Contractor profile required</h2>
        <p className="mt-2 text-sm leading-6">
          Vacancies need a company identity, services and location before they can be published.
        </p>
        <Link
          href="/settings/profile"
          className="mt-4 inline-flex rounded-xl bg-amber-900 px-4 py-2.5 text-sm font-black text-white"
        >
          Create directory profile
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-24 md:pb-8">
      <section className="grid gap-4 sm:grid-cols-4">
        {[
          ["All", vacancies.length],
          ["Published", vacancies.filter((item) => item.status === "PUBLISHED").length],
          ["Drafts", vacancies.filter((item) => item.status === "DRAFT").length],
          [
            "Paused / closed",
            vacancies.filter((item) => ["PAUSED", "CLOSED", "EXPIRED"].includes(item.status))
              .length,
          ],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-3xl font-black">{value}</div>
            <div className="mt-1 text-sm text-slate-500">{label}</div>
          </div>
        ))}
      </section>

      {profile.profileStatus !== "PUBLISHED" && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          You can draft vacancies now, but publishing requires a published contractor profile.{" "}
          <Link href="/settings/profile" className="font-black underline">
            Open profile settings
          </Link>
          .
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-black">Company vacancies</h2>
          <p className="mt-1 text-sm text-slate-500">
            Published records appear automatically in the public jobs index.
          </p>
        </div>
        <button
          onClick={() => setShowForm((current) => !current)}
          className="inline-flex items-center rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-black text-white hover:bg-orange-600"
        >
          <Plus className="mr-2 h-4 w-4" />
          New vacancy
        </button>
      </div>

      {notice && (
        <div
          className={`rounded-xl border p-4 text-sm font-semibold ${
            notice.type === "error"
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-700"
          }`}
        >
          {notice.text}
        </div>
      )}

      {showForm && (
        <form
          onSubmit={createVacancy}
          className="rounded-3xl border border-orange-200 bg-white p-5 shadow-sm sm:p-6"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-black">Create vacancy</h2>
              <p className="mt-1 text-sm text-slate-500">
                Use permanent, contract, gig or subcontract format.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <label className="sm:col-span-2">
              <span className="text-sm font-bold">Job title</span>
              <input
                name="title"
                required
                minLength={5}
                maxLength={140}
                className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-3 text-sm"
                placeholder="Renovation Technician"
              />
            </label>
            <label>
              <span className="text-sm font-bold">Trade</span>
              <select
                name="serviceSlug"
                required
                defaultValue=""
                className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-3 text-sm"
              >
                <option value="" disabled>
                  Select trade
                </option>
                {profile.services.map((service) => (
                  <option key={service.slug} value={service.slug}>
                    {service.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="text-sm font-bold">Employment type</span>
              <select
                name="employmentType"
                defaultValue="FULL_TIME"
                className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-3 text-sm"
              >
                {EMPLOYMENT_TYPES.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="sm:col-span-2">
              <span className="text-sm font-bold">Description</span>
              <textarea
                name="description"
                required
                minLength={40}
                maxLength={6000}
                rows={8}
                className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-3 text-sm"
                placeholder="Responsibilities, required skills, tools, vehicle requirements, schedule and working conditions."
              />
            </label>
            <label>
              <span className="text-sm font-bold">City</span>
              <input
                name="city"
                defaultValue={profile.city}
                className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-3 text-sm"
              />
            </label>
            <label>
              <span className="text-sm font-bold">Province</span>
              <input
                name="province"
                defaultValue={profile.province}
                className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-3 text-sm"
              />
            </label>
            <label>
              <span className="text-sm font-bold">Compensation from</span>
              <input
                name="compensationMin"
                type="number"
                min="0"
                step="1"
                className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-3 text-sm"
              />
            </label>
            <label>
              <span className="text-sm font-bold">Compensation to</span>
              <input
                name="compensationMax"
                type="number"
                min="0"
                step="1"
                className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-3 text-sm"
              />
            </label>
            <label>
              <span className="text-sm font-bold">Compensation unit</span>
              <select
                name="compensationUnit"
                defaultValue="HOUR"
                className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-3 text-sm"
              >
                <option value="HOUR">Hour</option>
                <option value="DAY">Day</option>
                <option value="PROJECT">Project</option>
                <option value="YEAR">Year</option>
              </select>
            </label>
            <label>
              <span className="text-sm font-bold">Closing date</span>
              <input
                name="validThrough"
                type="date"
                className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-3 text-sm"
              />
            </label>
            <label className="flex items-center gap-3 rounded-xl bg-slate-50 p-4">
              <input name="isRemote" type="checkbox" className="h-4 w-4" />
              <span className="text-sm font-bold">Remote-compatible</span>
            </label>
            <label>
              <span className="text-sm font-bold">Initial status</span>
              <select
                name="status"
                defaultValue="DRAFT"
                className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-3 text-sm"
              >
                <option value="DRAFT">Save draft</option>
                <option value="PUBLISHED" disabled={profile.profileStatus !== "PUBLISHED"}>
                  Publish immediately
                </option>
              </select>
            </label>
          </div>

          <button
            disabled={busy === "create" || profile.services.length === 0}
            className="mt-5 inline-flex items-center rounded-xl bg-slate-950 px-5 py-3 text-sm font-black text-white disabled:opacity-50"
          >
            {busy === "create" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create vacancy
          </button>
        </form>
      )}

      <section className="space-y-4">
        {vacancies.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center">
            <BriefcaseBusiness className="mx-auto h-10 w-10 text-slate-300" />
            <h2 className="mt-4 text-xl font-black">No vacancies yet</h2>
            <p className="mt-2 text-sm text-slate-500">
              Create a permanent role, short gig or subcontract request.
            </p>
          </div>
        ) : (
          vacancies.map((vacancy) => (
            <article
              key={vacancy.id}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div className="flex flex-col justify-between gap-5 lg:flex-row">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-lg font-black">{vacancy.title}</h3>
                    <span
                      className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${statusClass(
                        vacancy.status
                      )}`}
                    >
                      {vacancy.status}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-xs font-semibold text-slate-500">
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5" />
                      {vacancy.city}, {vacancy.province}
                    </span>
                    <span>{titleFromSlug(vacancy.employmentType.toLowerCase())}</span>
                    <span>{titleFromSlug(vacancy.serviceSlug)}</span>
                    <span>{formatCompensation(vacancy)}</span>
                    {vacancy.validThrough && (
                      <span className="inline-flex items-center gap-1">
                        <CalendarDays className="h-3.5 w-3.5" />
                        Closes {new Date(vacancy.validThrough).toLocaleDateString("en-CA")}
                      </span>
                    )}
                  </div>
                  <p className="mt-3 line-clamp-3 text-sm leading-6 text-slate-600">
                    {vacancy.description}
                  </p>
                </div>

                <VacancyActions vacancy={vacancy} busy={busy} mutate={mutate} />
              </div>
            </article>
          ))
        )}
      </section>
    </div>
  );
}

function VacancyActions({
  vacancy,
  busy,
  mutate,
}: {
  vacancy: Vacancy;
  busy: string;
  mutate: (
    key: string,
    url: string,
    options: RequestInit,
    successText: string
  ) => Promise<boolean>;
}) {
  const key = `vacancy-${vacancy.id}`;
  const disabled = busy === key || busy === `delete-${vacancy.id}`;

  return (
    <div className="flex shrink-0 flex-wrap items-start gap-2 lg:max-w-60 lg:justify-end">
      {vacancy.status === "PUBLISHED" && (
        <Link
          href={`/jobs/${vacancy.slug}`}
          target="_blank"
          className="inline-flex items-center rounded-lg border border-slate-200 px-3 py-2 text-xs font-black"
        >
          <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
          Public page
        </Link>
      )}
      {["DRAFT", "PAUSED"].includes(vacancy.status) && (
        <button
          disabled={disabled}
          onClick={() =>
            mutate(
              key,
              `/api/recruiting/vacancies/${vacancy.id}`,
              { method: "PATCH", body: JSON.stringify({ action: "PUBLISH" }) },
              "Vacancy published."
            )
          }
          className="inline-flex items-center rounded-lg bg-emerald-600 px-3 py-2 text-xs font-black text-white disabled:opacity-50"
        >
          <Play className="mr-1.5 h-3.5 w-3.5" />
          Publish
        </button>
      )}
      {vacancy.status === "PUBLISHED" && (
        <button
          disabled={disabled}
          onClick={() =>
            mutate(
              key,
              `/api/recruiting/vacancies/${vacancy.id}`,
              { method: "PATCH", body: JSON.stringify({ action: "PAUSE" }) },
              "Vacancy paused."
            )
          }
          className="inline-flex items-center rounded-lg border border-amber-200 px-3 py-2 text-xs font-black text-amber-700 disabled:opacity-50"
        >
          <Pause className="mr-1.5 h-3.5 w-3.5" />
          Pause
        </button>
      )}
      {["PUBLISHED", "PAUSED"].includes(vacancy.status) && (
        <button
          disabled={disabled}
          onClick={() =>
            mutate(
              key,
              `/api/recruiting/vacancies/${vacancy.id}`,
              { method: "PATCH", body: JSON.stringify({ action: "CLOSE" }) },
              "Vacancy closed."
            )
          }
          className="inline-flex items-center rounded-lg border border-red-200 px-3 py-2 text-xs font-black text-red-700 disabled:opacity-50"
        >
          <X className="mr-1.5 h-3.5 w-3.5" />
          Close
        </button>
      )}
      {vacancy.status === "CLOSED" && (
        <button
          disabled={disabled}
          onClick={() =>
            mutate(
              key,
              `/api/recruiting/vacancies/${vacancy.id}`,
              { method: "PATCH", body: JSON.stringify({ action: "REOPEN" }) },
              "Vacancy returned to draft."
            )
          }
          className="inline-flex items-center rounded-lg border border-blue-200 px-3 py-2 text-xs font-black text-blue-700 disabled:opacity-50"
        >
          <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
          Reopen
        </button>
      )}
      {vacancy.status !== "PUBLISHED" && (
        <button
          disabled={disabled}
          onClick={() =>
            mutate(
              `delete-${vacancy.id}`,
              `/api/recruiting/vacancies/${vacancy.id}`,
              { method: "DELETE" },
              "Vacancy deleted."
            )
          }
          className="inline-flex items-center rounded-lg border border-slate-200 px-3 py-2 text-xs font-black text-slate-500 disabled:opacity-50"
        >
          <Trash2 className="mr-1.5 h-3.5 w-3.5" />
          Delete
        </button>
      )}
    </div>
  );
}
