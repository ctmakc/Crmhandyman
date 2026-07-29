"use client";

import { FormEvent, useState } from "react";
import { CheckCircle2, KeyRound, Loader2 } from "lucide-react";

export default function WorkerManageRequestForm({ errorMessage = "" }: { errorMessage?: string }) {
  const [state, setState] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [message, setMessage] = useState(errorMessage);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("submitting");
    setMessage("");

    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/public/workers/manage/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(form.entries())),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to request management link.");
      setMessage(result.message);
      setState("success");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to request management link.");
      setState("error");
    }
  }

  if (state === "success") {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center">
        <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />
        <h2 className="mt-3 text-xl font-black text-emerald-950">Check your email</h2>
        <p className="mt-2 text-sm leading-6 text-emerald-800">{message}</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-100 text-blue-700">
        <KeyRound className="h-6 w-6" />
      </div>
      <h1 className="mt-5 text-3xl font-black">Manage worker profile</h1>
      <p className="mt-3 text-sm leading-6 text-slate-500">
        Enter the private email used to create the profile. The response is deliberately generic; if
        a matching profile exists, a 30-minute management link will be sent.
      </p>

      <label className="hidden" aria-hidden="true">
        Company website
        <input name="companyWebsite" tabIndex={-1} autoComplete="off" />
      </label>
      <label className="mt-6 block">
        <span className="text-sm font-bold">Private profile email</span>
        <input
          name="email"
          type="email"
          required
          maxLength={160}
          className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-3 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
        />
      </label>

      {(state === "error" || message) && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
          {message}
        </div>
      )}

      <button
        disabled={state === "submitting"}
        className="mt-5 flex w-full items-center justify-center rounded-xl bg-blue-700 px-4 py-3 text-sm font-black text-white hover:bg-blue-800 disabled:opacity-60"
      >
        {state === "submitting" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Email management link
      </button>
    </form>
  );
}
