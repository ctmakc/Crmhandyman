"use client";

import { FormEvent, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { SERVICE_CATALOG } from "@/lib/marketplace";

type Props = {
  defaultService?: string;
  defaultCity?: string;
  defaultProvince?: string;
  preferredContractor?: string;
};

export default function JobRequestForm({
  defaultService = "",
  defaultCity = "",
  defaultProvince = "",
  preferredContractor = "",
}: Props) {
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("submitting");
    setMessage("");

    const form = new FormData(event.currentTarget);
    const payload = {
      customerName: form.get("customerName"),
      customerEmail: form.get("customerEmail"),
      customerPhone: form.get("customerPhone"),
      title: form.get("title"),
      description: form.get("description"),
      serviceSlug: form.get("serviceSlug"),
      city: form.get("city"),
      province: form.get("province"),
      postalCode: form.get("postalCode"),
      budgetMin: form.get("budgetMin"),
      budgetMax: form.get("budgetMax"),
      urgency: form.get("urgency"),
      preferredContractor: form.get("preferredContractor"),
      companyWebsite: form.get("companyWebsite"),
      consentToShare: form.get("consentToShare") === "on",
    };

    try {
      const response = await fetch("/api/public/project-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();

      if (!response.ok) {
        const details = Array.isArray(result.details) ? result.details.join(" ") : result.error;
        throw new Error(details || "Unable to submit project request.");
      }

      setStatus("success");
      setMessage("Project received. Relevant contractors can now be matched.");
      event.currentTarget.reset();
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Unable to submit project request.");
    }
  }

  if (status === "success") {
    return (
      <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-8 text-center">
        <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
        <h2 className="mt-4 text-2xl font-black text-emerald-950">Request submitted</h2>
        <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-emerald-800">{message}</p>
        <button
          type="button"
          onClick={() => setStatus("idle")}
          className="mt-6 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white"
        >
          Post another project
        </button>
      </div>
    );
  }

  const inputClass =
    "mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm outline-none transition focus:border-orange-400 focus:ring-4 focus:ring-orange-100";

  return (
    <form onSubmit={submit} className="space-y-7">
      <input type="hidden" name="preferredContractor" value={preferredContractor} />
      <label className="hidden" aria-hidden="true">
        Company website
        <input name="companyWebsite" tabIndex={-1} autoComplete="off" />
      </label>

      <fieldset className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <legend className="px-2 text-sm font-black uppercase tracking-wider text-slate-500">
          Project
        </legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="sm:col-span-2">
            <span className="text-sm font-bold">What do you need done?</span>
            <input
              name="title"
              required
              minLength={5}
              maxLength={140}
              className={inputClass}
              placeholder="Repair and repaint a damaged living-room ceiling"
            />
          </label>
          <label>
            <span className="text-sm font-bold">Service</span>
            <select
              name="serviceSlug"
              required
              defaultValue={defaultService}
              className={inputClass}
            >
              <option value="" disabled>
                Select service
              </option>
              {SERVICE_CATALOG.map((service) => (
                <option key={service.slug} value={service.slug}>
                  {service.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="text-sm font-bold">Urgency</span>
            <select name="urgency" defaultValue="FLEXIBLE" className={inputClass}>
              <option value="EMERGENCY">Emergency</option>
              <option value="WITHIN_48_HOURS">Within 48 hours</option>
              <option value="THIS_WEEK">This week</option>
              <option value="FLEXIBLE">Flexible</option>
            </select>
          </label>
          <label className="sm:col-span-2">
            <span className="text-sm font-bold">Scope and important details</span>
            <textarea
              name="description"
              required
              minLength={20}
              maxLength={4000}
              rows={7}
              className={inputClass}
              placeholder="Describe the current condition, approximate dimensions, access constraints and your expected result."
            />
          </label>
          <label>
            <span className="text-sm font-bold">Budget from, CAD</span>
            <input name="budgetMin" type="number" min="0" step="50" className={inputClass} />
          </label>
          <label>
            <span className="text-sm font-bold">Budget to, CAD</span>
            <input name="budgetMax" type="number" min="0" step="50" className={inputClass} />
          </label>
        </div>
      </fieldset>

      <fieldset className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <legend className="px-2 text-sm font-black uppercase tracking-wider text-slate-500">
          Location
        </legend>
        <div className="grid gap-4 sm:grid-cols-3">
          <label>
            <span className="text-sm font-bold">City</span>
            <input name="city" required defaultValue={defaultCity} className={inputClass} />
          </label>
          <label>
            <span className="text-sm font-bold">Province</span>
            <select name="province" required defaultValue={defaultProvince} className={inputClass}>
              <option value="" disabled>
                Select
              </option>
              <option>Ontario</option>
              <option>Quebec</option>
              <option>British Columbia</option>
              <option>Alberta</option>
              <option>Manitoba</option>
              <option>Saskatchewan</option>
              <option>Nova Scotia</option>
              <option>New Brunswick</option>
            </select>
          </label>
          <label>
            <span className="text-sm font-bold">Postal code</span>
            <input name="postalCode" maxLength={16} className={inputClass} />
          </label>
        </div>
      </fieldset>

      <fieldset className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <legend className="px-2 text-sm font-black uppercase tracking-wider text-slate-500">
          Contact
        </legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <label>
            <span className="text-sm font-bold">Name</span>
            <input name="customerName" required maxLength={100} className={inputClass} />
          </label>
          <label>
            <span className="text-sm font-bold">Phone</span>
            <input name="customerPhone" type="tel" maxLength={40} className={inputClass} />
          </label>
          <label className="sm:col-span-2">
            <span className="text-sm font-bold">Email</span>
            <input
              name="customerEmail"
              required
              type="email"
              maxLength={160}
              className={inputClass}
            />
          </label>
        </div>
      </fieldset>

      <label className="flex gap-3 rounded-2xl bg-slate-100 p-4 text-sm leading-6 text-slate-600">
        <input name="consentToShare" type="checkbox" required className="mt-1 h-4 w-4" />
        <span>
          I authorize HandymanPro to share this project and my contact details with contractors
          selected for matching. My address and contact details will not be published publicly.
        </span>
      </label>

      {status === "error" && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
          {message}
        </div>
      )}

      <button
        type="submit"
        disabled={status === "submitting"}
        className="flex w-full items-center justify-center rounded-xl bg-orange-500 px-5 py-4 text-sm font-black text-white hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {status === "submitting" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Submit project for matching
      </button>
    </form>
  );
}
