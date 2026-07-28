import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  BriefcaseBusiness,
  Building2,
  MapPin,
  Search,
  ShieldCheck,
  Star,
  Users,
} from "lucide-react";
import {
  CANADIAN_MARKETS,
  SERVICE_CATALOG,
  getMarketplaceStats,
  getPublicContractors,
} from "@/lib/marketplace";
import ContractorCard from "@/components/marketplace/ContractorCard";

export const metadata: Metadata = {
  title: "Find verified local contractors in Canada | HandymanPro Network",
  description:
    "Search Canadian handyman and home-service contractors by trade, city and service area. Compare verified profiles, reviews, completed work and response times.",
  alternates: { canonical: "/directory" },
};

export const dynamic = "force-dynamic";

export default async function DirectoryPage() {
  const [stats, featured] = await Promise.all([
    getMarketplaceStats(),
    getPublicContractors({ limit: 6 }),
  ]);

  return (
    <main>
      <section className="relative overflow-hidden bg-slate-950 text-white">
        <div className="absolute inset-0 opacity-30 [background-image:radial-gradient(circle_at_20%_20%,#f97316_0,transparent_32%),radial-gradient(circle_at_80%_0%,#2563eb_0,transparent_28%)]" />
        <div className="relative mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:py-28">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.18em] text-orange-200">
              <ShieldCheck className="h-4 w-4" />
              Contractor network connected to real CRM activity
            </div>
            <h1 className="mt-6 text-4xl font-black leading-tight tracking-tight sm:text-6xl">
              Find the right local pro, not the loudest advertiser.
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-300">
              Search by service and location. Compare verification, review provenance, completed
              jobs, service areas and response performance in one place.
            </p>
          </div>

          <form
            action="/contractors"
            className="mt-9 grid max-w-4xl gap-2 rounded-2xl bg-white p-2 text-slate-900 shadow-2xl md:grid-cols-[1fr_1fr_auto]"
          >
            <label className="flex items-center gap-3 rounded-xl px-4 py-3">
              <Search className="h-5 w-5 text-slate-400" />
              <span className="sr-only">Service or contractor</span>
              <input
                name="q"
                className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
                placeholder="Drywall, deck, bathroom renovation..."
              />
            </label>
            <label className="flex items-center gap-3 rounded-xl border-t border-slate-100 px-4 py-3 md:border-l md:border-t-0">
              <MapPin className="h-5 w-5 text-slate-400" />
              <span className="sr-only">City</span>
              <input
                name="city"
                className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
                placeholder="Ottawa, Toronto, Montreal..."
              />
            </label>
            <button className="rounded-xl bg-orange-500 px-6 py-3 text-sm font-black text-white hover:bg-orange-600">
              Search pros
            </button>
          </form>

          <div className="mt-8 grid max-w-3xl grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              { label: "Published pros", value: stats.contractors, icon: Building2 },
              { label: "Verified reviews", value: stats.reviews, icon: Star },
              { label: "Open projects", value: stats.openJobs, icon: BriefcaseBusiness },
              { label: "Trade vacancies", value: stats.vacancies, icon: Users },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.label} className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <Icon className="h-4 w-4 text-orange-300" />
                  <div className="mt-2 text-2xl font-black">{item.value}</div>
                  <div className="text-xs text-slate-400">{item.label}</div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-orange-600">
              Browse by trade
            </p>
            <h2 className="mt-2 text-3xl font-black tracking-tight text-slate-950">
              Common home-service categories
            </h2>
          </div>
          <Link href="/contractors" className="hidden text-sm font-bold text-slate-700 sm:inline-flex">
            View all contractors <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </div>

        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {SERVICE_CATALOG.map((service) => (
            <Link
              key={service.slug}
              href={`/contractors?service=${service.slug}`}
              className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:border-orange-300 hover:shadow-md"
            >
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
                {service.category}
              </div>
              <div className="mt-2 flex items-center justify-between font-extrabold text-slate-900">
                {service.name}
                <ArrowRight className="h-4 w-4 text-slate-300 transition group-hover:translate-x-1 group-hover:text-orange-500" />
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="border-y border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
          <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-blue-600">
                Local SEO, useful to humans
              </p>
              <h2 className="mt-2 text-3xl font-black tracking-tight">
                Search by actual service area
              </h2>
              <p className="mt-4 leading-7 text-slate-600">
                Profiles can define cities, postal prefixes, radius and emergency coverage. City
                pages are generated only for supported markets rather than producing thousands of
                empty combinations.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {CANADIAN_MARKETS.map((market) => (
                <Link
                  key={`${market.provinceSlug}-${market.citySlug}`}
                  href={`/contractors/${market.provinceSlug}/${market.citySlug}/general-handyman`}
                  className="rounded-xl border border-slate-200 p-4 hover:border-blue-300 hover:bg-blue-50/40"
                >
                  <div className="flex items-center gap-2 font-bold">
                    <MapPin className="h-4 w-4 text-blue-600" />
                    {market.city}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">{market.province}</div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-600">
              Featured network members
            </p>
            <h2 className="mt-2 text-3xl font-black tracking-tight">Contractor profiles</h2>
          </div>
        </div>

        {featured.length > 0 ? (
          <div className="mt-8 grid gap-5 lg:grid-cols-2">
            {featured.map((contractor) => (
              <ContractorCard key={contractor.id} contractor={contractor} />
            ))}
          </div>
        ) : (
          <div className="mt-8 rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center">
            <BadgeCheck className="mx-auto h-10 w-10 text-slate-300" />
            <h3 className="mt-4 text-xl font-black">The public directory is ready for profiles.</h3>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">
              No fabricated companies are shown. A contractor becomes searchable only after the
              business completes its profile and publishes it from CRM settings.
            </p>
            <Link
              href="/register"
              className="mt-6 inline-flex rounded-xl bg-slate-950 px-5 py-3 text-sm font-bold text-white"
            >
              Create contractor profile
            </Link>
          </div>
        )}
      </section>

      <section className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="grid overflow-hidden rounded-3xl bg-orange-500 text-white lg:grid-cols-[1fr_auto]">
          <div className="p-8 sm:p-12">
            <h2 className="text-3xl font-black tracking-tight">Need work done?</h2>
            <p className="mt-3 max-w-2xl text-orange-50">
              Post the scope once. The platform can route it to relevant contractors by service,
              geography and availability without exposing your contact details publicly.
            </p>
          </div>
          <div className="flex items-center p-8 sm:p-12">
            <Link
              href="/hire"
              className="inline-flex items-center rounded-xl bg-white px-5 py-3 text-sm font-black text-orange-700"
            >
              Post a project <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
