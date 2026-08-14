"use client";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { PublicShell } from "@/components/layout/PublicShell";
import { buttonClass } from "@/components/ui/primitives";

/**
 * THE TRIAL RAN OUT. This is the last screen a new client sees before he decides, so it
 * wears the same face as the sign-in — it used to be a card floating in the middle of an
 * empty deck, with no product name on it and no way back to the sign-in box.
 */
function ExpiredContent() {
  const params = useSearchParams();
  const slug = params.get("slug");

  return (
    <PublicShell
      headline={
        <>
          The work is
          <br />
          <span className="text-amber">still here.</span>
        </>
      }
      points={["Work orders kept", "Clients kept", "Invoices kept"]}
      footnote="HVAC · Moving · Renovation"
    >
      <div className="eyebrow" style={{ color: "var(--rose-ink)" }}>
        Trial ended
      </div>
      <h1 className="t-page mt-2 font-black leading-none tracking-tight text-ink">
        The desk is closed
      </h1>

      <p className="measure t-body mt-4 leading-relaxed text-ink-2">
        The seven-day trial for{" "}
        <span className="mono text-ink">{slug || "your account"}</span> has run out. Every work
        order, client and invoice is exactly where it was — paying reopens the desk on the same
        data.
      </p>

      <div className="actions mt-6">
        <a href="/register" className={buttonClass("primary")}>
          New account
        </a>
        <a href={slug ? `/login?slug=${slug}` : "/login"} className={buttonClass("ghost")}>
          Sign in
        </a>
      </div>

      <p className="measure t-body mt-6 text-ink-2">
        To reopen this workspace instead, ask the person who set it up to upgrade it — the plan
        changes on the operator console and the desk opens again on the next sign-in.
      </p>
    </PublicShell>
  );
}

export default function ExpiredPage() {
  return (
    <Suspense>
      <ExpiredContent />
    </Suspense>
  );
}
