import type { Metadata } from "next";
import Link from "next/link";
import { Filter, MapPin, Search, ShieldCheck, UserRoundSearch } from "lucide-react";
import WorkerCard from "@/components/marketplace/WorkerCard";
import { SERVICE_CATALOG } from "@/lib/marketplace-config";
import { getPublicWorkers } from "@/lib/workers";

type SearchParams = {
  q?: string;
  city?: string;
  province?: string;
  skill?: string;
  employmentType?: string;
};

export function generateMetadata({ searchParams }: { searchParams: SearchParams }): Metadata {
  const filtered = Boolean(
    searchParams.q ||
      searchParams.city ||
      searchParams.province ||
      searchParams.skill ||
      searchParams.employmentType
  );

  return {
    title: "Skilled trade workers and subcontractors in Canada",
    description:
      "Search opt-in worker profiles by trade skill, city, province and preferred work type. Private contact information is not published.",
    alternates: { canonical: "/workers" },
    robots: filtered ? { index: false, follow: true } : { index: true, follow: true },
  };
}

export const dynamic = "force-dynamic";

export default async function WorkersPage({ searchParams }: { searchParams: SearchParams }) {
  const workers = await getPublicWorkers({
    query: searchParams.q,
    city: searchParams.city,
    province: searchParams.province,
    skill: searchParams.skill,
    employmentType: searchParams.employmentType,
  });

  return (
    <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <section className="overflow-hidden rounded-3xl bg-blue-700 text-white">
        <div className="grid gap-8 px-6 py-10 sm:px-10 lg:grid-cols-[1fr_360px] lg:items-center">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-blue-200">
              Opt-in worker directory
            </p>
            <h1 className="mt-3 text-4xl font-black tracking-tight sm:text-5xl">
              Find tradespeople, helpers and subcontractors.
            </h1>
            <p className="mt-4 max-w-3xl leading-7 text-blue-100">
              Search self-published profiles by skill and location. Public pages never expose legal
              names, email, phone or private resume links.
            </p>
          </div>
          <div className="rounded-2xl border border-white/15 bg-white/10 p-5">
            <ShieldCheck className="h-7 w-7 text-emerald-300" />
            <h2 className="mt-3 font-black">Privacy by selection</h2>
            <p className="mt-2 text-sm leading-6 text-blue-100">
              The public API selects only approved profile fields. Contact data is not merely hidden
              in CSS; it is excluded at the database query layer.
            </p>
          </div>
        </div>
      </section>

      <div className="mt-8 grid gap-8 lg:grid-cols-[280px_1fr]">
        <aside>
          <form
            action="/workers"
            className="sticky top-24 space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <div className="flex items-center gap-2 font-black">
              <Filter className="h-5 w-5 text-blue-600" />
              Worker filters
            </div>

            <label className="block">
              <span className="text-xs font-black uppercase tracking-wider text-slate-500">
                Keyword
              </span>
              <div className="mt-1.5 flex items-center gap-2 rounded-xl border border-slate-200 px-3">
                <Search className="h-4 w-4 text-slate-400" />
                <input
                  name="q"
                  defaultValue={searchParams.q}
                  className="w-full bg-transparent py-3 text-sm outline-none"
                  placeholder="Drywall, carpenter, helper..."
                />
              </div>
            </label>

            <label className="block">
              <span className="text-xs font-black uppercase tracking-wider text-slate-500">
                Skill
              </span>
              <select
                name="skill"
                defaultValue={searchParams.skill}
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm"
              >
                <option value="">All skills</option>
                {SERVICE_CATALOG.map((service) => (
                  <option key={service.slug} value={service.slug}>
                    {service.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-xs font-black uppercase tracking-wider text-slate-500">
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
              <span className="text-xs font-black uppercase tracking-wider text-slate-500">
                Province
              </span>
              <input
                name="province"
                defaultValue={searchParams.province}
                className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm"
                placeholder="Ontario"
              />
            </label>

            <label className="block">
              <span className="text-xs font-black uppercase tracking-wider text-slate-500">
                Work type
              </span>
              <select
                name="employmentType"
                defaultValue={searchParams.employmentType}
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm"
              >
                <option value="">All work types</option>
                <option value="FULL_TIME">Full time</option>
                <option value="PART_TIME">Part time</option>
                <option value="CONTRACT">Contract</option>
                <option value="TEMPORARY">Temporary</option>
                <option value="GIG">Gig / day work</option>
                <option value="SUBCONTRACT">Subcontract</option>
              </select>
            </label>

            <button className="w-full rounded-xl bg-slate-950 px-4 py-3 text-sm font-black text-white hover:bg-blue-700">
              Search workers
            </button>
            <Link
              href="/workers"
              className="block text-center text-xs font-bold text-slate-500 hover:text-slate-900"
            >
              Clear filters
            </Link>
          </form>
        </aside>

        <section>
          <div className="flex flex-col justify-between gap-3 border-b border-slate-200 pb-6 sm:flex-row sm:items-end">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-blue-600">
                Public resumes
              </p>
              <h2 className="mt-2 text-3xl font-black tracking-tight">
                {workers.length} opt-in worker profile{workers.length === 1 ? "" : "s"}
              </h2>
            </div>
            <Link
              href="/jobs"
              className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-black"
            >
              Browse open jobs
            </Link>
          </div>

          {workers.length > 0 ? (
            <div className="mt-6 grid gap-5 lg:grid-cols-2">
              {workers.map((worker) => (
                <WorkerCard key={worker.id} worker={worker} />
              ))}
            </div>
          ) : (
            <div className="mt-8 rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center">
              <UserRoundSearch className="mx-auto h-10 w-10 text-slate-300" />
              <h2 className="mt-4 text-xl font-black">No public worker profiles match this search.</h2>
              <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">
                Profiles appear only after a worker explicitly chooses public visibility. The
                platform does not scrape or republish private applications as resumes.
              </p>
              <Link
                href="/jobs"
                className="mt-6 inline-flex rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-black text-white"
              >
                Apply to a job and opt in
              </Link>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
