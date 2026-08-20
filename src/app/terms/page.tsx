import type { Metadata } from "next";
import { PublicShell } from "@/components/layout/PublicShell";

/**
 * The terms of use — the other half of the legal surface the launch audit required. It is
 * deliberately short and honest: HandyCRM opens invite-only workspaces we provision, the
 * records a contractor enters stay the contractor's, the service comes with no warranty,
 * and the operator may suspend a workspace that breaks the rules or the law. Nothing here
 * claims a right we do not use or a guarantee we cannot keep.
 */

export const metadata: Metadata = {
  title: "Terms — HandyCRM",
  description: "The terms of use for HandyCRM: acceptable use, data ownership, no warranty, and suspension.",
};

const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "support@handymanpro.ca";

const UPDATED = "20 August 2026";

function Clause({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="eyebrow">{heading}</h2>
      <div className="measure t-body mt-2.5 space-y-3 text-ink-2">{children}</div>
    </section>
  );
}

export default function TermsPage() {
  return (
    <PublicShell
      headline={
        <>
          The terms,
          <br />
          <span className="text-amber">kept short.</span>
        </>
      }
      points={["Invite-only workspaces", "Your records stay yours", "No lock-in", "Plain, honest terms"]}
      footnote="HVAC · Moving · Renovation"
    >
      <div className="eyebrow">Terms of use</div>
      <h1 className="t-page mt-2 font-black leading-none tracking-tight text-ink">
        Terms
      </h1>
      <p className="mono t-micro mt-3 uppercase tracking-[0.1em] text-ink-3">
        Last updated {UPDATED}
      </p>
      <p className="measure t-body mt-4 text-ink-2">
        These are the terms for using HandyCRM. Using the desk means you agree to them.
      </p>

      <Clause heading="Who this is for">
        <p>
          HandyCRM runs invite-only. We open each workspace ourselves, for the contractor it is
          for. The account holder is responsible for who they let into their workspace and for
          what those people do in it.
        </p>
      </Clause>

      <Clause heading="Using it well">
        <p>
          Use the desk to run your own trade business. Do not use it for anything unlawful, do
          not try to reach another workspace or break the service&apos;s security, and do not use
          it to send unwanted bulk messages.
        </p>
        <p>
          You are responsible for having the right to hold the customer information you enter,
          and for the messages you send your customers through it.
        </p>
      </Clause>

      <Clause heading="Your data stays yours">
        <p>
          The records you enter — your customers, jobs, estimates and invoices — belong to you.
          We store and process them only to run the service for you, on your instruction. We do
          not claim ownership of them and we do not sell them. You can ask for a copy or for
          deletion at any time; the{" "}
          <a href="/privacy" className="font-bold text-ink underline underline-offset-4">
            Privacy Policy
          </a>{" "}
          says how.
        </p>
      </Clause>

      <Clause heading="No warranty">
        <p>
          The service is provided as is. We work to keep it up and correct, and we do not promise
          it will never be unavailable or never contain a mistake. To the extent the law allows,
          we are not liable for lost business or other indirect loss arising from using it. Keep
          your own records of anything you cannot afford to lose.
        </p>
      </Clause>

      <Clause heading="Suspension">
        <p>
          We may suspend or close a workspace that breaks these terms or the law, or that puts
          the service or other contractors at risk. Where we can, we will tell you first and give
          you a way to get your data out.
        </p>
      </Clause>

      <Clause heading="Changes and contact">
        <p>
          If we change these terms in a way that matters, we will say so. Questions go to{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="font-bold text-ink underline underline-offset-4">
            {SUPPORT_EMAIL}
          </a>
          .
        </p>
      </Clause>
    </PublicShell>
  );
}
