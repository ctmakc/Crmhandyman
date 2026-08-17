"use client";

import { signOut } from "next-auth/react";
import Link from "next/link";
import { LogOut, Search } from "lucide-react";
import { buttonClass } from "@/components/ui/primitives";
import { useEffect, useState } from "react";

interface TopBarProps {
  user?: {
    name?: string | null;
    email?: string | null;
  };
}

/** The shift clock — a dispatcher always wants to know the date on the ticket. */
function ShiftStamp() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);
  if (!now) return <span className="mono text-[11px] text-ink-3">&nbsp;</span>;
  const stamp = now
    .toLocaleString("en-CA", {
      weekday: "short",
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
    .toUpperCase();
  return (
    <span className="mono hidden text-[11px] tracking-[0.08em] text-ink-3 sm:inline">
      {stamp}
    </span>
  );
}

export default function TopBar({ user }: TopBarProps) {
  const initials = (user?.name || user?.email || "?")
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <header className="flex h-14 items-center justify-between border-b border-line bg-plate px-4 md:px-6">
      <div className="text-[15px] font-black tracking-tight text-ink md:hidden">
        HANDY<span className="text-amber-ink">CRM</span>
      </div>
      <div className="flex items-center gap-4">
        <ShiftStamp />
        {/* Discoverability for Cmd+K — a shortcut nobody is told about does not exist. */}
        <button
          onClick={() =>
            window.dispatchEvent(
              new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true })
            )
          }
          /* The chrome used to spell its own two buttons and landed at 31px,
             a third height in a system that promises 38 and 26. */
          className={`${buttonClass("quiet")} hidden md:inline-flex`}
        >
          <Search className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
          <span className="mono text-[11px] tracking-[0.06em]">Jump</span>
          {/* The shortcut hint sat at opacity-60 — 2.4:1, and it is the one thing on
              the button a new dispatcher has to read. The 10px size already tells
              you it is secondary. */}
          <span className="mono text-[10px] tracking-[0.08em]">⌘K</span>
        </button>
      </div>
      <div className="flex items-center gap-3">
        {/* The only door to your own account — the crew never reaches /settings.
            Below `sm` the name is hidden and the initials plate is all that is left,
            so the link needs a spoken name and a thumb-sized box of its own. */}
        <Link
          href="/account"
          aria-label={`Account — ${user?.name || user?.email || "signed in"}`}
          className="flex min-h-[44px] min-w-[44px] items-center justify-center gap-3 transition-colors duration-[140ms] ease-instrument hover:text-ink sm:min-h-0 sm:min-w-0 sm:justify-start"
        >
          <span
            aria-hidden
            className="flex h-7 w-7 items-center justify-center rounded-full bg-navy-900 text-[10px] font-bold text-plate"
          >
            {initials}
          </span>
          <span className="hidden text-[13px] font-medium text-ink-2 sm:inline">
            {user?.name || user?.email}
          </span>
        </Link>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          aria-label="Sign out"
          className={`${buttonClass("quiet")} min-w-[44px] sm:min-w-0`}
        >
          <LogOut className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
          <span className="hidden sm:inline">Sign out</span>
        </button>
      </div>
    </header>
  );
}
