import type { Metadata } from "next";
import { PublicShell, ConsentNotice } from "@/components/layout/PublicShell";
import { GoogleButton } from "@/components/GoogleButton";
import { RegisterForm } from "./RegisterForm";

/**
 * The sign-up screen — now honest about a door that is shut.
 *
 * HandyCRM launches invite-only: we open every workspace ourselves, and self-serve sign-up
 * is off in production (SELF_SERVE_SIGNUP unset). The old page did not know that — it always
 * rendered the email form, the visitor filled it in, pressed the button, and the API answered
 * 403 to a form that had no business being there. This page reads the same switch the API
 * reads, on the server, and when the door is shut it says so and points the visitor at the
 * two ways in that do work: a word with us, and the live demo.
 *
 * A Server Component, because the switch is a server-only env var: a client component would
 * have to be told the answer by someone, and the only honest someone is the server that owns
 * the flag. The interactive email form is a client island (`RegisterForm`) rendered only when
 * the door is actually open — in local development, where the register flow is worked on.
 */

export const metadata: Metadata = {
  title: "Get started — HandyCRM",
  description: "HandyCRM opens invite-only workspaces for trade contractors.",
};

// The exact rule the register API uses (src/app/api/register/route.ts). Both read the same
// env, on the server, so the page can never invite a sign-up the API would refuse. Production
// is closed unless SELF_SERVE_SIGNUP says otherwise; local development stays open.
function signupOpen() {
  const raw = (process.env.SELF_SERVE_SIGNUP || "").trim().toLowerCase();
  if (raw) return raw === "on" || raw === "true" || raw === "1";
  return process.env.NODE_ENV !== "production";
}

const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "support@handymanpro.ca";

// The public demo — a real desk, filled in, nothing live — so a stranger can see the product
// working while they wait for us to open a workspace for them.
const DEMO_URL = "https://try.itopsi.com";

// The same signal GoogleButton gates itself on (NEXT_PUBLIC_AUTH_ORIGIN names the OAuth
// front door). Reading it here — not the server-only googleEnabled — keeps the wrapper block
// and the button in lockstep: either both show or neither does, never an empty divider.
const googleReady = Boolean((process.env.NEXT_PUBLIC_AUTH_ORIGIN || "").trim());

export default function RegisterPage() {
  const open = signupOpen();

  return (
    <PublicShell
      headline={
        open ? (
          <>
            Seven days.
            <br />
            <span className="text-amber">No card.</span>
          </>
        ) : (
          <>
            We open
            <br />
            each desk
            <br />
            <span className="text-amber">by hand.</span>
          </>
        )
      }
      points={[
        "Leads from Facebook, Google, email",
        "Job tickets, estimates, invoices",
        "Crew board on a phone",
        "Profit on every job",
      ]}
      footnote="HVAC · Moving · Renovation"
      consent={<ConsentNotice />}
    >
      {open ? (
        <RegisterForm />
      ) : (
        <>
          <div className="eyebrow">Invite only</div>
          <h1 className="t-page mt-2 font-black leading-none tracking-tight text-ink">
            HandyCRM is invite-only right now
          </h1>
          <p className="measure t-body mt-4 text-ink-2">
            We set up every workspace ourselves, so each contractor on the platform is one we
            know. Tell us about your shop and we will open a desk for you. It usually takes a
            day.
          </p>

          <a
            href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("HandyCRM — open a workspace for my shop")}`}
            className="mono mt-6 inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded border border-navy-900 bg-navy-900 px-3.5 py-2 t-body font-bold uppercase leading-[20px] tracking-[0.05em] text-plate transition-[background-color,border-color,color] duration-fast ease-instrument hover:bg-navy-800"
            style={{ borderRadius: "3px" }}
          >
            Talk to us
          </a>

          <p className="measure t-body mt-5 text-ink-2">
            Want to look first?{" "}
            <a href={DEMO_URL} className="font-bold text-ink underline underline-offset-4">
              See the live demo
            </a>{" "}
            — a real desk, filled in, nothing live.
          </p>

          {/*
            The one self-serve door that is deliberately still open: "Continue with Google"
            opens a PENDING workspace an operator reviews before it goes live, so it never
            skips the human step. The button hides itself where Google is not configured, so
            this whole block simply disappears rather than dangling an empty divider.
          */}
          {googleReady && (
            <div className="mt-8 border-t pt-6" style={{ borderColor: "var(--line)" }}>
              <p className="measure t-body text-ink-2">
                Have a Google account? Start one this way — we review it before it opens.
              </p>
              <div className="mt-4">
                <GoogleButton label="Continue with Google" />
              </div>
            </div>
          )}

          <p className="t-body mt-8 text-ink-2">
            Already have an account?{" "}
            <a href="/login" className="font-bold text-ink underline underline-offset-4">
              Sign in
            </a>
          </p>
        </>
      )}
    </PublicShell>
  );
}
