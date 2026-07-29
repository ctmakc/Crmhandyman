import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ChevronRight, MapPin, Search } from "lucide-react";
import ContractorCard from "@/components/marketplace/ContractorCard";
import {
  CANADIAN_MARKETS,
  SERVICE_CATALOG,
  getPublicContractors,
  titleFromSlug,
} from "@/lib/marketplace";

type Params = { province: string; city: string; service: string };

function resolveLocation(params: Params) {
  return CANADIAN_MARKETS.find(
    (market) =>
      market.provinceSlug === params.province && market.citySlug === params.city
  );
}

function resolveService(slug: string) {
  return SERVICE_CATALOG.find((service) => service.slug === slug);
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const market = resolveLocation(params);
  const service = resolveService(params.service);
  const city = market?.city ?? titleFromSlug(params.city);
  const province = market?.province ?? titleFromSlug(params.province);
  const serviceName = service?.name ?? titleFromSlug(params.service);
  const contractors =
    market && service
      ? await getPublicContractors({ city, province, service: params.service, limit: 10 })
      : [];

  const indexable = Boolean(market && service && contractors.length > 0);

  return {
    title: `${serviceName} contractors in ${city}, ${province}`,
    description: `Compare ${serviceName.toLowerCase()} contractors serving ${city}, ${province}. Review service areas, verification, ratings, response time and completed work.`,
    alternates: {
      canonical: `/contractors/${params.province}/${params.city}/${params.service}`,
    },
    robots: indexable ? { index: true, follow: true } : { index: false, follow: true },
  };
}

export const dynamic = "force-dynamic";

export default async function GeoServicePage({ params }: { params: Params }) {
  const market = resolveLocation(params);
  const service = resolveService(params.service);
  const city = market?.city ?? titleFromSlug(params.city);
  const province = market?.province ?? titleFromSlug(params.province);
  const serviceName = service?.name ?? titleFromSlug(params.service);
  const contractors =
    market && service
      ? await getPublicContractors({ city, province, service: params.service })
      : [];

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://handymanpro.ca";
  const pageUrl = `${baseUrl}/contractors/${params.province}/${params.city}/${params.service}`;
  const listSchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `${serviceName} contractors in ${city}`,
    url: pageUrl,
    numberOfItems: contractors.length,
    itemListElement: contractors.map((contractor, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: `${baseUrl}/pro/${contractor.slug}`,
      name: contractor.displayName,
    })),
  };

  return (
    <main>
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
          <nav className="flex flex-wrap items-center gap-1 text-xs font-semibold text-slate-500">
            <Link href="/directory" className="hover:text-slate-950">
              Directory
            </Link>
            <ChevronRight className="h-3.5 w-3.5" />
            <Link href="/contractors" className="hover:text-slate-950">
              Contractors
            </Link>
            <ChevronRight className="h-3.5 w-3.5" />
            <span>{province}</span>
            <ChevronRight className="h-3.5 w-3.5" />
            <span>{city}</span>
          </nav>

          <div className="mt-7 grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
            <div>
              <div className="flex items-center gap-2 text-sm font-bold text-orange-600">
                <MapPin className="h-4 w-4" />
                {city}, {province}
              </div>
              <h1 className="mt-3 text-4xl font-black tracking-tight sm:text-5xl">
                {serviceName} contractors in {city}
              </h1>
              <p className="mt-4 max-w-3xl leading-7 text-slate-600">
                Compare published professionals serving {city}. Rankings prioritize service match,
                verified reputation and operational signals rather than paid placement.
              </p>
            </div>
            <Link
              href={`/hire?service=${params.service}&city=${params.city}&province=${params.province}`}
              className="inline-flex items-center justify-center rounded-xl bg-orange-500 px-5 py-3 text-sm font-black text-white hover:bg-orange-600"
            >
              Post a {serviceName.toLowerCase()} project
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        {contractors.length > 0 ? (
          <>
            <div className="mb-6 flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-600">
                {contractors.length} contractor{contractors.length === 1 ? "" : "s"} currently
                published for this market
              </p>
              <Link
                href={`/contractors?service=${params.service}&city=${encodeURIComponent(city)}&province=${encodeURIComponent(
                  province
                )}`}
                className="text-sm font-bold text-slate-900 hover:text-orange-600"
              >
                Refine search
              </Link>
            </div>
            <div className="grid gap-5 lg:grid-cols-2">
              {contractors.map((contractor) => (
                <ContractorCard key={contractor.id} contractor={contractor} />
              ))}
            </div>
          </>
        ) : (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center">
            <Search className="mx-auto h-10 w-10 text-slate-300" />
            <h2 className="mt-4 text-2xl font-black">
              No published {serviceName.toLowerCase()} profiles in {city} yet.
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-500">
              This page remains accessible for users but is excluded from search indexing until it
              contains real local supply. That avoids generating fake or thin GEO pages.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Link
                href={`/contractors?service=${params.service}`}
                className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-bold"
              >
                Search all cities
              </Link>
              <Link
                href="/register"
                className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-bold text-white"
              >
                List a local business
              </Link>
            </div>
          </div>
        )}
      </section>

      <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="rounded-3xl bg-slate-950 p-8 text-white sm:p-10">
          <h2 className="text-2xl font-black">
            What the directory checks before ranking a profile
          </h2>
          <div className="mt-6 grid gap-5 text-sm text-slate-300 md:grid-cols-3">
            <div>
              <h3 className="font-bold text-white">Service and geography</h3>
              <p className="mt-2 leading-6">
                The contractor must explicitly publish {serviceName.toLowerCase()} and cover {city}
                through its primary location or service-area settings.
              </p>
            </div>
            <div>
              <h3 className="font-bold text-white">Reputation provenance</h3>
              <p className="mt-2 leading-6">
                CRM-verified projects, verified customers and imported reviews are labelled
                separately instead of being mixed into one unexplained score.
              </p>
            </div>
            <div>
              <h3 className="font-bold text-white">Operational performance</h3>
              <p className="mt-2 leading-6">
                Response time, completed projects and profile verification can influence relevance.
                Sponsored placement cannot silently overwrite the organic order.
              </p>
            </div>
          </div>
        </div>
      </section>

      {contractors.length > 0 && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(listSchema) }}
        />
      )}
    </main>
  );
}
