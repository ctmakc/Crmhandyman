"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button, LaneHead } from "@/components/ui/primitives";

/**
 * THE COMMISSIONING CARD — what a fresh workspace has to bolt on before a lead
 * can physically arrive. The server decides whether it appears at all (admin,
 * and either no intake key or no real lead yet — see the dashboard page); this
 * component only reports which lines are already done and lets the owner fold
 * the card away.
 *
 * Each line's done-state is measured, never asserted: a key on the books, a key
 * that has actually brought a lead, a connected channel, a crew member who is
 * not the demo seed. A step the owner performed shows DONE on the next load
 * with no ceremony — the card is a gauge, not a tour.
 */

interface Steps {
  hasIntakeKey: boolean;
  landingWired: boolean;
  channelsConnected: boolean;
  crewInvited: boolean;
}

export default function OnboardingChecklist({
  userId,
  steps,
}: {
  userId: string;
  steps: Steps;
}) {
  /**
   * Dismiss lives in localStorage, keyed by user id. Chosen over a server-side
   * flag because the product has no per-user preference store anywhere — no
   * prefs column on User, no settings table — and a schema migration for one
   * boolean is heavier than the fact deserves: the card already retires itself
   * server-side the moment a key exists and a real lead has landed, so this
   * flag only bridges the days in between for a person who has seen enough.
   * Losing it on another browser costs one extra glance, not data. The user id
   * in the key keeps two admins on one machine from hiding each other's card.
   */
  const storageKey = `hp.onboarding.dismissed.${userId}`;

  // Three-valued on purpose: `null` until the flag has been read, so the card
  // never flashes on first paint for someone who already hid it.
  const [dismissed, setDismissed] = useState<boolean | null>(null);

  useEffect(() => {
    try {
      setDismissed(window.localStorage.getItem(storageKey) === "1");
    } catch {
      // Storage denied — show the card; there is nowhere to remember a "hide".
      setDismissed(false);
    }
  }, [storageKey]);

  function hide() {
    try {
      window.localStorage.setItem(storageKey, "1");
    } catch {
      // No storage: the hide holds for this page's life and that is all.
    }
    setDismissed(true);
  }

  if (dismissed !== false) return null;

  const items = [
    {
      done: steps.hasIntakeKey,
      label: "Create an intake key",
      hint: "Every landing form posts to a key. The URL shows once — copy it then.",
      href: "/settings/intake",
      where: "Settings → Intake",
    },
    {
      done: steps.landingWired,
      label: "Put the form on your landing",
      hint: "Wire the key into the form on your site. Done when the first lead comes through it.",
      href: "/settings/intake",
      where: "Settings → Intake",
    },
    {
      done: steps.channelsConnected,
      label: "Connect Facebook and email",
      hint: "Lead forms and inbox mail land on the same desk as the landing.",
      href: "/settings/integrations",
      where: "Settings → Integrations",
    },
    {
      done: steps.crewInvited,
      label: "Invite your crew",
      hint: "Techs see their day and their tasks. The books stay yours.",
      href: "/settings/users",
      where: "Settings → Users",
    },
  ];
  const doneCount = items.filter((s) => s.done).length;

  return (
    <section className="mt-10">
      <LaneHead
        title="Start receiving leads"
        right={
          <span className="flex items-center gap-3">
            <span className="eyebrow">{doneCount}/4 done</span>
            <Button variant="quiet" onClick={hide}>
              Hide
            </Button>
          </span>
        }
      />
      <div className="lane">
        {items.map((step, i) => (
          <Link
            key={step.label}
            href={step.href}
            className="row group"
            /* The spine is the state: emerald for a step the desk can vouch
               for, the empty-slot hairline for one still open. No amber — the
               lamp budget on this screen is already spent by the leads lane. */
            style={
              {
                ["--spine" as string]: step.done ? "var(--emerald)" : "var(--line)",
              } as React.CSSProperties
            }
          >
            {/* Wraps instead of shrinking — same law as the lane head. Truncating
                the label crushed «Put the form on yo…» at 390px; the destination
                takes the next line instead. */}
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <div className="flex min-w-0 items-baseline gap-3">
                <span className="mono t-meta shrink-0 text-ink-3">{i + 1}</span>
                <div className="min-w-0">
                  <p className={`t-row font-bold ${step.done ? "text-ink-3" : "text-ink"}`}>
                    {step.label}
                  </p>
                  <p className="t-body mt-1 text-ink-2">{step.hint}</p>
                </div>
              </div>
              {step.done ? (
                <span className="eyebrow shrink-0" style={{ color: "var(--emerald-ink)" }}>
                  Done
                </span>
              ) : (
                <span className="eyebrow shrink-0 group-hover:text-ink">{step.where}</span>
              )}
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
