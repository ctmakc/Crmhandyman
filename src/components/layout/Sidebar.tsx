"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Users,
  Contact,
  Briefcase,
  CheckSquare,
  CalendarClock,
  Truck,
  FileText,
  DollarSign,
  TrendingUp,
  Settings,
  MoreHorizontal,
  Search,
  UserCircle,
  X,
} from "lucide-react";

/** `owner: true` means the books — the API refuses these to the crew, so the rail hides
 *  them rather than offering a door that answers 403. */
const navItems = [
  { href: "/", label: "Dispatch", icon: LayoutDashboard },
  { href: "/today", label: "Today", icon: Truck },
  { href: "/leads", label: "Leads", icon: Users },
  { href: "/clients", label: "Clients", icon: Contact },
  { href: "/projects", label: "Jobs", icon: Briefcase },
  { href: "/contracts", label: "Contracts", icon: CalendarClock, owner: true },
  { href: "/tasks", label: "Crew", icon: CheckSquare },
  { href: "/invoices", label: "Invoices", icon: FileText, owner: true },
  { href: "/finance", label: "Finance", icon: DollarSign, owner: true },
  { href: "/reports", label: "Reports", icon: TrendingUp, owner: true },
  { href: "/settings", label: "Settings", icon: Settings, owner: true },
];

/**
 * The phone bar. Five stops, because a sixth stops being a tap target on a 390px screen.
 *
 * `/leads` earns one: the call sheet is where the money starts, and on the phone it was
 * only reachable by scrolling past five job rows on the dashboard — the owner standing
 * in a driveway at 08:40 could not get to the morning's enquiries at all. Invoices come
 * off it; that is a desk job, and the rail still carries it on any wider screen.
 */
const mobileItems = ["/today", "/", "/leads", "/projects"];

export default function Sidebar({ business }: { business?: string | null }) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const isAdmin = (session?.user as { role?: string } | undefined)?.role === "ADMIN";
  /* The lane number is drawn from the list the person can actually see. Hard-coded
     codes made the crew's rail count 01 02 03 04 05 07 — a gap where a door he is
     not allowed through used to be. */
  const items = navItems
    .filter((i) => isAdmin || !i.owner)
    .map((i, n) => ({ ...i, code: String(n + 1).padStart(2, "0") }));
  const [moreOpen, setMoreOpen] = useState(false);
  const moreButton = useRef<HTMLButtonElement>(null);
  const rest = items.filter((i) => !mobileItems.includes(i.href));

  /* The sheet closes on Escape and on a route change, and hands the caret back to
     the button that opened it. */
  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);
  useEffect(() => {
    if (!moreOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setMoreOpen(false);
        moreButton.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [moreOpen]);

  /**
   * The rail is the first thing in the DOM, so the first tab used to land on
   * Dispatch and the fourteenth on the day's work. The skip link moves the caret
   * into <main> instead. It focuses the element rather than jumping to a hash,
   * because the shell owns <main> and this component must not depend on an id
   * being set there.
   */
  function skipToWork(e: React.MouseEvent) {
    e.preventDefault();
    const main = document.querySelector("main");
    if (!main) return;
    main.setAttribute("tabindex", "-1");
    main.focus();
    main.scrollTo({ top: 0 });
  }

  return (
    <>
      <a href="#work" className="skip-link mono text-[12px] font-bold" onClick={skipToWork}>
        Skip to the work
      </a>

      {/* Desktop rail — navy chrome against the cool work deck. */}
      <aside className="relative hidden w-[228px] shrink-0 flex-col bg-navy-900 md:flex">
        {/* A machined edge: hairline ticks down the rail, the way a gauge bezel is
            knurled. Purely material — it carries no data and never moves. */}
        <div
          className="pointer-events-none absolute inset-y-0 right-0 w-[3px] opacity-30"
          style={{
            backgroundImage:
              "repeating-linear-gradient(to bottom, var(--rail-ink) 0 1px, transparent 1px 7px)",
          }}
          aria-hidden
        />
        <div className="border-b border-navy-700 px-5 py-5">
          <span className="text-[19px] font-black leading-none tracking-tight text-plate">
            HANDY<span className="text-amber">CRM</span>
          </span>
          <p className="mono mt-2 truncate text-[10px] uppercase tracking-[0.14em] text-ink-rail">
            {business || "Work-order desk"}
          </p>
        </div>

        <nav className="flex-1 py-2" aria-label="Sections">
          {items.map((item) => {
            const Icon = item.icon;
            const isActive =
              item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                /* Which lane you are standing in was said in amber and in a lighter
                   ink and in nothing a screen reader could hear. */
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "focus-rail focus-inset relative flex items-center gap-3 px-5 py-2.5 text-[13px] font-medium transition-colors duration-[140ms] ease-instrument",
                  isActive
                    ? "bg-navy-800 text-plate"
                    : "text-ink-rail hover:bg-navy-800 hover:text-plate"
                )}
              >
                {/* The active marker is the same 4px spine as a ticket. */}
                <span
                  className="absolute left-0 top-0 h-full w-[3px]"
                  style={{ background: isActive ? "var(--amber)" : "transparent" }}
                  aria-hidden
                />
                <Icon className="h-[17px] w-[17px]" strokeWidth={1.75} aria-hidden />
                <span className="flex-1">{item.label}</span>
                {/* opacity-50 put the lane number at 2.7:1 on the navy. It still
                    recedes at 80%, and now it can be read. */}
                <span className="mono text-[10px] tracking-[0.1em] opacity-80">
                  {item.code}
                </span>
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-navy-700 px-5 py-4">
          <p className="mono text-[10px] uppercase tracking-[0.12em] text-ink-rail">
            HVAC · Moving · Renovation
          </p>
        </div>
      </aside>

      {/* Mobile bar — the tech in the driveway gets the same five lanes. */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-50 flex border-t border-navy-700 bg-navy-900 md:hidden"
        aria-label="Field sections"
      >
        {mobileItems
          .map((href) => items.find((n) => n.href === href))
          .filter((item): item is (typeof items)[number] => Boolean(item))
          .map((item) => {
          const Icon = item.icon;
          const isActive =
            item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "focus-rail focus-inset relative flex min-h-[56px] flex-1 flex-col items-center justify-center gap-1 py-2.5 text-[10px] font-medium uppercase tracking-[0.06em] transition-colors",
                isActive ? "text-plate" : "text-ink-rail"
              )}
            >
              <span
                className="absolute left-0 top-0 h-[3px] w-full"
                style={{ background: isActive ? "var(--amber)" : "transparent" }}
                aria-hidden
              />
              <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
              <span>{item.label}</span>
            </Link>
          );
        })}

        {/* THE FIFTH STOP — everything else.
            Six of eleven sections and the global search lived behind `hidden md:flex`
            with no other door, so the owner holding his phone at 06:40 could not reach
            Invoices, Finance or Reports at all — the three screens he took the phone
            out for. The bar keeps five thumb-sized stops; the rest open in a sheet. */}
        <button
          ref={moreButton}
          type="button"
          onClick={() => setMoreOpen(true)}
          aria-expanded={moreOpen}
          aria-haspopup="dialog"
          className={cn(
            "focus-rail focus-inset relative flex min-h-[56px] flex-1 flex-col items-center justify-center gap-1 py-2.5 text-[10px] font-medium uppercase tracking-[0.06em] transition-colors",
            moreOpen ? "text-plate" : "text-ink-rail"
          )}
        >
          <MoreHorizontal className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
          <span>More</span>
        </button>
      </nav>

      {moreOpen && (
        <div className="fixed inset-0 z-[60] md:hidden" role="dialog" aria-modal="true" aria-label="All sections">
          <button
            type="button"
            aria-label="Close"
            onClick={() => {
              setMoreOpen(false);
              moreButton.current?.focus();
            }}
            className="absolute inset-0 bg-navy-900/70"
          />
          <div className="absolute inset-x-0 bottom-0 max-h-[82vh] overflow-y-auto border-t border-navy-700 bg-navy-900 pb-3">
            <div className="flex items-center justify-between border-b border-navy-700 px-5 py-4">
              <span className="mono text-[11px] uppercase tracking-[0.09em] text-ink-rail">
                All sections
              </span>
              <button
                type="button"
                onClick={() => {
                  setMoreOpen(false);
                  moreButton.current?.focus();
                }}
                className="focus-rail flex min-h-[44px] min-w-[44px] items-center justify-center text-ink-rail"
                aria-label="Close all sections"
              >
                <X className="h-5 w-5" strokeWidth={1.75} aria-hidden />
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                setMoreOpen(false);
                window.dispatchEvent(
                  new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true })
                );
              }}
              className="focus-rail flex min-h-[52px] w-full items-center gap-3 border-b border-navy-700 px-5 text-left text-[13px] font-medium text-plate"
            >
              <Search className="h-[17px] w-[17px] shrink-0" strokeWidth={1.75} aria-hidden />
              Search the desk
            </button>

            {rest.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="focus-rail flex min-h-[52px] items-center gap-3 border-b border-navy-700 px-5 text-[13px] font-medium text-plate"
                >
                  <Icon className="h-[17px] w-[17px] shrink-0" strokeWidth={1.75} aria-hidden />
                  <span className="flex-1">{item.label}</span>
                </Link>
              );
            })}

            <Link
              href="/account"
              className="focus-rail flex min-h-[52px] items-center gap-3 px-5 text-[13px] font-medium text-plate"
            >
              <UserCircle className="h-[17px] w-[17px] shrink-0" strokeWidth={1.75} aria-hidden />
              Your account
            </Link>
          </div>
        </div>
      )}
    </>
  );
}
