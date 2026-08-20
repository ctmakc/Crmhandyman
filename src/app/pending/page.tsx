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
      points={["An operator reviews it", "Usually within a business day", "You get an email when approved", "Then sign in the same way"]}
      footnote="HVAC · Moving · Renovation"
    >
      <div className="eyebrow">Pending approval</div>
      <h1 className="t-page mt-2 font-black leading-none tracking-tight text-ink">
        We are reviewing your workspace
      </h1>
      <p className="measure t-body mt-4 text-ink-2">
        Your account is set up and safe. Before the desk opens, an operator here reviews it,
        which keeps the platform clean for every contractor on it. The moment it is approved we
        send an email to the address you signed up with, and then you sign in the same way.
        This usually happens within a business day.
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
