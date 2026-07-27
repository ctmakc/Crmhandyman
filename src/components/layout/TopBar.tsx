"use client";

import { signOut } from "next-auth/react";
import { LogOut, Search } from "lucide-react";
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
        HANDYMAN<span className="text-amber-ink">PRO</span>
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
          className="hidden items-center gap-2 border border-line px-2.5 py-1.5 text-ink-3 transition-colors duration-[140ms] ease-instrument hover:border-ink-3 hover:text-ink md:flex"
        >
          <Search className="h-3.5 w-3.5" strokeWidth={2} />
          <span className="mono text-[11px] tracking-[0.06em]">Jump</span>
          <span className="mono text-[10px] tracking-[0.08em] opacity-60">⌘K</span>
        </button>
      </div>
      <div className="flex items-center gap-3">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-navy-900 text-[10px] font-bold text-plate">
          {initials}
        </span>
        <span className="hidden text-[13px] font-medium text-ink-2 sm:inline">
          {user?.name || user?.email}
        </span>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="flex items-center gap-1.5 border border-line px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.06em] text-ink-3 transition-colors duration-[140ms] ease-instrument hover:border-ink-3 hover:text-ink"
        >
          <LogOut className="h-3.5 w-3.5" strokeWidth={2} />
          <span className="hidden sm:inline">Sign out</span>
        </button>
      </div>
    </header>
  );
}
