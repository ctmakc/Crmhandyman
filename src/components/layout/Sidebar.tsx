"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Briefcase,
  CheckSquare,
  DollarSign,
  Globe2,
  LayoutDashboard,
  Settings,
  Share2,
  UserSearch,
  Users,
  Wrench,
} from "lucide-react";

const navItems = [
  { href: "/app", label: "Dashboard", icon: LayoutDashboard, mobile: true },
  { href: "/leads", label: "Leads", icon: Users, mobile: true },
  { href: "/network", label: "Network", icon: Share2, mobile: true },
  { href: "/projects", label: "Projects", icon: Briefcase, mobile: true },
  { href: "/tasks", label: "Tasks", icon: CheckSquare, mobile: true },
  { href: "/recruiting", label: "Recruiting", icon: UserSearch, mobile: false },
  { href: "/finance", label: "Finance", icon: DollarSign, mobile: false },
  { href: "/settings", label: "Settings", icon: Settings, mobile: false },
];

export default function Sidebar() {
  const pathname = usePathname();
  const mobileItems = navItems.filter((item) => item.mobile);

  return (
    <>
      <aside className="hidden w-60 flex-col bg-gray-900 text-white md:flex">
        <div className="border-b border-gray-700 p-5">
          <div className="flex items-center gap-2">
            <Wrench className="h-6 w-6 text-orange-400" />
            <span className="text-lg font-bold">HandymanPro</span>
          </div>
          <p className="mt-1 text-xs text-gray-400">CRM + Contractor Network</p>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-orange-600 text-white"
                    : "text-gray-400 hover:bg-gray-800 hover:text-white"
                )}
              >
                <Icon className="h-5 w-5" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-gray-800 p-3">
          <Link
            href="/directory"
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold text-gray-300 hover:bg-gray-800 hover:text-white"
          >
            <Globe2 className="h-5 w-5 text-orange-400" />
            Public network
          </Link>
        </div>
      </aside>

      <nav className="fixed bottom-0 left-0 right-0 z-50 flex border-t border-gray-700 bg-gray-900 text-white md:hidden">
        {mobileItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] transition-colors",
                isActive ? "text-orange-400" : "text-gray-400"
              )}
            >
              <Icon className="h-5 w-5" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
