"use client";

import { FormEvent, useState } from "react";
import { CheckCircle2, Loader2, Send } from "lucide-react";

export default function JobApplicationForm({
  vacancySlug,
  companyName,
}: {
  vacancySlug: string;
  companyName: string;
}) {
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("submitting");
    setMessage("");

    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const payload = {
      ...Object.fromEntries(form.entries()),
      hasVehicle: form.get("hasVehicle") === "on",
      hasTools: form.get("hasTools") === "on",
      consentToContact: form.get("consentToContact") === "on",
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
      </div>
    );
  }

  const inputClass =
    "mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm outline-none focus:border-orange-400 focus:ring-4 focus:ring-orange-100";

  return (
    <form onSubmit={submit} className="space-y-4">
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
          <input name="city" maxLength={100} className={inputClass} />
        </label>
        <label className="sm:col-span-2">
          <span className="text-sm font-bold">Province</span>
          <input name="province" maxLength={100} className={inputClass} />
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
        </label>
        <label className="sm:col-span-2">
          <span className="text-sm font-bold">Experience</span>
          <textarea
            name="experience"
            required
            minLength={20}
            maxLength={2000}
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
            Optional HTTPS link. File uploads will use private object storage in a later workflow.
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
