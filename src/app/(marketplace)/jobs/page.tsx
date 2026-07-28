import type { Metadata } from "next";
import Link from "next/link";
import { BriefcaseBusiness, MapPin, Search, ShieldCheck } from "lucide-react";
import { formatCompensation, getPublicVacancies } from "@/lib/marketplace";
import { SERVICE_CATALOG, titleFromSlug } from "@/lib/marketplace-config";

type SearchParams = { service?: string; city?: string; province?: string };

export function generateMetadata({ searchParams }: { searchParams: SearchParams }): Metadata {
  const filtered = Boolean(searchParams.service || searchParams.city || searchParams.province);
  return {
    title: "Handyman, renovation and skilled-trade jobs in Canada",
    description:
      "Find permanent, contract, gig and subcontracting opportunities from home-service companies in the HandymanPro network.",
    alternates: { canonical: "/jobs" },
    robots: filtered ? { index: false, follow: true } : { index: true, follow: true },
  };
}

export const dynamic = "force-dynamic";

export default async function JobsPage({ searchParams }: { searchParams: SearchParams }) {
  const vacancies = await getPublicVacancies(searchParams);

  return (
    <main className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
      <section className="rounded-3xl bg-slate-950 px-6 py-10 text-white sm:px-10">
        <div className="max-w-3xl">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-orange-300">
            Trade work marketplace
          </p>
          <h1 className="mt-3 text-4xl font-black tracking-tight sm:text-5xl">
            Jobs, day work and subcontracting.
          </h1>
          <p className="mt-4 leading-7 text-slate-300">
            Search opportunities posted by contractor profiles. Compensation, employment type,
            location and verification are shown before application.
          </p>
        </div>
        <form
          action="/jobs"
          className="mt-8 grid gap-2 rounded-2xl bg-white p-2 text-slate-950 md:grid-cols-[1fr_1fr_1fr_auto]"
        >
          <select
            name="service"
            defaultValue={searchParams.service}
            className="rounded-xl px-3 py-3 text-sm outline-none"
          >
            <option value="">All trades</option>
            {SERVICE_CATALOG.map((service) => (
              <option key={service.slug} value={service.slug}>
                {service.name}
              </option>
            ))}
          </select>
          <input
            name="city"
            defaultValue={searchParams.city}
            className="rounded-xl border-t border-slate-100 px-3 py-3 text-sm outline-none md:border-l md:border-t-0"
            placeholder="City"
          />
          <input
            name="province"
            defaultValue={searchParams.province}
            className="rounded-xl border-t border-slate-100 px-3 py-3 text-sm outline-none md:border-l md:border-t-0"
            placeholder="Province"
          />
          <button className="rounded-xl bg-orange-500 px-5 py-3 text-sm font-black text-white">
            Search jobs
          </button>
        </form>
      </section>

      <section className="mt-10 grid gap-8 lg:grid-cols-[1fr_280px]">
        <div>
          <div className="flex items-end justify-between border-b border-slate-200 pb-5">
            <div>
              <h2 className="text-2xl font-black">Open opportunities</h2>
              <p className="mt-1 text-sm text-slate-500">
                {vacancies.length} published {vacancies.length === 1 ? "vacancy" : "vacancies"}
              </p>
            </div>
          </div>

          {vacancies.length > 0 ? (
            <div className="mt-5 space-y-4">
              {vacancies.map((vacancy) => (
                <article
                  key={vacancy.id}
                  className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow-md"
                >
                  <div className="flex flex-col justify-between gap-5 sm:flex-row">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/jobs/${vacancy.slug}`}
                          className="text-xl font-black hover:text-orange-600"
                        >
                          {vacancy.title}
                        </Link>
                        {vacancy.company.verificationStatus === "VERIFIED" && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-emerald-700">
                            <ShieldCheck className="h-3.5 w-3.5" />
                            Verified employer
                          </span>
                        )}
                      </div>
                      <Link
                        href={`/pro/${vacancy.company.slug}`}
                        className="mt-1 inline-block text-sm font-bold text-slate-600 hover:text-slate-950"
                      >
                        {vacancy.company.name}
                      </Link>
                      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs font-semibold text-slate-500">
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5" />
                          {vacancy.city}, {vacancy.province}
                        </span>
                        <span>{titleFromSlug(vacancy.employmentType.toLowerCase())}</span>
                        <span>{titleFromSlug(vacancy.serviceSlug)}</span>
                      </div>
                      <p className="mt-4 line-clamp-2 text-sm leading-6 text-slate-600">
                        {vacancy.description}
                      </p>
                    </div>
                    <div className="shrink-0 sm:text-right">
                      {formatCompensation(vacancy) && (
                        <div className="text-sm font-black text-slate-900">
                          {formatCompensation(vacancy)}
                        </div>
                      )}
                      <Link
                        href={`/jobs/${vacancy.slug}`}
                        className="mt-4 inline-flex rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-bold text-white hover:bg-orange-600"
                      >
                        View job
                      </Link>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="mt-6 rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center">
              <Search className="mx-auto h-10 w-10 text-slate-300" />
              <h2 className="mt-4 text-xl font-black">No published jobs match these filters.</h2>
              <p className="mt-2 text-sm text-slate-500">
                Vacancy pages are created only when an employer actively publishes an opportunity.
              </p>
            </div>
          )}
        </div>

        <aside className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <BriefcaseBusiness className="h-6 w-6 text-blue-600" />
            <h2 className="mt-3 font-black">For contractor companies</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Permanent jobs, short gigs and subcontractor requests use one vacancy model and can be
              published from the contractor account.
            </p>
            <Link
              href="/login"
              className="mt-4 inline-flex text-sm font-black text-blue-700 hover:text-blue-900"
            >
              Sign in to post work
            </Link>
          </div>
        </aside>
      </section>
    </main>
  );
}
