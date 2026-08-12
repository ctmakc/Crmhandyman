"use client";

import { useState, useEffect, Suspense } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { buttonClass } from "@/components/ui/primitives";
import { slugFromHost } from "@/lib/tenant-slug";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [slug, setSlug] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [registered, setRegistered] = useState(false);

  useEffect(() => {
    if (params.get("registered")) setRegistered(true);

    // Same rule the middleware uses: the address names the workspace. The tenant id
    // stays on the server — the form signs in with the slug.
    setSlug(
      slugFromHost(window.location.host, params.get("slug") ?? params.get("tenant"))
    );
  }, [params]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const res = await signIn("credentials", { email, password, slug, redirect: false });

    if (res?.error) {
      setError("That email and password do not match");
      setLoading(false);
    } else {
      router.push("/");
    }
  }

  return (
    <div className="grid min-h-screen bg-deck lg:grid-cols-[5fr_7fr]">
      {/* Navy plate: the product's face, not a decorative hero. */}
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
          <p className="max-w-[22ch] text-[30px] font-black leading-[1.08] tracking-tight text-plate">
            Leads in.
            <br />
            Jobs booked.
            <br />
            <span className="text-amber">Invoices paid.</span>
          </p>
          <p className="mt-5 max-w-[38ch] text-[14px] leading-relaxed text-ink-rail">
            Built for HVAC, moving and trade crews who run on tickets, not on
            enterprise pipelines.
          </p>
        </div>

        <ul className="mono space-y-1.5 text-[10px] uppercase tracking-[0.12em] text-ink-rail">
          {["Multi-channel intake", "Estimates → invoices", "Crew board", "Job P&L"].map((f) => (
            <li key={f} className="flex items-center gap-2">
              <span className="inline-block h-[3px] w-3" style={{ background: "var(--amber)" }} />
              {f}
            </li>
          ))}
        </ul>
      </aside>

      <main className="flex items-center px-6 py-12 lg:px-16">
        <div className="w-full max-w-[380px]">
          <div className="eyebrow">{slug ? `Tenant · ${slug}` : "Sign in"}</div>
          <h1 className="mt-2 text-[32px] font-black leading-none tracking-tight text-ink">
            Open the desk
          </h1>

          {registered && (
            <p
              className="mono mt-5 border-l-2 py-1 pl-3 text-[12px]"
              style={{ borderColor: "var(--emerald)", color: "var(--emerald-ink)" }}
            >
              Account created — sign in to get started.
            </p>
          )}

          <form onSubmit={handleSubmit} className="mt-7 space-y-4">
            <div>
              <label className="eyebrow">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1.5 w-full px-3 py-2.5 text-[14px]"
                placeholder="admin@handyman.ca"
              />
            </div>

            <div>
              <label className="eyebrow">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1.5 w-full px-3 py-2.5 text-[14px]"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <p
                className="mono border-l-2 py-1 pl-3 text-[12px]"
                style={{ borderColor: "var(--rose)", color: "var(--rose-ink)" }}
              >
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className={`${buttonClass("primary")} w-full py-2.5`}
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <p className="mt-6 text-[13px] text-ink-2">
            No account yet?{" "}
            <a href="/register" className="font-bold text-ink underline underline-offset-4">
              Start a free trial
            </a>
          </p>
        </div>
      </main>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
