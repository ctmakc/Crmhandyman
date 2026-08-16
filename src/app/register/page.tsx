"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, ErrorNote, Field } from "@/components/ui/primitives";
import { PublicShell } from "@/components/layout/PublicShell";
import { GoogleButton } from "@/components/GoogleButton";

export default function RegisterPage() {
  const router = useRouter();
  // Signup always opens a trial — the plan is not the visitor's to choose.
  const [form, setForm] = useState({ businessName: "", email: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "That did not go through. Check the email address and try again.");
        return;
      }
      router.push(`/login?registered=1&slug=${data.slug}`);
    } catch {
      setError("No answer from the desk — check the connection and press the button again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <PublicShell
      headline={
        <>
          Seven days.
          <br />
          <span className="text-amber">No card.</span>
        </>
      }
      points={[
        "Leads from Facebook, Google, email",
        "Job tickets, estimates, invoices",
        "Crew board on a phone",
        "Profit on every job",
      ]}
      footnote="HVAC · Moving · Renovation"
    >
      <div className="eyebrow">Free trial</div>
      <h1 className="t-page mt-2 font-black leading-none tracking-tight text-ink">
        Open your desk
      </h1>
      <p className="measure t-body mt-3 text-ink-2">
        Seven days of the whole thing. The desk is yours the moment you press the button.
      </p>

      {error && <ErrorNote className="mt-5">{error}</ErrorNote>}

      <div className="mt-6">
        <GoogleButton label="Sign up with Google" />
      </div>
      <div className="mt-5 flex items-center gap-3 text-ink-2">
        <span className="h-px flex-1" style={{ background: "var(--line)" }} />
        <span className="mono text-[11px] uppercase tracking-wide">or with email</span>
        <span className="h-px flex-1" style={{ background: "var(--line)" }} />
      </div>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <Field id="reg-business" label="Business name" required>
          {(f) => (
            <input
              {...f}
              type="text"
              autoComplete="organization"
              value={form.businessName}
              onChange={(e) => setForm((s) => ({ ...s, businessName: e.target.value }))}
              placeholder="Northline Heating & Air"
            />
          )}
        </Field>

        <Field id="reg-email" label="Email" required>
          {(f) => (
            <input
              {...f}
              type="email"
              autoComplete="username"
              value={form.email}
              onChange={(e) => setForm((s) => ({ ...s, email: e.target.value }))}
              placeholder="mike@example.com"
            />
          )}
        </Field>

        <Field id="reg-password" label="Password" required hint="Ten characters or more.">
          {(f) => (
            <input
              {...f}
              type="password"
              minLength={10}
              autoComplete="new-password"
              value={form.password}
              onChange={(e) => setForm((s) => ({ ...s, password: e.target.value }))}
            />
          )}
        </Field>

        <Button type="submit" disabled={loading} className="w-full">
          {loading ? "Creating…" : "Create account"}
        </Button>
      </form>

      <p className="t-body mt-6 text-ink-2">
        Already have an account?{" "}
        <a href="/login" className="font-bold text-ink underline underline-offset-4">
          Sign in
        </a>
      </p>
    </PublicShell>
  );
}
