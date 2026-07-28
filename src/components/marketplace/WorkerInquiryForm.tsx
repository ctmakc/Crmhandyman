"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Loader2, LogIn, Send } from "lucide-react";

export default function WorkerInquiryForm({
  workerSlug,
  workerName,
  canInquire,
  defaultName = "",
  defaultEmail = "",
}: {
  workerSlug: string;
  workerName: string;
  canInquire: boolean;
  defaultName?: string;
  defaultEmail?: string;
}) {
  const [state, setState] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [leadId, setLeadId] = useState<string | null>(null);

  if (!canInquire) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="font-black">Request a private introduction</h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          Sign in with a contractor admin account. The worker&apos;s email and phone remain private;
          HandymanPro forwards your opportunity and they decide whether to reply.
        </p>
        <Link
          href={`/login?callbackUrl=${encodeURIComponent(`/worker/${workerSlug}#contact`)}`}
          className="mt-5 flex w-full items-center justify-center rounded-xl bg-blue-700 px-4 py-3 text-sm font-black text-white"
        >
          <LogIn className="mr-2 h-4 w-4" />
          Contractor sign in
        </Link>
      </div>
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("submitting");
    setMessage("");
    setLeadId(null);

    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch(`/api/recruiting/workers/${workerSlug}/inquire`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...Object.fromEntries(form.entries()),
          consent: form.get("consent") === "on",
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        const details = Array.isArray(result.details) ? result.details.join(" ") : result.error;
        throw new Error(details || "Unable to send introduction.");
      }

      setLeadId(result.leadId ?? null);
      setMessage(result.message || "Introduction request recorded.");
      setState("success");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to send introduction.");
      setState("error");
    }
  }

  if (state === "success") {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-center">
        <CheckCircle2 className="mx-auto h-9 w-9 text-emerald-600" />
        <h2 className="mt-3 font-black text-emerald-950">Introduction recorded</h2>
        <p className="mt-2 text-sm leading-6 text-emerald-800">{message}</p>
        {leadId && (
          <Link
            href={`/leads/${leadId}`}
            className="mt-4 inline-flex rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-black text-white"
          >
            Open CRM follow-up
          </Link>
        )}
      </div>
    );
  }

  const inputClass =
    "mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-3 text-sm outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100";

  return (
    <form id="contact" onSubmit={submit} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="font-black">Request a private introduction</h2>
      <p className="mt-2 text-sm leading-6 text-slate-500">
        Your opportunity is emailed to {workerName}. Their private contact details are not disclosed;
        they can reply directly if interested.
      </p>

      <div className="mt-5 space-y-4">
        <label className="block">
          <span className="text-sm font-bold">Opportunity</span>
          <input
            name="opportunityTitle"
            required
            minLength={5}
            maxLength={160}
            className={inputClass}
            placeholder="Two-week bathroom renovation subcontract"
          />
        </label>
        <label className="block">
          <span className="text-sm font-bold">Message</span>
          <textarea
            name="message"
            required
            minLength={30}
            maxLength={3000}
            rows={6}
            className={inputClass}
            placeholder="Describe the work, location, schedule, required skills and compensation."
          />
        </label>
        <label className="block">
          <span className="text-sm font-bold">Contact name</span>
          <input
            name="contactName"
            required
            defaultValue={defaultName}
            maxLength={120}
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className="text-sm font-bold">Reply email</span>
          <input
            name="contactEmail"
            required
            type="email"
            defaultValue={defaultEmail}
            maxLength={160}
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className="text-sm font-bold">Phone</span>
          <input name="contactPhone" type="tel" maxLength={40} className={inputClass} />
        </label>
        <label className="flex gap-3 rounded-xl bg-slate-50 p-4 text-xs leading-5 text-slate-600">
          <input name="consent" type="checkbox" required className="mt-1 h-4 w-4" />
          <span>
            This is a genuine work opportunity. I authorize HandymanPro to send my company and contact
            details privately to this worker.
          </span>
        </label>
      </div>

      {state === "error" && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
          {message}
        </div>
      )}

      <button
        disabled={state === "submitting"}
        className="mt-5 flex w-full items-center justify-center rounded-xl bg-blue-700 px-4 py-3 text-sm font-black text-white hover:bg-blue-800 disabled:opacity-60"
      >
        {state === "submitting" ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Send className="mr-2 h-4 w-4" />
        )}
        Send introduction
      </button>
    </form>
  );
}
