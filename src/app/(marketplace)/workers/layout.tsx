import Link from "next/link";
import { BriefcaseBusiness, KeyRound, MapPin, UserRoundPlus, UsersRound } from "lucide-react";

const featuredMarkets = [
  ["/workers/ontario/ottawa/general-handyman", "Ottawa handyman workers"],
  ["/workers/ontario/toronto/drywall-repair", "Toronto drywall workers"],
  ["/workers/ontario/toronto/interior-painting", "Toronto painters"],
  ["/workers/quebec/montreal/general-handyman", "Montreal handyman workers"],
  ["/workers/alberta/calgary/carpentry", "Calgary carpenters"],
  ["/workers/british-columbia/vancouver/general-handyman", "Vancouver handyman workers"],
] as const;

export default function WorkersLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <nav className="border-b border-slate-200 bg-white" aria-label="Worker marketplace sections">
        <div className="mx-auto flex max-w-7xl flex-wrap gap-2 px-4 py-3 sm:px-6">
          <Link
            href="/workers"
            className="inline-flex items-center rounded-lg px-3 py-2 text-sm font-black text-slate-700 hover:bg-blue-50 hover:text-blue-700"
          >
            <UsersRound className="mr-2 h-4 w-4" />
            Directory
          </Link>
          <Link
            href="/workers/join"
            className="inline-flex items-center rounded-lg px-3 py-2 text-sm font-black text-slate-700 hover:bg-blue-50 hover:text-blue-700"
          >
            <UserRoundPlus className="mr-2 h-4 w-4" />
            Create profile
          </Link>
          <Link
            href="/workers/manage"
            className="inline-flex items-center rounded-lg px-3 py-2 text-sm font-black text-slate-700 hover:bg-blue-50 hover:text-blue-700"
          >
            <KeyRound className="mr-2 h-4 w-4" />
            Manage profile
          </Link>
          <Link
            href="/jobs"
            className="inline-flex items-center rounded-lg px-3 py-2 text-sm font-black text-slate-700 hover:bg-blue-50 hover:text-blue-700"
          >
            <BriefcaseBusiness className="mr-2 h-4 w-4" />
            Open jobs
          </Link>
        </div>
      </nav>

      {children}

      <section className="mx-auto mt-12 max-w-7xl px-4 sm:px-6">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-blue-600" />
            <h2 className="text-xl font-black">Featured worker markets</h2>
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            These GEO pages become indexable only when they contain real email-verified profiles.
          </p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {featuredMarkets.map(([href, title]) => (
              <Link
                key={href}
                href={href}
                className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-black text-slate-700 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
              >
                {title}
              </Link>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
