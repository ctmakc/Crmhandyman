"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Loader2, Send } from "lucide-react";

const EMPLOYMENT_TYPES = [
  ["FULL_TIME", "Full time"],
  ["PART_TIME", "Part time"],
  ["CONTRACT", "Contract"],
  ["TEMPORARY", "Temporary"],
  ["GIG", "Gig / day work"],
  ["SUBCONTRACT", "Subcontract"],
] as const;

export default function WorkerJoinForm() {
  const [state, setState] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("submitting");
    setMessage("");

    const form = new FormData(event.currentTarget);
    const payload = {
      ...Object.fromEntries(form.entries()),
      employmentTypes: form.getAll("employmentTypes"),
      hasVehicle: form.get("hasVehicle") === "on",
      hasTools: form.get("hasTools") === "on",
      consentToPublic: form.get("consentToPublic") === "on",
      consentToContact: form.get("consentToContact") === "on",
    };

    try {
      const response = await fetch("/api/public/workers/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) {
        const details = Array.isArray(result.details) ? result.details.join(" ") : result.error;
        throw new Error(details || "Unable to create worker profile.");
      }
      setMessage(result.message);
      setState("success");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to create worker profile.");
      setState("error");
    }
  }

  if (state === "success") {
    return (
      <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-8 text-center">
        <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
        <h2 className="mt-4 text-2xl font-black text-emerald-950">Profile request received</h2>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-emerald-800">{message}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link
            href="/workers"
            className="rounded-xl border border-emerald-300 bg-white px-4 py-2.5 text-sm font-black text-emerald-800"
          >
            Browse worker directory
          </Link>
          <Link
            href="/workers/manage"
            className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-black text-white"
          >
            Request management link
          </Link>
        </div>
      </div>
    );
  }

  const inputClass =
    "mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100";

  return (
    <form onSubmit={submit} className="space-y-6">
      <label className="hidden" aria-hidden="true">
        Company website
        <input name="companyWebsite" tabIndex={-1} autoComplete="off" />
      </label>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-xl font-black">Private identity and contact</h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          Full name, email, phone and resume link are never returned by the public API.
        </p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label>
            <span className="text-sm font-bold">Full legal name</span>
            <input name="fullName" required minLength={2} maxLength={120} className={inputClass} />
          </label>
          <label>
            <span className="text-sm font-bold">Private email</span>
            <input name="email" type="email" required maxLength={160} className={inputClass} />
          </label>
          <label>
            <span className="text-sm font-bold">Private phone</span>
            <input name="phone" type="tel" maxLength={40} className={inputClass} />
          </label>
          <label>
            <span className="text-sm font-bold">Private resume or portfolio link</span>
            <input name="resumeUrl" type="url" maxLength={500} className={inputClass} />
          </label>
        </div>
      </section>

      <section className="rounded-2xl border border-blue-200 bg-blue-50/40 p-5 shadow-sm sm:p-6">
        <h2 className="text-xl font-black text-blue-950">Public worker profile</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label>
            <span className="text-sm font-bold">Public name</span>
            <input
              name="publicName"
              required
              minLength={2}
              maxLength={100}
              className={inputClass}
              placeholder="Mike R."
            />
          </label>
          <label>
            <span className="text-sm font-bold">Years of experience</span>
            <input name="yearsExperience" type="number" min="0" max="80" className={inputClass} />
          </label>
          <label>
            <span className="text-sm font-bold">City</span>
            <input name="city" required maxLength={100} className={inputClass} />
          </label>
          <label>
            <span className="text-sm font-bold">Province</span>
            <input name="province" required maxLength={100} className={inputClass} />
          </label>
          <label className="sm:col-span-2">
            <span className="text-sm font-bold">Headline</span>
            <input
              name="headline"
              required
              minLength={5}
              maxLength={180}
              className={inputClass}
              placeholder="Renovation technician focused on drywall and finish carpentry"
            />
          </label>
          <label className="sm:col-span-2">
            <span className="text-sm font-bold">Professional summary</span>
            <textarea
              name="summary"
              required
              minLength={20}
              maxLength={3000}
              rows={7}
              className={inputClass}
              placeholder="Describe your work history, typical projects, certifications and strongest skills."
            />
          </label>
          <label className="sm:col-span-2">
            <span className="text-sm font-bold">Skills</span>
            <textarea
              name="skills"
              required
              minLength={2}
              maxLength={1000}
              rows={5}
              className={inputClass}
              placeholder={"Drywall repair\nInterior painting\nTrim carpentry"}
            />
          </label>
          <label>
            <span className="text-sm font-bold">Hourly rate from, CAD</span>
            <input name="hourlyRateMin" type="number" min="0" max="1000" step="1" className={inputClass} />
          </label>
          <label>
            <span className="text-sm font-bold">Hourly rate to, CAD</span>
            <input name="hourlyRateMax" type="number" min="0" max="1000" step="1" className={inputClass} />
          </label>
          <label className="sm:col-span-2">
            <span className="text-sm font-bold">Languages</span>
            <input name="languages" defaultValue="English" maxLength={300} className={inputClass} />
          </label>
          <label className="sm:col-span-2">
            <span className="text-sm font-bold">Availability</span>
            <input
              name="availability"
              maxLength={500}
              className={inputClass}
              placeholder="Available immediately, weekdays and occasional weekends"
            />
          </label>
        </div>

        <fieldset className="mt-5">
          <legend className="text-sm font-bold">Preferred work types</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            {EMPLOYMENT_TYPES.map(([value, label], index) => (
              <label
                key={value}
                className="flex items-center gap-2 rounded-lg border border-blue-200 bg-white p-3 text-xs font-bold text-slate-700"
              >
                <input
                  name="employmentTypes"
                  value={value}
                  type="checkbox"
                  defaultChecked={index === 0 || value === "CONTRACT" || value === "GIG"}
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <label className="flex items-center gap-3 rounded-xl border border-blue-200 bg-white p-4 text-sm font-bold">
            <input name="hasVehicle" type="checkbox" />
            I have reliable transportation
          </label>
          <label className="flex items-center gap-3 rounded-xl border border-blue-200 bg-white p-4 text-sm font-bold">
            <input name="hasTools" type="checkbox" />
            I have my own tools
          </label>
        </div>
      </section>

      <section className="space-y-3">
        <label className="flex gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-600">
          <input name="consentToPublic" type="checkbox" required className="mt-1" />
          Publish my public name, location, headline, skills, rates, availability and work preferences
          after email verification.
        </label>
        <label className="flex gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-600">
          <input name="consentToContact" type="checkbox" required className="mt-1" />
          Allow contractor admin accounts to send private introduction emails without seeing my email
          address.
        </label>
      </section>

      {state === "error" && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
          {message}
        </div>
      )}

      <button
        disabled={state === "submitting"}
        className="flex w-full items-center justify-center rounded-xl bg-blue-700 px-5 py-4 text-sm font-black text-white hover:bg-blue-800 disabled:opacity-60"
      >
        {state === "submitting" ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Send className="mr-2 h-4 w-4" />
        )}
        Save draft and send verification email
      </button>
    </form>
  );
}
