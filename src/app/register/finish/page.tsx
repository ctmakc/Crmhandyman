"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Button, ErrorNote, Field } from "@/components/ui/primitives";
import { PublicShell } from "@/components/layout/PublicShell";

/**
 * The second half of a Google sign-up: the visitor is through Google but their workspace
 * has no name yet. One field, then the workspace opens PENDING and waits for approval.
 */
export default function FinishSignupPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [businessName, setBusinessName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const u = session?.user as any;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/register/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessName }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "That did not go through — try again.");
        return;
      }
      router.push("/pending");
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
          One field.
          <br />
          <span className="text-amber">Then your desk.</span>
        </>
      }
      points={["Signed in with Google", "Name your business", "We approve it", "You are in"]}
      footnote="HVAC · Moving · Renovation"
    >
      <div className="eyebrow">Almost there</div>
      <h1 className="t-page mt-2 font-black leading-none tracking-tight text-ink">
        Name your business
      </h1>

      {status === "authenticated" && u?.email && (
        <p className="t-body mt-3 text-ink-2">
          Signed in as <span className="mono font-bold text-ink">{u.email}</span>.
        </p>
      )}

      {status === "authenticated" && !u?.needsWorkspace && (
        <ErrorNote className="mt-5">
          This account already has a workspace. <a className="font-bold underline" href="/">Open it</a>.
        </ErrorNote>
      )}

      {error && <ErrorNote className="mt-5">{error}</ErrorNote>}

      <form onSubmit={handleSubmit} className="mt-7 space-y-4">
        <Field id="finish-business" label="Business name" required>
          {(f) => (
            <input
              {...f}
              type="text"
              autoComplete="organization"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              placeholder="Northline Heating & Air"
            />
          )}
        </Field>

        <Button type="submit" disabled={loading || status !== "authenticated"} className="w-full">
          {loading ? "Creating…" : "Create workspace"}
        </Button>
      </form>
    </PublicShell>
  );
}
