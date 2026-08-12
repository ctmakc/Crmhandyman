"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { buttonClass } from "@/components/ui/primitives";

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
        setError(data.error || "Registration failed");
        return;
      }
      router.push(`/login?registered=1&slug=${data.slug}`);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  const field = "mt-1.5 w-full px-3 py-2.5 text-[14px]";

  return (
    <div className="grid min-h-screen bg-deck lg:grid-cols-[5fr_7fr]">
      <aside className="flex flex-col justify-between bg-navy-900 px-8 py-10 lg:px-12 lg:py-14">
        <div>
          <span className="text-[22px] font-black tracking-tight text-plate">
            HANDYMAN<span className="text-amber">PRO</span>
          </span>
          <p className="mono mt-2 text-[10px] uppercase tracking-[0.14em] text-ink-rail">
            Work-order desk
          </p>
        </div>

        <div className="hidden lg:block">
          <p className="max-w-[20ch] text-[30px] font-black leading-[1.08] tracking-tight text-plate">
            Seven days.
            <br />
            <span className="text-amber">No card.</span>
          </p>
          <ul className="mt-6 space-y-2">
            {[
              "Lead intake from Facebook, Google, email",
              "Job tickets, estimates and invoices",
              "Crew board your techs can use on a phone",
              "Per-job profit and loss",
            ].map((f) => (
              <li key={f} className="flex items-baseline gap-3 text-[14px] text-ink-rail">
                <span
                  className="inline-block h-[3px] w-3 shrink-0 translate-y-[-3px]"
                  style={{ background: "var(--amber)" }}
                />
                {f}
              </li>
            ))}
          </ul>
        </div>

        <p className="mono text-[10px] uppercase tracking-[0.12em] text-ink-rail">
          HVAC · Moving · Trades
        </p>
      </aside>

      <main className="flex items-center px-6 py-12 lg:px-16">
        <div className="w-full max-w-[380px]">
          <div className="eyebrow">Free trial</div>
          <h1 className="mt-2 text-[32px] font-black leading-none tracking-tight text-ink">
            Open your desk
          </h1>

          {error && (
            <p
              className="mono mt-5 border-l-2 py-1 pl-3 text-[12px]"
              style={{ borderColor: "var(--rose)", color: "var(--rose-ink)" }}
            >
              {error}
            </p>
          )}

          <form onSubmit={handleSubmit} className="mt-7 space-y-4">
            <div>
              <label className="eyebrow">Business name</label>
              <input
                type="text"
                required
                value={form.businessName}
                onChange={(e) => setForm((f) => ({ ...f, businessName: e.target.value }))}
                placeholder="Northline Heating & Air"
                className={field}
              />
            </div>
            <div>
              <label className="eyebrow">Email</label>
              <input
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="mike@example.com"
                className={field}
              />
            </div>
            <div>
              <label className="eyebrow">Password</label>
              <input
                type="password"
                required
                minLength={10}
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                placeholder="Min 10 characters"
                className={field}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className={`${buttonClass("primary")} w-full py-2.5`}
            >
              {loading ? "Creating…" : "Create account"}
            </button>
          </form>

          <p className="mt-6 text-[13px] text-ink-2">
            Already have an account?{" "}
            <a href="/login" className="font-bold text-ink underline underline-offset-4">
              Sign in
            </a>
          </p>
        </div>
      </main>
    </div>
  );
}
