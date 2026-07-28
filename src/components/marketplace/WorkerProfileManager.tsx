"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { CheckCircle2, EyeOff, Loader2, Save } from "lucide-react";

const EMPLOYMENT_TYPES = [
  ["FULL_TIME", "Full time"],
  ["PART_TIME", "Part time"],
  ["CONTRACT", "Contract"],
  ["TEMPORARY", "Temporary"],
  ["GIG", "Gig / day work"],
  ["SUBCONTRACT", "Subcontract"],
] as const;

type Profile = {
  slug: string;
  email: string;
  fullName: string;
  publicName: string;
  phone: string | null;
  city: string;
  province: string;
  headline: string;
  summary: string;
  yearsExperience: number | null;
  employmentTypes: string[];
  hourlyRateMin: number | null;
  hourlyRateMax: number | null;
  hasVehicle: boolean;
  hasTools: boolean;
  languages: string;
  availability: string | null;
  resumeUrl: string | null;
  consentToContact: boolean;
  consentToPublic: boolean;
  profileStatus: string;
  skills: Array<{ name: string }>;
};

export default function WorkerProfileManager({
  token,
  profile,
}: {
  token: string;
  profile: Profile;
}) {
  const [state, setState] = useState<"idle" | "saving" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState(profile.profileStatus);

  async function mutate(action: "PUBLISH" | "HIDE", form?: HTMLFormElement) {
    setState("saving");
    setMessage("");

    const formData = form ? new FormData(form) : new FormData();
    const payload = {
      ...Object.fromEntries(formData.entries()),
      token,
      action,
      hasVehicle: formData.get("hasVehicle") === "on",
      hasTools: formData.get("hasTools") === "on",
      consentToContact: formData.get("consentToContact") === "on",
      consentToPublic: formData.get("consentToPublic") === "on",
      employmentTypes: formData.getAll("employmentTypes"),
    };

    try {
      const response = await fetch("/api/public/workers/manage", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) {
        const details = Array.isArray(result.details) ? result.details.join(" ") : result.error;
        throw new Error(details || "Unable to update worker profile.");
      }
      setStatus(result.profile.status);
      setMessage(result.message);
      setState("success");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update worker profile.");
      setState("error");
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await mutate("PUBLISH", event.currentTarget);
  }

  const inputClass =
    "mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100";

  return (
    <form onSubmit={submit} className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-black">Manage worker profile</h1>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Private fields are used for applications and introductions. Only explicitly marked
              public fields appear in the worker directory.
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black uppercase tracking-wider text-slate-600">
            {status}
          </span>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <label>
            <span className="text-sm font-bold">Private full name</span>
            <input
              name="fullName"
              required
              defaultValue={profile.fullName}
              maxLength={120}
              className={inputClass}
            />
          </label>
          <label>
            <span className="text-sm font-bold">Private email</span>
            <input value={profile.email} readOnly className={`${inputClass} bg-slate-50 text-slate-500`} />
          </label>
          <label>
            <span className="text-sm font-bold">Private phone</span>
            <input
              name="phone"
              type="tel"
              defaultValue={profile.phone ?? ""}
              maxLength={40}
              className={inputClass}
            />
          </label>
          <label>
            <span className="text-sm font-bold">Private resume link</span>
            <input
              name="resumeUrl"
              type="url"
              defaultValue={profile.resumeUrl ?? ""}
              maxLength={500}
              className={inputClass}
            />
          </label>
        </div>
      </section>

      <section className="rounded-2xl border border-blue-200 bg-blue-50/40 p-5 shadow-sm sm:p-6">
        <h2 className="text-xl font-black text-blue-950">Public directory fields</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label>
            <span className="text-sm font-bold">Public name</span>
            <input
              name="publicName"
              required
              defaultValue={profile.publicName}
              maxLength={100}
              className={inputClass}
            />
          </label>
          <label>
            <span className="text-sm font-bold">Years of experience</span>
            <input
              name="yearsExperience"
              type="number"
              min="0"
              max="80"
              defaultValue={profile.yearsExperience ?? ""}
              className={inputClass}
            />
          </label>
          <label>
            <span className="text-sm font-bold">City</span>
            <input name="city" required defaultValue={profile.city} maxLength={100} className={inputClass} />
          </label>
          <label>
            <span className="text-sm font-bold">Province</span>
            <input
              name="province"
              required
              defaultValue={profile.province}
              maxLength={100}
              className={inputClass}
            />
          </label>
          <label className="sm:col-span-2">
            <span className="text-sm font-bold">Headline</span>
            <input
              name="headline"
              required
              defaultValue={profile.headline}
              minLength={5}
              maxLength={180}
              className={inputClass}
            />
          </label>
          <label className="sm:col-span-2">
            <span className="text-sm font-bold">Professional summary</span>
            <textarea
              name="summary"
              required
              defaultValue={profile.summary}
              minLength={20}
              maxLength={3000}
              rows={7}
              className={inputClass}
            />
          </label>
          <label className="sm:col-span-2">
            <span className="text-sm font-bold">Skills</span>
            <textarea
              name="skills"
              required
              defaultValue={profile.skills.map((skill) => skill.name).join("\n")}
              minLength={2}
              maxLength={1000}
              rows={5}
              className={inputClass}
            />
            <span className="mt-1 block text-xs text-slate-500">One skill per line or comma-separated.</span>
          </label>
          <label>
            <span className="text-sm font-bold">Hourly rate from, CAD</span>
            <input
              name="hourlyRateMin"
              type="number"
              min="0"
              max="1000"
              step="1"
              defaultValue={profile.hourlyRateMin ?? ""}
              className={inputClass}
            />
          </label>
          <label>
            <span className="text-sm font-bold">Hourly rate to, CAD</span>
            <input
              name="hourlyRateMax"
              type="number"
              min="0"
              max="1000"
              step="1"
              defaultValue={profile.hourlyRateMax ?? ""}
              className={inputClass}
            />
          </label>
          <label className="sm:col-span-2">
            <span className="text-sm font-bold">Languages</span>
            <input
              name="languages"
              defaultValue={profile.languages}
              maxLength={300}
              className={inputClass}
            />
          </label>
          <label className="sm:col-span-2">
            <span className="text-sm font-bold">Availability</span>
            <input
              name="availability"
              defaultValue={profile.availability ?? ""}
              maxLength={500}
              className={inputClass}
            />
          </label>
        </div>

        <fieldset className="mt-5">
          <legend className="text-sm font-bold">Preferred work types</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            {EMPLOYMENT_TYPES.map(([value, label]) => (
              <label
                key={value}
                className="flex items-center gap-2 rounded-lg border border-blue-200 bg-white p-3 text-xs font-bold text-slate-700"
              >
                <input
                  name="employmentTypes"
                  value={value}
                  type="checkbox"
                  defaultChecked={profile.employmentTypes.includes(value)}
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <label className="flex items-center gap-3 rounded-xl border border-blue-200 bg-white p-4 text-sm font-bold">
            <input name="hasVehicle" type="checkbox" defaultChecked={profile.hasVehicle} />
            I have reliable transportation
          </label>
          <label className="flex items-center gap-3 rounded-xl border border-blue-200 bg-white p-4 text-sm font-bold">
            <input name="hasTools" type="checkbox" defaultChecked={profile.hasTools} />
            I have my own tools
          </label>
        </div>

        <div className="mt-5 space-y-3">
          <label className="flex gap-3 rounded-xl border border-blue-200 bg-white p-4 text-sm leading-6 text-slate-600">
            <input
              name="consentToPublic"
              type="checkbox"
              required
              defaultChecked={profile.consentToPublic}
              className="mt-1"
            />
            Publish my public name, location, headline, skills, rates, availability and work preferences.
          </label>
          <label className="flex gap-3 rounded-xl border border-blue-200 bg-white p-4 text-sm leading-6 text-slate-600">
            <input
              name="consentToContact"
              type="checkbox"
              required
              defaultChecked={profile.consentToContact}
              className="mt-1"
            />
            Allow verified contractor accounts to send private introduction emails without seeing my address.
          </label>
        </div>
      </section>

      {message && (
        <div
          className={`rounded-xl border p-4 text-sm font-semibold ${
            state === "error"
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-700"
          }`}
        >
          {state !== "error" && <CheckCircle2 className="mr-2 inline h-4 w-4" />}
          {message}
        </div>
      )}

      <div className="flex flex-wrap justify-end gap-3">
        {status !== "HIDDEN" && (
          <button
            type="button"
            disabled={state === "saving"}
            onClick={() => {
              if (confirm("Hide this worker profile from the public directory?")) void mutate("HIDE");
            }}
            className="inline-flex items-center rounded-xl border border-red-200 bg-white px-5 py-3 text-sm font-black text-red-700 disabled:opacity-50"
          >
            <EyeOff className="mr-2 h-4 w-4" />
            Hide profile
          </button>
        )}
        <button
          disabled={state === "saving"}
          className="inline-flex items-center rounded-xl bg-blue-700 px-5 py-3 text-sm font-black text-white hover:bg-blue-800 disabled:opacity-50"
        >
          {state === "saving" ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          Save and publish
        </button>
      </div>

      {status === "PUBLISHED" && (
        <div className="text-right">
          <Link href={`/worker/${profile.slug}`} className="text-sm font-black text-blue-700 underline">
            Open public profile
          </Link>
        </div>
      )}
    </form>
  );
}
