"use client";

import Link from "next/link";
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
} from "lucide-react";

/** `owner: true` means the books — the API refuses these to the crew, so the rail hides
 *  them rather than offering a door that answers 403. */
const navItems = [
  { href: "/", label: "Dispatch", code: "01", icon: LayoutDashboard },
  { href: "/today", label: "Today", code: "02", icon: Truck },
  { href: "/leads", label: "Leads", code: "03", icon: Users },
  { href: "/clients", label: "Clients", code: "04", icon: Contact },
  { href: "/projects", label: "Jobs", code: "05", icon: Briefcase },
  { href: "/contracts", label: "Contracts", code: "06", icon: CalendarClock, owner: true },
  { href: "/tasks", label: "Crew", code: "07", icon: CheckSquare },
  { href: "/invoices", label: "Invoices", code: "08", icon: FileText, owner: true },
  { href: "/finance", label: "Finance", code: "09", icon: DollarSign, owner: true },
  { href: "/reports", label: "Reports", code: "10", icon: TrendingUp, owner: true },
  { href: "/settings", label: "Settings", code: "11", icon: Settings, owner: true },
];

/**
 * The phone bar. Five stops, because a sixth stops being a tap target on a 390px screen.
 *
 * `/leads` earns one: the call sheet is where the money starts, and on the phone it was
 * only reachable by scrolling past five job rows on the dashboard — the owner standing
 * in a driveway at 08:40 could not get to the morning's enquiries at all. Invoices come
 * off it; that is a desk job, and the rail still carries it on any wider screen.
 */
const mobileItems = ["/today", "/", "/leads", "/projects", "/clients"];

export default function Sidebar({ business }: { business?: string | null }) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const isAdmin = (session?.user as { role?: string } | undefined)?.role === "ADMIN";
  const items = navItems.filter((i) => isAdmin || !i.owner);

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
            HANDYMAN<span className="text-amber">PRO</span>
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
          .filter((item): item is (typeof navItems)[number] => Boolean(item))
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
      </nav>
    </>
  );
}
