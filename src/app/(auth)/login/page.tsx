"use client";

import { useState, useEffect, Suspense } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Field } from "@/components/ui/primitives";
import { PublicShell } from "@/components/layout/PublicShell";
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

  /**
   * Where to land after signing in.
   *
   * The middleware puts the address the person was actually reaching for into
   * `callbackUrl`, and this form threw it away and went to the dashboard every time. The
   * morning that costs the most is the one the whole speed-of-response work is for: an
   * alert arrives at 06:40, the tech taps the lead link, the overnight session has
   * expired, and after signing in he is on the dispatch board hunting for the row instead
   * of on the card with the phone number.
   *
   * Only a path on this site is honoured. An absolute URL — or anything starting `//`,
   * which a browser reads as one — would turn the login screen into an open redirect
   * somebody else can send our contractors through.
   */
  function landingFrom(raw: string | null): string {
    if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/";
    return raw;
  }

  const sentHere = landingFrom(params.get("callbackUrl")) !== "/";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const res = await signIn("credentials", { email, password, slug, redirect: false });

    if (res?.error) {
      setError("That email and password do not match");
      setLoading(false);
    } else {
      router.push(landingFrom(params.get("callbackUrl")));
    }
  }

  return (
    <PublicShell
      headline={
        <>
          Leads in.
          <br />
          Jobs booked.
          <br />
          <span className="text-amber">Invoices paid.</span>
        </>
      }
      points={["Leads from every channel", "Estimates → invoices", "Crew board", "Profit on every job"]}
      footnote="HVAC · Moving · Renovation"
    >
      <div className="eyebrow">{slug ? `Workspace · ${slug}` : "Sign in"}</div>
      <h1 className="t-page mt-2 font-black leading-none tracking-tight text-ink">
        Open the desk
      </h1>

      {/* The tech who tapped an alert at 06:40 is told his place is being held. */}
      {sentHere && (
        <p className="t-body mt-4 border-l-2 py-1 pl-3 text-ink-2" style={{ borderColor: "var(--amber)" }}>
          Sign in and this takes you straight back to the page the alert pointed at.
        </p>
      )}

      {registered && (
        <p
          className="t-body mt-4 border-l-2 py-1 pl-3"
          style={{ borderColor: "var(--emerald)", color: "var(--emerald-ink)" }}
        >
          Account created — sign in to get started.
        </p>
      )}

      <form onSubmit={handleSubmit} className="mt-7 space-y-4">
        <Field id="login-email" label="Email">
          {(f) => (
            <input
              {...f}
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@yourcompany.ca"
            />
          )}
        </Field>

        {/* The refusal belongs to the password box: the field owns the message, so a
            screen reader speaks it with the field and the eye finds it under the box
            it has to fix. */}
        <Field id="login-password" label="Password" error={error || undefined}>
          {(f) => (
            <input
              {...f}
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          )}
        </Field>

        <Button type="submit" disabled={loading} className="w-full">
          {loading ? "Signing in…" : "Sign in"}
        </Button>
      </form>

      <p className="t-body mt-6 text-ink-2">
        No account yet?{" "}
        <a href="/register" className="font-bold text-ink underline underline-offset-4">
          Start a free trial
        </a>
      </p>
    </PublicShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
