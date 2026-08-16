"use client";

import { useEffect, useState } from "react";
import { signOut, useSession } from "next-auth/react";
import { PublicShell } from "@/components/layout/PublicShell";
import { Button } from "@/components/ui/primitives";

/**
 * THE MEMBER'S WAITING ROOM. Someone who joined through an OPEN link has a real account and
 * can sign in, but the guard and the middleware treat them like a revoked session until the
 * owner approves them (approved=false). They land here.
 *
 * It advances itself. The jwt callback re-reads approval on every session refresh, so this
 * page just nudges the session every few seconds; the moment the owner says yes, the token
 * loses its `unapproved` flag, the identity fills in, and the page walks itself to the desk
 * — no second sign-in. There is a manual check for the impatient, and a way out.
 */
export default function AwaitingPage() {
  const { data: session, update } = useSession();
  const [checking, setChecking] = useState(false);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const u = session?.user as any;
  const approved = Boolean(u?.id) && !u?.unapproved;

  // Approved — leave the room. A full navigation, not a router push, so the middleware
  // re-reads the freshly re-issued cookie and opens the desk.
  useEffect(() => {
    if (approved) window.location.href = "/";
  }, [approved]);

  // A quiet poll: ask the desk again every few seconds whether the owner has said yes.
  useEffect(() => {
    const t = setInterval(() => {
      update();
    }, 5000);
    return () => clearInterval(t);
  }, [update]);

  async function checkNow() {
    setChecking(true);
    await update();
    setChecking(false);
  }

  return (
    <PublicShell
      headline={
        <>
          You are in the queue.
          <br />
          <span className="text-amber">Nearly there.</span>
        </>
      }
      points={["The owner approves new joiners", "Usually within the day", "This page lets you in", "The moment they do"]}
      footnote="HVAC · Moving · Renovation"
    >
      <div className="eyebrow">Waiting for the owner</div>
      <h1 className="t-page mt-2 font-black leading-none tracking-tight text-ink">
        Almost on the crew
      </h1>
      <p className="measure t-body mt-4 text-ink-2">
        Your account is set up. Before the desk opens, the owner lets you in — it keeps the
        workspace to the people they meant to invite. This page opens on its own the moment
        they approve you; you do not need to sign in again.
      </p>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <Button type="button" onClick={checkNow} disabled={checking}>
          {checking ? "Checking…" : "Check now"}
        </Button>
        <button
          type="button"
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="mono text-[12px] font-bold uppercase tracking-wide text-ink-2 underline underline-offset-4 hover:text-ink"
        >
          Sign out
        </button>
      </div>
    </PublicShell>
  );
}
