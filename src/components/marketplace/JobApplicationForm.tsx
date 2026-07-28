"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Loader2, Send, UserRoundSearch } from "lucide-react";

const EMPLOYMENT_TYPES = [
  ["FULL_TIME", "Full time"],
  ["PART_TIME", "Part time"],
  ["CONTRACT", "Contract"],
  ["TEMPORARY", "Temporary"],
  ["GIG", "Gig / day work"],
  ["SUBCONTRACT", "Subcontract"],
] as const;

export default function JobApplicationForm({
  vacancySlug,
  companyName,
}: {
  vacancySlug: string;
  companyName: string;
}) {
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [publishProfile, setPublishProfile] = useState(false);
  const [workerSlug, setWorkerSlug] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("submitting");
    setMessage("");
    setWorkerSlug(null);

    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const payload = {
      ...Object.fromEntries(form.entries()),
      hasVehicle: form.get("hasVehicle") === "on",
      hasTools: form.get("hasTools") === "on",
      consentToContact: form.get("consentToContact") === "on",
      publishProfile: form.get("publishProfile") === "on",
      consentToPublic: form.get("consentToPublic") === "on",
      employmentTypes: form.getAll("employmentTypes"),
    };

    try {
      const response = await fetch(`/api/public/jobs/${vacancySlug}/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) {
        const details = Array.isArray(result.details) ? result.details.join(" ") : result.error;
        throw new Error(details || "Unable to submit application.");
      }

      formElement.reset();
      setPublishProfile(false);
      setWorkerSlug(result.workerProfile?.slug ?? null);
      setStatus("success");
      setMessage(result.message || `Application sent privately to ${companyName}.`);
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Unable to submit application.");
    }
  }

  if (status === "success") {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center">
        <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />
        <h2 className="mt-3 text-xl font-black text-emerald-950">Application received</h2>
        <p className="mt-2 text-sm leading-6 text-emerald-800">{message}</p>
        {workerSlug && (
          <Link
            href={`/worker/${workerSlug}`}
            className="mt-5 inline-flex items-center rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-black text-white"
          >
            <UserRoundSearch className="mr-2 h-4 w-4" />
            View public worker profile
          </Link>
        )}
      </div>
    );
  }

  const inputClass =
    "mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm outline-none focus:border-orange-400 focus:ring-4 focus:ring-orange-100";

  return (
    <form onSubmit={submit} className="space-y-5">
      <label className="hidden" aria-hidden="true">
        Company website
        <input name="companyWebsite" tabIndex={-1} autoComplete="off" />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label>
          <span className="text-sm font-bold">Full name</span>
          <input name="name" required minLength={2} maxLength={120} className={inputClass} />
        </label>
        <label>
          <span className="text-sm font-bold">Phone</span>
          <input name="phone" type="tel" maxLength={40} className={inputClass} />
        </label>
        <label>
          <span className="text-sm font-bold">Email</span>
          <input name="email" required type="email" maxLength={160} className={inputClass} />
        </label>
        <label>
          <span className="text-sm font-bold">City</span>
          <input name="city" required={publishProfile} maxLength={100} className={inputClass} />
        </label>
        <label className="sm:col-span-2">
          <span className="text-sm font-bold">Province</span>
          <input name="province" required={publishProfile} maxLength={100} className={inputClass} />
        </label>
        <label className="sm:col-span-2">
          <span className="text-sm font-bold">Relevant skills</span>
          <textarea
            name="skills"
            required
            minLength={3}
            maxLength={1000}
            rows={3}
            className={inputClass}
            placeholder="Drywall finishing, interior painting, trim carpentry..."
          />
          <span className="mt-1 block text-xs text-slate-500">
            Separate skills with commas or new lines.
          </span>
        </label>
        <label className="sm:col-span-2">
          <span className="text-sm font-bold">Experience</span>
          <textarea
            name="experience"
            required
            minLength={20}
            maxLength={3000}
            rows={5}
            className={inputClass}
            placeholder="Years of experience, typical projects, certifications and responsibilities."
          />
        </label>
        <label className="sm:col-span-2">
          <span className="text-sm font-bold">Availability</span>
          <input
            name="availability"
            maxLength={500}
            className={inputClass}
            placeholder="Immediately, weekdays, weekends, two weeks notice..."
          />
        </label>
        <label className="sm:col-span-2">
          <span className="text-sm font-bold">Resume or portfolio link</span>
          <input
            name="resumeUrl"
            type="url"
            maxLength={500}
            className={inputClass}
            placeholder="https://drive.google.com/..."
          />
          <span className="mt-1 block text-xs text-slate-500">
            Optional private HTTPS link. It is delivered to the employer but never shown in the public
            worker directory.
          </span>
        </label>
        <label className="sm:col-span-2">
          <span className="text-sm font-bold">Application note</span>
          <textarea
            name="coverNote"
            required
            minLength={20}
            maxLength={3000}
            rows={5}
            className={inputClass}
            placeholder={`Explain why you are a fit for ${companyName} and this role.`}
          />
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex items-center gap-3 rounded-xl bg-slate-50 p-4 text-sm font-bold">
          <input name="hasVehicle" type="checkbox" className="h-4 w-4" />
          I have reliable transportation
        </label>
        <label className="flex items-center gap-3 rounded-xl bg-slate-50 p-4 text-sm font-bold">
          <input name="hasTools" type="checkbox" className="h-4 w-4" />
          I have my own tools
        </label>
      </div>

      <section className="rounded-2xl border border-blue-200 bg-blue-50/50 p-5">
        <label className="flex cursor-pointer gap-3">
          <input
            name="publishProfile"
            type="checkbox"
            checked={publishProfile}
            onChange={(event) => setPublishProfile(event.target.checked)}
            className="mt-1 h-4 w-4"
          />
          <span>
            <strong className="block text-sm text-blue-950">Publish me in the worker directory</strong>
            <span className="mt-1 block text-sm leading-6 text-blue-800">
              Creates or updates one opt-in worker profile connected to this email. Employers can find
              your skills and location, but not your email, phone or resume URL.
            </span>
          </span>
        </label>

        {publishProfile && (
          <div className="mt-5 grid gap-4 border-t border-blue-200 pt-5 sm:grid-cols-2">
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
              <input
                name="yearsExperience"
                type="number"
                min="0"
                max="80"
                className={inputClass}
              />
            </label>
            <label className="sm:col-span-2">
              <span className="text-sm font-bold">Public headline</span>
              <input
                name="headline"
                required
                minLength={5}
                maxLength={180}
                className={inputClass}
                placeholder="Renovation technician focused on drywall, paint and finish carpentry"
              />
            </label>
            <label>
              <span className="text-sm font-bold">Hourly rate from, CAD</span>
              <input
                name="hourlyRateMin"
                type="number"
                min="0"
                max="1000"
                step="1"
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
                className={inputClass}
              />
            </label>
            <label className="sm:col-span-2">
              <span className="text-sm font-bold">Languages</span>
              <input
                name="languages"
                defaultValue="English"
                maxLength={300}
                className={inputClass}
              />
            </label>
            <fieldset className="sm:col-span-2">
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
            <label className="flex gap-3 rounded-xl border border-blue-200 bg-white p-4 text-sm leading-6 text-slate-600 sm:col-span-2">
              <input name="consentToPublic" type="checkbox" required className="mt-1 h-4 w-4" />
              <span>
                I explicitly authorize publication of my public name, city, province, headline,
                skills, rates, availability and work preferences. I understand that private contact
                data and resume links remain hidden.
              </span>
            </label>
          </div>
        )}
      </section>

      <label className="flex gap-3 rounded-xl border border-slate-200 p-4 text-sm leading-6 text-slate-600">
        <input name="consentToContact" type="checkbox" required className="mt-1 h-4 w-4" />
        <span>
          I authorize HandymanPro to deliver this application and my contact details privately to
          {` ${companyName}`}. My contact details will not appear publicly.
        </span>
      </label>

      {status === "error" && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
          {message}
        </div>
      )}

      <button
        disabled={status === "submitting"}
        className="flex w-full items-center justify-center rounded-xl bg-orange-500 px-5 py-3.5 text-sm font-black text-white hover:bg-orange-600 disabled:opacity-60"
      >
        {status === "submitting" ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Send className="mr-2 h-4 w-4" />
        )}
        Submit private application
      </button>
    </form>
  );
}
