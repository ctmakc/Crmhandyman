import type { Metadata } from "next";
import Link from "next/link";
import { Filter, MapPin, Search, SlidersHorizontal } from "lucide-react";
import ContractorCard from "@/components/marketplace/ContractorCard";
import { SERVICE_CATALOG, getPublicContractors } from "@/lib/marketplace";

type SearchParams = {
  q?: string;
  city?: string;
  province?: string;
  service?: string;
};

export function generateMetadata({ searchParams }: { searchParams: SearchParams }): Metadata {
  const hasFilters = Boolean(
    searchParams.q || searchParams.city || searchParams.province || searchParams.service
  );

  return {
    title: "Canadian handyman and home-service contractor directory",
    description:
      "Search published contractor profiles by service, city and province. Compare verification, reviews, response time and completed work.",
    alternates: { canonical: "/contractors" },
    robots: hasFilters ? { index: false, follow: true } : { index: true, follow: true },
  };
}

export const dynamic = "force-dynamic";

export default async function ContractorsPage({ searchParams }: { searchParams: SearchParams }) {
  const contractors = await getPublicContractors({
    query: searchParams.q,
    city: searchParams.city,
    province: searchParams.province,
    service: searchParams.service,
  });

  const activeFilters = [
    searchParams.q && `“${searchParams.q}”`,
    searchParams.service &&
      SERVICE_CATALOG.find((item) => item.slug === searchParams.service)?.name,
    searchParams.city,
    searchParams.province,
  ].filter(Boolean);

  return (
    <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <div className="grid gap-8 lg:grid-cols-[280px_1fr]">
        <aside>
          <div className="sticky top-24 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2 font-black">
              <SlidersHorizontal className="h-5 w-5 text-orange-500" />
              Search filters
            </div>
            <form action="/contractors" className="mt-5 space-y-4">
              <label className="block">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Keyword
                </span>
                <div className="mt-1.5 flex items-center gap-2 rounded-xl border border-slate-200 px-3">
                  <Search className="h-4 w-4 text-slate-400" />
                  <input
                    name="q"
                    defaultValue={searchParams.q}
                    className="w-full bg-transparent py-3 text-sm outline-none"
                    placeholder="Company or trade"
                  />
                </div>
              </label>

              <label className="block">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Service
                </span>
                <select
                  name="service"
                  defaultValue={searchParams.service}
                  className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none"
                >
                  <option value="">All services</option>
                  {SERVICE_CATALOG.map((service) => (
                    <option key={service.slug} value={service.slug}>
                      {service.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  City
                </span>
                <div className="mt-1.5 flex items-center gap-2 rounded-xl border border-slate-200 px-3">
                  <MapPin className="h-4 w-4 text-slate-400" />
                  <input
                    name="city"
                    defaultValue={searchParams.city}
                    className="w-full bg-transparent py-3 text-sm outline-none"
                    placeholder="Ottawa"
                  />
                </div>
              </label>

              <label className="block">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Province
                </span>
                <select
                  name="province"
                  defaultValue={searchParams.province}
                  className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none"
                >
                  <option value="">All provinces</option>
                  <option>Ontario</option>
                  <option>Quebec</option>
                  <option>British Columbia</option>
                  <option>Alberta</option>
                  <option>Manitoba</option>
                  <option>Saskatchewan</option>
                  <option>Nova Scotia</option>
                  <option>New Brunswick</option>
                </select>
              </label>

              <button className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-sm font-black text-white hover:bg-orange-600">
                <Filter className="h-4 w-4" />
                Apply filters
              </button>
              {activeFilters.length > 0 && (
                <Link
                  href="/contractors"
                  className="block text-center text-xs font-bold text-slate-500 hover:text-slate-900"
                >
                  Clear all filters
                </Link>
              )}
            </form>
          </div>
        </aside>

        <section>
          <div className="flex flex-col justify-between gap-3 border-b border-slate-200 pb-6 sm:flex-row sm:items-end">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-orange-600">
                Contractor directory
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
                Local pros for real-world work
              </h1>
              <p className="mt-2 text-sm text-slate-500">
                {contractors.length} published profile{contractors.length === 1 ? "" : "s"}
                {activeFilters.length > 0 ? ` matching ${activeFilters.join(", ")}` : ""}
              </p>
            </div>
            <Link
              href="/hire"
              className="inline-flex rounded-xl bg-orange-500 px-4 py-3 text-sm font-black text-white hover:bg-orange-600"
            >
              Post your project
            </Link>
          </div>

          {contractors.length > 0 ? (
            <div className="mt-6 grid gap-5">
              {contractors.map((contractor) => (
                <ContractorCard key={contractor.id} contractor={contractor} />
              ))}
            </div>
          ) : (
            <div className="mt-8 rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center">
              <Search className="mx-auto h-10 w-10 text-slate-300" />
              <h2 className="mt-4 text-xl font-black">No published profiles match this search.</h2>
              <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-500">
                Broaden the city or service filter. Empty SEO combinations are intentionally not
                populated with fabricated businesses.
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-3">
                <Link
                  href="/contractors"
                  className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-bold"
                >
                  Reset search
                </Link>
                <Link
                  href="/register"
                  className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-bold text-white"
                >
                  Add a contractor profile
                </Link>
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
