import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, MapPin, Search, ShieldCheck, UserRoundSearch } from "lucide-react";
import WorkerCard from "@/components/marketplace/WorkerCard";
import { CANADIAN_MARKETS, SERVICE_CATALOG, titleFromSlug } from "@/lib/marketplace-config";
import { getPublicWorkers } from "@/lib/workers";

type Params = { province: string; city: string; skill: string };

function resolveMarket(params: Params) {
  return CANADIAN_MARKETS.find(
    (market) => market.provinceSlug === params.province && market.citySlug === params.city
  );
}

function resolveSkill(slug: string) {
  return SERVICE_CATALOG.find((service) => service.slug === slug);
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const market = resolveMarket(params);
  const skill = resolveSkill(params.skill);
  const city = market?.city ?? titleFromSlug(params.city);
  const province = market?.province ?? titleFromSlug(params.province);
  const skillName = skill?.name ?? titleFromSlug(params.skill);
  const workers =
    market && skill
      ? await getPublicWorkers({ city, province, skill: skill.slug, limit: 50 })
      : [];
  const indexable = Boolean(market && skill && workers.length > 0);

  return {
    title: `${skillName} workers in ${city}, ${province}`,
    description: `Find opt-in ${skillName.toLowerCase()} worker and subcontractor profiles in ${city}, ${province}. Compare skills, experience, rates, mobility and work preferences without exposing private contact data.`,
    alternates: {
      canonical: `/workers/${params.province}/${params.city}/${params.skill}`,
    },
    robots: indexable ? { index: true, follow: true } : { index: false, follow: true },
  };
}

export const dynamic = "force-dynamic";

export default async function WorkerGeoPage({ params }: { params: Params }) {
  const market = resolveMarket(params);
  const skill = resolveSkill(params.skill);
  const city = market?.city ?? titleFromSlug(params.city);
  const province = market?.province ?? titleFromSlug(params.province);
  const skillName = skill?.name ?? titleFromSlug(params.skill);
  const workers =
    market && skill
      ? await getPublicWorkers({ city, province, skill: skill.slug })
      : [];

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://handymanpro.ca";
  const pageUrl = `${baseUrl}/workers/${params.province}/${params.city}/${params.skill}`;
  const itemListSchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `${skillName} workers in ${city}`,
    url: pageUrl,
    numberOfItems: workers.length,
    itemListElement: workers.map((worker, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: `${baseUrl}/worker/${worker.slug}`,
      name: worker.publicName,
    })),
  };

  return (
    <main>
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
          <nav className="flex flex-wrap items-center gap-1 text-xs font-semibold text-slate-500">
            <Link href="/workers" className="hover:text-slate-950">
              Workers
            </Link>
            <ChevronRight className="h-3.5 w-3.5" />
            <span>{province}</span>
            <ChevronRight className="h-3.5 w-3.5" />
            <span>{city}</span>
            <ChevronRight className="h-3.5 w-3.5" />
            <span>{skillName}</span>
          </nav>

          <div className="mt-7 grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
            <div>
              <div className="flex items-center gap-2 text-sm font-bold text-blue-700">
                <MapPin className="h-4 w-4" />
                {city}, {province}
              </div>
              <h1 className="mt-3 text-4xl font-black tracking-tight sm:text-5xl">
                {skillName} workers in {city}
              </h1>
              <p className="mt-4 max-w-3xl leading-7 text-slate-600">
                Search workers who explicitly published this skill and location. Private legal names,
                email addresses, phone numbers and resume links remain outside the public index.
              </p>
            </div>
            <Link
              href="/workers/join"
              className="inline-flex items-center justify-center rounded-xl bg-blue-700 px-5 py-3 text-sm font-black text-white hover:bg-blue-800"
            >
              Publish my worker profile
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        {workers.length > 0 ? (
          <>
            <div className="mb-6 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <p className="text-sm font-semibold text-slate-600">
                {workers.length} opt-in profile{workers.length === 1 ? "" : "s"} for this market
              </p>
              <Link
                href={`/workers?skill=${encodeURIComponent(params.skill)}&city=${encodeURIComponent(
                  city
                )}&province=${encodeURIComponent(province)}`}
                className="text-sm font-black text-blue-700"
              >
                Refine worker search
              </Link>
            </div>
            <div className="grid gap-5 lg:grid-cols-2">
              {workers.map((worker) => (
                <WorkerCard key={worker.id} worker={worker} />
              ))}
            </div>
          </>
        ) : (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center">
            <UserRoundSearch className="mx-auto h-10 w-10 text-slate-300" />
            <h2 className="mt-4 text-2xl font-black">
              No published {skillName.toLowerCase()} profiles in {city} yet.
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-500">
              This combination is excluded from search indexing until it contains real, email-verified
              worker supply. No scraped resumes or fabricated worker cards are inserted to fill it.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Link
                href={`/workers?skill=${encodeURIComponent(params.skill)}`}
                className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-black"
              >
                Search all cities
              </Link>
              <Link
                href="/workers/join"
                className="rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-black text-white"
              >
                Add worker profile
              </Link>
            </div>
          </div>
        )}
      </section>

      <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="grid gap-5 rounded-3xl bg-slate-950 p-8 text-white md:grid-cols-3 sm:p-10">
          <div>
            <ShieldCheck className="h-5 w-5 text-emerald-400" />
            <h2 className="mt-3 font-black">Explicit publication</h2>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              A profile enters this page only after worker consent and private email verification.
            </p>
          </div>
          <div>
            <Search className="h-5 w-5 text-blue-400" />
            <h2 className="mt-3 font-black">Exact skill and GEO match</h2>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              The worker must publish {skillName.toLowerCase()} and list {city} as the profile city.
            </p>
          </div>
          <div>
            <UserRoundSearch className="h-5 w-5 text-violet-400" />
            <h2 className="mt-3 font-black">Private introduction</h2>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              Contractor admins contact workers through the platform without receiving the private
              email address unless the worker replies.
            </p>
          </div>
        </div>
      </section>

      {workers.length > 0 && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListSchema) }}
        />
      )}
    </main>
  );
}
