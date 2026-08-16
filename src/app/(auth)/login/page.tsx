"use client";

import { useState, useEffect, Suspense } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Field } from "@/components/ui/primitives";
import { PublicShell } from "@/components/layout/PublicShell";
import { GoogleButton } from "@/components/GoogleButton";
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

    // The front door is where Google's OAuth begins. A subdomain button bounced here with
    // ?google=1 and where to return to — start the handshake straight away so the visitor
    // sees Google, not a second sign-in screen.
    if (params.get("google") === "1") {
      signIn("google", { callbackUrl: params.get("cb") || "/" });
      return;
    }

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

  /**
   * The demo tour. On the demo workspace's own address (NEXT_PUBLIC_DEMO_SLUG), a visitor
   * gets a one-tap way in — no credentials to hand out — because the whole point is to let
   * a prospect look around. The demo login is public and the workspace is wiped clean on a
   * schedule, so the shared password living in the bundle costs nothing.
   */
  const demoSlug = (process.env.NEXT_PUBLIC_DEMO_SLUG || "").trim().toLowerCase();
  const demoEmail = process.env.NEXT_PUBLIC_DEMO_EMAIL || "";
  const demoPassword = process.env.NEXT_PUBLIC_DEMO_PASSWORD || "";
  const isDemo = Boolean(demoSlug && demoEmail && demoPassword && slug === demoSlug);
  const [demoLoading, setDemoLoading] = useState(false);

  async function enterDemo() {
    setDemoLoading(true);
    setError("");
    const res = await signIn("credentials", {
      email: demoEmail,
      password: demoPassword,
      slug: demoSlug,
      redirect: false,
    });
    if (res?.error) {
      setError("The demo is being refreshed — try again in a moment.");
      setDemoLoading(false);
    } else {
      router.push("/");
    }
  }

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
      <div className="eyebrow">{isDemo ? "Demo · look around" : slug ? `Workspace · ${slug}` : "Sign in"}</div>
      <h1 className="t-page mt-2 font-black leading-none tracking-tight text-ink">
        {isDemo ? "See it working" : "Open the desk"}
      </h1>

      {/* The demo tour: one tap into a fully-dressed shop, no credentials to type. */}
      {isDemo && (
        <div className="mt-5">
          <p className="measure t-body text-ink-2">
            A real contractor&apos;s desk, filled in — leads, jobs, estimates, invoices and the
            money behind them. Look around; nothing here is live.
          </p>
          <Button type="button" onClick={enterDemo} disabled={demoLoading} className="mt-5 w-full">
            {demoLoading ? "Opening…" : "Look around the demo"}
          </Button>
          <div className="mt-5 flex items-center gap-3 text-ink-2">
            <span className="h-px flex-1" style={{ background: "var(--line)" }} />
            <span className="mono text-[11px] uppercase tracking-wide">or sign in</span>
            <span className="h-px flex-1" style={{ background: "var(--line)" }} />
          </div>
        </div>
      )}

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

      <div className="mt-5 flex items-center gap-3 text-ink-2">
        <span className="h-px flex-1" style={{ background: "var(--line)" }} />
        <span className="mono text-[11px] uppercase tracking-wide">or</span>
        <span className="h-px flex-1" style={{ background: "var(--line)" }} />
      </div>
      <div className="mt-5">
        <GoogleButton label="Sign in with Google" />
      </div>

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
