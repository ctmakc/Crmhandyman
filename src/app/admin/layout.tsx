import type { Metadata } from "next";
import Link from "next/link";
import { Building2, Coins, Scale, ShieldCheck } from "lucide-react";

export const metadata: Metadata = {
  robots: { index: false, follow: false, noarchive: true },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-slate-950 text-white">
        <div className="mx-auto flex min-h-16 max-w-7xl flex-col justify-between gap-3 px-4 py-3 sm:px-6 lg:flex-row lg:items-center">
          <Link href="/admin" className="flex items-center gap-2 font-black">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-600">
              <ShieldCheck className="h-5 w-5" />
            </span>
            HandymanPro Operations
          </Link>
          <nav className="flex flex-wrap gap-2 text-sm font-bold text-slate-300">
            <Link
              href="/admin"
              className="inline-flex items-center rounded-lg px-3 py-2 hover:bg-white/10 hover:text-white"
            >
              <Building2 className="mr-2 h-4 w-4" />
              Tenants
            </Link>
            <Link
              href="/admin/credits"
              className="inline-flex items-center rounded-lg px-3 py-2 hover:bg-white/10 hover:text-white"
            >
              <Coins className="mr-2 h-4 w-4" />
              Credits
            </Link>
            <Link
              href="/admin/disputes"
              className="inline-flex items-center rounded-lg px-3 py-2 hover:bg-white/10 hover:text-white"
            >
              <Scale className="mr-2 h-4 w-4" />
              Disputes
            </Link>
            <Link
              href="/app"
              className="inline-flex items-center rounded-lg border border-white/15 px-3 py-2 hover:bg-white/10 hover:text-white"
            >
              Back to CRM
            </Link>
          </nav>
        </div>
      </header>
      {children}
    </div>
  );
}
