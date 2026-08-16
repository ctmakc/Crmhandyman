"use client";

import { signOut } from "next-auth/react";
import { PublicShell } from "@/components/layout/PublicShell";

/**
 * The waiting room. A self-serve workspace opens PENDING and stays here until an operator
 * approves it. Nothing to do but wait — and a way out, so a shared computer is not left
 * signed into a half-open account.
 */
export default function PendingPage() {
  return (
    <PublicShell
      headline={
        <>
          Workspace created.
          <br />
          <span className="text-amber">Under review.</span>
        </>
      }
      points={["We check every new workspace", "Usually within a business day", "You will get an email", "Then sign in"]}
      footnote="HVAC · Moving · Renovation"
    >
      <div className="eyebrow">Pending approval</div>
      <h1 className="t-page mt-2 font-black leading-none tracking-tight text-ink">
        We are reviewing your workspace
      </h1>
      <p className="measure t-body mt-4 text-ink-2">
        Your account is set up and safe. Before the desk opens, a person here approves it,
        which keeps the platform clean for every contractor on it. You will get an email the
        moment it is ready, and then you sign in the same way.
      </p>

      <button
        type="button"
        onClick={() => signOut({ callbackUrl: "/login" })}
        className="mono mt-8 text-[12px] font-bold uppercase tracking-wide text-ink-2 underline underline-offset-4 hover:text-ink"
      >
        Sign out
      </button>
    </PublicShell>
  );
}
