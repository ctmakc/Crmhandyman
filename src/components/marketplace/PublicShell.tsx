import Link from "next/link";
import { BriefcaseBusiness, Hammer, Search, ShieldCheck } from "lucide-react";

export default function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-stone-50 text-slate-950">
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <Link href="/directory" className="flex items-center gap-2 font-black tracking-tight">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500 text-white">
              <Hammer className="h-5 w-5" />
            </span>
            <span className="text-lg">HandymanPro</span>
            <span className="hidden rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-500 sm:inline">
              Network
            </span>
          </Link>

          <nav className="hidden items-center gap-6 text-sm font-semibold text-slate-600 md:flex">
            <Link className="hover:text-slate-950" href="/contractors">
              Find a pro
            </Link>
            <Link className="hover:text-slate-950" href="/jobs">
              Trade jobs
            </Link>
            <Link className="hover:text-slate-950" href="/hire">
              Post a project
            </Link>
          </nav>

          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="hidden rounded-lg px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 sm:inline-flex"
            >
              Sign in
            </Link>
            <Link
              href="/register"
              className="rounded-lg bg-slate-950 px-3.5 py-2 text-sm font-bold text-white hover:bg-slate-800"
            >
              List your business
            </Link>
          </div>
        </div>
      </header>

      {children}

      <footer className="mt-20 border-t border-slate-200 bg-white">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <div className="flex items-center gap-2 text-lg font-black">
              <Hammer className="h-5 w-5 text-orange-500" />
              HandymanPro Network
            </div>
            <p className="mt-3 max-w-md text-sm leading-6 text-slate-500">
              A Canadian contractor directory connected directly to the CRM used to manage leads,
              estimates, projects and crews.
            </p>
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900">Homeowners</h2>
            <div className="mt-3 space-y-2 text-sm text-slate-500">
              <Link className="block hover:text-slate-950" href="/contractors">
                Search contractors
              </Link>
              <Link className="block hover:text-slate-950" href="/hire">
                Post a project
              </Link>
              <Link className="block hover:text-slate-950" href="/jobs">
                Find trade work
              </Link>
            </div>
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900">Built for trust</h2>
            <div className="mt-3 space-y-3 text-sm text-slate-500">
              <p className="flex gap-2">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                Verification and review provenance are shown separately.
              </p>
              <p className="flex gap-2">
                <Search className="mt-0.5 h-4 w-4 shrink-0 text-orange-500" />
                Search by trade, city and service area.
              </p>
              <p className="flex gap-2">
                <BriefcaseBusiness className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                Jobs and subcontracting live in the same network.
              </p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
