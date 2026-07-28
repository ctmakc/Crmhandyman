"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Hammer, Loader2 } from "lucide-react";

const RESERVED_SUBDOMAINS = new Set(["www", "app", "admin", "api", "static", "assets"]);

function inferTenantSlug(explicitSlug: string | null) {
  if (explicitSlug) return explicitSlug;
  if (typeof window === "undefined") return "demo";

  const parts = window.location.hostname.toLowerCase().split(".").filter(Boolean);
  if (parts.length >= 3 && !RESERVED_SUBDOMAINS.has(parts[0])) return parts[0];
  return "demo";
}

function safeCallback(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/app";
  return value === "/" ? "/app" : value;
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const requestedSlug = params.get("slug");
  const callbackUrl = useMemo(() => safeCallback(params.get("callbackUrl")), [params]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [tenantId, setTenantId] = useState("");
  const [slug, setSlug] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resolving, setResolving] = useState(true);
  const registered = params.get("registered") === "1" || params.has("registered");

  useEffect(() => {
    const effectiveSlug = inferTenantSlug(requestedSlug);
    setSlug(effectiveSlug);
    setResolving(true);

    fetch(`/api/tenant/resolve?slug=${encodeURIComponent(effectiveSlug)}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Workspace not found.");
        return response.json();
      })
      .then((data) => {
        if (!data.id) throw new Error("Workspace not found.");
        setTenantId(data.id);
      })
      .catch((reason) => {
        setTenantId("");
        setError(reason instanceof Error ? reason.message : "Workspace not found.");
      })
      .finally(() => setResolving(false));
  }, [requestedSlug]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!tenantId) {
      setError("Workspace is not available.");
      return;
    }

    setLoading(true);
    setError("");

    const result = await signIn("credentials", {
      email,
      password,
      tenantId,
      redirect: false,
    });

    if (result?.error) {
      setError("Invalid email or password.");
      setLoading(false);
      return;
    }

    router.replace(callbackUrl);
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 p-4">
      <div className="w-full max-w-md">
        <a href="/" className="mb-6 flex items-center justify-center gap-2 text-white">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500">
            <Hammer className="h-5 w-5" />
          </span>
          <span className="text-xl font-black">HandymanPro</span>
        </a>

        <div className="rounded-3xl bg-white p-7 shadow-2xl sm:p-8">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-orange-600">
              Contractor CRM
            </p>
            <h1 className="mt-2 text-3xl font-black text-slate-950">Sign in</h1>
            <p className="mt-2 text-sm text-slate-500">
              Workspace: <span className="font-bold text-slate-700">{slug || "resolving..."}</span>
            </p>
          </div>

          {registered && (
            <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">
              Account created. Sign in to complete the company profile.
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-sm font-bold text-slate-700">Email</span>
              <input
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3.5 py-3 outline-none focus:border-orange-400 focus:ring-4 focus:ring-orange-100"
                placeholder="admin@handyman.ca"
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm font-bold text-slate-700">Password</span>
              <input
                type="password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3.5 py-3 outline-none focus:border-orange-400 focus:ring-4 focus:ring-orange-100"
                placeholder="••••••••"
              />
            </label>

            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-semibold text-red-700">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || resolving || !tenantId}
              className="flex w-full items-center justify-center rounded-xl bg-orange-500 py-3 font-black text-white transition-colors hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {(loading || resolving) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {resolving ? "Resolving workspace..." : loading ? "Signing in..." : "Sign in"}
            </button>
          </form>

          <p className="mt-5 text-center text-sm text-slate-500">
            No account?{" "}
            <a href="/register" className="font-bold text-orange-600 hover:underline">
              Start a free trial
            </a>
          </p>
        </div>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
