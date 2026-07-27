"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Users,
  Contact,
  Briefcase,
  CheckSquare,
  FileText,
  DollarSign,
  Settings,
} from "lucide-react";

const navItems = [
  { href: "/", label: "Dispatch", code: "01", icon: LayoutDashboard },
  { href: "/leads", label: "Leads", code: "02", icon: Users },
  { href: "/clients", label: "Clients", code: "03", icon: Contact },
  { href: "/projects", label: "Jobs", code: "04", icon: Briefcase },
  { href: "/tasks", label: "Crew", code: "05", icon: CheckSquare },
  { href: "/invoices", label: "Invoices", code: "06", icon: FileText },
  { href: "/finance", label: "Finance", code: "07", icon: DollarSign },
  { href: "/settings", label: "Settings", code: "08", icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <>
      {/* Desktop rail — navy chrome against the cool work deck. */}
      <aside className="hidden w-[228px] shrink-0 flex-col bg-navy-900 md:flex">
        <div className="border-b border-navy-700 px-5 py-5">
          <span className="text-[19px] font-black leading-none tracking-tight text-plate">
            HANDYMAN<span className="text-amber">PRO</span>
          </span>
          <p className="mono mt-2 text-[10px] uppercase tracking-[0.14em] text-ink-rail">
            Work-order desk
          </p>
        </div>

        <nav className="flex-1 py-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "relative flex items-center gap-3 px-5 py-2.5 text-[13px] font-medium transition-colors duration-[140ms] ease-instrument",
                  isActive
                    ? "bg-navy-800 text-plate"
                    : "text-ink-rail hover:bg-navy-800 hover:text-plate"
                )}
              >
                {/* The active marker is the same 4px spine as a ticket. */}
                <span
                  className="absolute left-0 top-0 h-full w-[3px]"
                  style={{ background: isActive ? "var(--amber)" : "transparent" }}
                />
                <Icon className="h-[17px] w-[17px]" strokeWidth={1.75} />
                <span className="flex-1">{item.label}</span>
                <span className="mono text-[10px] tracking-[0.1em] opacity-50">
                  {item.code}
                </span>
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-navy-700 px-5 py-4">
          <p className="mono text-[10px] uppercase tracking-[0.12em] text-ink-rail">
            HVAC · Moving · Trades
          </p>
        </div>
      </aside>

      {/* Mobile bar — the tech in the driveway gets the same five lanes. */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 flex border-t border-navy-700 bg-navy-900 md:hidden">
        {navItems.slice(0, 5).map((item) => {
          const Icon = item.icon;
          const isActive =
            item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "relative flex flex-1 flex-col items-center gap-1 py-2.5 text-[10px] font-medium uppercase tracking-[0.06em] transition-colors",
                isActive ? "text-plate" : "text-ink-rail"
              )}
            >
              <span
                className="absolute left-0 top-0 h-[3px] w-full"
                style={{ background: isActive ? "var(--amber)" : "transparent" }}
              />
              <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
