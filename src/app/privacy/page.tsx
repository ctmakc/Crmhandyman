import type { Metadata } from "next";
import { PublicShell } from "@/components/layout/PublicShell";

/**
 * The privacy notice — a blocker the launch audit raised: the product stores Canadians'
 * personal information (a contractor's customers' names, phone numbers, addresses and the
 * detail of jobs done in their homes) and there was no page that said so, where it lives,
 * how long it stays, or how to get it out. This is that page.
 *
 * It is written to be read by the contractor who signed up, not by a lawyer. PIPEDA does
 * not require legalese; it requires that the person can actually understand what is held
 * and can get at it. So every clause is a plain sentence with the real answer in it — one
 * server, in Canada, encrypted, deleted within thirty days of a request — and no promise
 * the product cannot keep.
 */

export const metadata: Metadata = {
  title: "Privacy — HandyCRM",
  description: "What HandyCRM collects, where it lives, how long it is kept, and how to get it out.",
};

// The address a data request or question is sent to. The same fallback the rest of the
// product uses, so one env sets it everywhere.
const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "support@handymanpro.ca";

const UPDATED = "20 August 2026";

/** One clause of the notice: a mono label on air, then the plain answer under it. */
function Clause({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="eyebrow">{heading}</h2>
      <div className="measure t-body mt-2.5 space-y-3 text-ink-2">{children}</div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <PublicShell
      headline={
        <>
          Your data,
          <br />
          and how we
          <br />
          <span className="text-amber">hold it.</span>
        </>
      }
      points={["Your records stay yours", "One server, in Canada", "Encrypted at rest", "Export or delete on request"]}
      footnote="PIPEDA · Canada"
    >
      <div className="eyebrow">Privacy notice</div>
      <h1 className="t-page mt-2 font-black leading-none tracking-tight text-ink">
        Privacy
      </h1>
      <p className="mono t-micro mt-3 uppercase tracking-[0.1em] text-ink-3">
        Last updated {UPDATED}
      </p>
      <p className="measure t-body mt-4 text-ink-2">
        HandyCRM is a work-order desk for trade contractors. When you run your business on it
        you enter information about real people — your customers. This page says what we hold,
        where it is, how long it stays, and how to get it out.
      </p>

      <Clause heading="What we collect">
        <p>
          Two kinds of information. First, your own account: your name, your business name, the
          email you sign in with, and a one-way hash of your password (we never store the
          password itself).
        </p>
        <p>
          Second, the records you type in to run jobs: your customers&apos; names, phone numbers,
          addresses and email addresses, and the detail of the work — leads, job tickets,
          estimates, invoices, notes and amounts. We collect this because it is what a work-order
          desk is for. We do not buy information about you from anyone else, and we do not use
          any of it to advertise to you or to your customers.
        </p>
      </Clause>

      <Clause heading="Where it lives">
        <p>
          On one server, in Canada, encrypted at rest. Access is limited to the people who
          operate the service. We do not sell your data and we do not share it with other
          contractors on the platform — each workspace is walled off from every other.
        </p>
        <p>
          One outside service touches it: an email provider, used only to send the reminders and
          notifications you ask the desk to send. It carries the message you are sending; it does
          not get your customer list.
        </p>
      </Clause>

      <Clause heading="How long we keep it">
        <p>
          As long as your workspace is open. If you close it, or ask us to delete it, we remove
          your workspace and its records within thirty days. Backups made for safekeeping roll
          off on their own schedule shortly after.
        </p>
      </Clause>

      <Clause heading="Getting a copy, a correction, or a deletion">
        <p>
          Under Canada&apos;s privacy law (PIPEDA) you can ask for a copy of the information we
          hold about you, ask us to correct it, or ask us to delete it. Email{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="font-bold text-ink underline underline-offset-4">
            {SUPPORT_EMAIL}
          </a>{" "}
          and we will act on it, and confirm when it is done.
        </p>
        <p>
          The customer records inside your workspace belong to you, the contractor. If one of
          your customers asks you to show or delete what you hold about them, you can do it from
          the desk, or ask us and we will do it on your instruction.
        </p>
      </Clause>

      <Clause heading="If something goes wrong">
        <p>
          We protect the data with encryption at rest and limited access. No system is perfect —
          if a breach ever put your information at risk, we would tell you, and tell the
          regulator where the law requires it.
        </p>
      </Clause>

      <Clause heading="Contact">
        <p>
          Questions about any of this go to{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="font-bold text-ink underline underline-offset-4">
            {SUPPORT_EMAIL}
          </a>
          .
        </p>
      </Clause>
    </PublicShell>
  );
}
