"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, Hammer, Loader2 } from "lucide-react";

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({ businessName: "", email: "", password: "", companyWebsite: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await response.json();
      if (!response.ok) {
        const details = Array.isArray(data.details) ? data.details.join(" ") : data.error;
        throw new Error(details || "Registration failed.");
      }
      router.push(`/login?registered=1&slug=${encodeURIComponent(data.slug)}&callbackUrl=/app`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Registration failed.");
    } finally {
      setLoading(false);
    }
  }

  const inputClass =
    "mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-3 outline-none focus:border-orange-400 focus:ring-4 focus:ring-orange-100";

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-10">
      <div className="mx-auto grid max-w-5xl overflow-hidden rounded-3xl bg-white shadow-2xl lg:grid-cols-[0.85fr_1.15fr]">
        <section className="bg-orange-500 p-8 text-white sm:p-10">
          <a href="/" className="flex items-center gap-2 text-xl font-black">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-orange-600">
              <Hammer className="h-5 w-5" />
            </span>
            HandymanPro
          </a>
          <h1 className="mt-12 text-4xl font-black tracking-tight">Start with the CRM. Publish when ready.</h1>
          <p className="mt-4 leading-7 text-orange-50">
            The seven-day trial includes lead and project operations plus a draft contractor profile.
            Public listing remains under your control.
          </p>
          <div className="mt-8 space-y-4 text-sm font-semibold text-orange-50">
            {[
              "Multi-channel lead and project management",
              "Estimates, tasks, payments and expenses",
              "Public services and geographic coverage",
              "Marketplace requests routed back into CRM",
            ].map((item) => (
              <p key={item} className="flex gap-2">
                <BadgeCheck className="h-5 w-5 shrink-0" />
                {item}
              </p>
            ))}
          </div>
        </section>

        <section className="p-7 sm:p-10">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-orange-600">Free trial</p>
          <h2 className="mt-2 text-3xl font-black text-slate-950">Create your workspace</h2>
          <p className="mt-2 text-sm text-slate-500">No paid plan can be activated without billing approval.</p>

          {error && (
            <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <label className="hidden" aria-hidden="true">
              Company website
              <input
                tabIndex={-1}
                autoComplete="off"
                value={form.companyWebsite}
                onChange={(event) => setForm((current) => ({ ...current, companyWebsite: event.target.value }))}
              />
            </label>
            <label className="block">
              <span className="text-sm font-bold text-slate-700">Business name</span>
              <input
                required
                minLength={2}
                maxLength={120}
                value={form.businessName}
                onChange={(event) => setForm((current) => ({ ...current, businessName: event.target.value }))}
                placeholder="Mike's Handyman Services"
                className={inputClass}
              />
            </label>
            <label className="block">
              <span className="text-sm font-bold text-slate-700">Email</span>
              <input
                type="email"
                required
                maxLength={160}
                value={form.email}
                onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                placeholder="mike@example.com"
                className={inputClass}
              />
            </label>
            <label className="block">
              <span className="text-sm font-bold text-slate-700">Password</span>
              <input
                type="password"
                required
                minLength={8}
                maxLength={128}
                value={form.password}
                onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
                placeholder="At least 8 characters"
                className={inputClass}
              />
            </label>

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center rounded-xl bg-slate-950 py-3.5 font-black text-white hover:bg-orange-600 disabled:opacity-50"
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {loading ? "Creating workspace..." : "Start 7-day trial"}
            </button>
          </form>

          <p className="mt-5 text-center text-sm text-slate-500">
            Already have an account?{" "}
            <a href="/login" className="font-bold text-orange-600 hover:underline">Sign in</a>
          </p>
        </section>
      </div>
    </main>
  );
}
