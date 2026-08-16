"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { Button, Field } from "@/components/ui/primitives";
import { PublicShell } from "@/components/layout/PublicShell";
import { slugFromHost } from "@/lib/tenant-slug";

/**
 * THE JOIN PAGE — the far end of an invite link, and the one screen in the product a person
 * reaches before they have any account at all. Public: it reads the token from the address
 * and asks the desk what the link is for, then draws itself around the answer.
 *
 * A named invite locks the email the owner typed; an open link lets the joiner type their
 * own. Either way they set a password and — because that makes exactly one account on this
 * email in this workspace — they can sign in with Google on the same address afterward.
 *
 * Two endings. A named invite is trusted, so on success the page signs them straight in and
 * opens the desk. An open link is not, so it shows «your request is in» and leaves them
 * there: when they sign in, the desk stays shut until the owner approves them.
 */

interface Info {
  businessName: string;
  role: string;
  emailLocked: boolean;
  email?: string;
}

export default function JoinPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token ?? "";
  const router = useRouter();

  const [info, setInfo] = useState<Info | null>(null);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [requested, setRequested] = useState(false);

  useEffect(() => {
    if (!token) return;
    let live = true;
    (async () => {
      const res = await fetch(`/api/join/${token}`);
      const data = await res.json().catch(() => ({}));
      if (!live) return;
      if (res.ok) {
        setInfo(data);
        if (data.email) setEmail(data.email);
      } else {
        setLoadError(data.error || "This invite link is not valid.");
      }
      setLoading(false);
    })();
    return () => {
      live = false;
    };
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/join/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "That did not go through — check the form and try again.");
        return;
      }

      if (data.approved) {
        // A named invite: they are trusted, so sign them straight in and open the desk. The
        // slug the server minted them against is what the credentials provider signs with.
        const slug = data.slug || slugFromHost(window.location.host);
        const signInRes = await signIn("credentials", {
          email: data.email,
          password,
          slug,
          redirect: false,
        });
        if (signInRes?.error) {
          // The account exists — send them to the door rather than leaving them stuck.
          router.push("/login");
          return;
        }
        router.push("/");
      } else {
        // An open link: they wait. No sign-in — the owner lets them in from the crew screen.
        setRequested(true);
      }
    } catch {
      setError("No answer from the desk — check the connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  // The link is dead or made-up: one honest line and a way to the front door.
  if (loadError) {
    return (
      <PublicShell
        headline={
          <>
            That link is
            <br />
            <span className="text-amber">not open.</span>
          </>
        }
        points={["Invite links expire", "And can be turned off", "Ask for a fresh one", "Then join here"]}
        footnote="HVAC · Moving · Renovation"
      >
        <div className="eyebrow">Invite</div>
        <h1 className="t-page mt-2 font-black leading-none tracking-tight text-ink">This link is not open</h1>
        <p className="measure t-body mt-4 text-ink-2">{loadError}</p>
        <p className="t-body mt-6 text-ink-2">
          Already have a login?{" "}
          <a href="/login" className="font-bold text-ink underline underline-offset-4">
            Sign in
          </a>
        </p>
      </PublicShell>
    );
  }

  // The open-link joiner's ending: their request is filed, the owner decides.
  if (requested) {
    return (
      <PublicShell
        headline={
          <>
            Request in.
            <br />
            <span className="text-amber">Almost there.</span>
          </>
        }
        points={["The owner reviews new joiners", "You will be let in shortly", "Then sign in here", "With this email"]}
        footnote="HVAC · Moving · Renovation"
      >
        <div className="eyebrow">Waiting for the owner</div>
        <h1 className="t-page mt-2 font-black leading-none tracking-tight text-ink">
          Your request is in
        </h1>
        <p className="measure t-body mt-4 text-ink-2">
          {info?.businessName ? <><span className="font-bold text-ink">{info.businessName}</span> has your request. </> : null}
          The owner lets new teammates in one at a time. Once they do, sign in with the email and
          password you just set — or with Google on the same address.
        </p>
        <p className="t-body mt-6 text-ink-2">
          <a href="/login" className="font-bold text-ink underline underline-offset-4">
            Go to sign in
          </a>
        </p>
      </PublicShell>
    );
  }

  const roleWord = info?.role === "ADMIN" ? "an admin" : "a worker";

  return (
    <PublicShell
      headline={
        <>
          Join the crew.
          <br />
          <span className="text-amber">Open the desk.</span>
        </>
      }
      points={["One login for the whole crew", "Today's stops on your phone", "The jobs you are on", "Sign in with Google too"]}
      footnote="HVAC · Moving · Renovation"
    >
      <div className="eyebrow">{loading ? "Invite" : `Join as ${info?.role ?? "worker"}`}</div>
      <h1 className="t-page mt-2 font-black leading-none tracking-tight text-ink">
        {loading ? "Opening the invite…" : info?.businessName}
      </h1>

      {!loading && info && (
        <p className="measure t-body mt-3 text-ink-2">
          You have been invited to join <span className="font-bold text-ink">{info.businessName}</span> as{" "}
          {roleWord}. Set a name and a password to get started.
        </p>
      )}

      {!loading && info && (
        <form onSubmit={handleSubmit} className="mt-7 space-y-4">
          <Field id="join-name" label="Your name" required>
            {(f) => (
              <input
                {...f}
                type="text"
                required
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Steve Brown"
              />
            )}
          </Field>

          <Field
            id="join-email"
            label="Email"
            hint={info.emailLocked ? "The address this invite was sent to" : undefined}
          >
            {(f) => (
              <input
                {...f}
                type="email"
                required
                readOnly={info.emailLocked}
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@yourshop.ca"
                className={`${f.className} mono ${info.emailLocked ? "bg-sunk text-ink-2" : ""}`}
              />
            )}
          </Field>

          <Field
            id="join-password"
            label="Set a password"
            required
            hint="At least 10 characters"
            error={error || undefined}
          >
            {(f) => (
              <input
                {...f}
                type="password"
                required
                minLength={10}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••"
              />
            )}
          </Field>

          <Button type="submit" disabled={saving} className="w-full">
            {saving ? "Joining…" : "Join the crew"}
          </Button>
        </form>
      )}

      {loading && <p className="t-body mt-6 text-ink-2">Reading the invite…</p>}

      {!loading && info && (
        <p className="measure t-meta mt-5 text-ink-3">
          Prefer Google? Join with a password now — then you can sign in with Google on this
          same email any time afterward.
        </p>
      )}
    </PublicShell>
  );
}
