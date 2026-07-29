import type { Metadata } from "next";
import Link from "next/link";
import { Crosshair, MapPin, Search } from "lucide-react";
import ContractorCard from "@/components/marketplace/ContractorCard";
import NearbyContractorSearch from "@/components/marketplace/NearbyContractorSearch";
import { validCoordinates } from "@/lib/geo";
import { SERVICE_CATALOG } from "@/lib/marketplace-config";
import { findNearbyContractors } from "@/lib/nearby-contractors";

type SearchParams = {
  latitude?: string;
  longitude?: string;
  postalCode?: string;
  city?: string;
  province?: string;
  service?: string;
  radiusKm?: string;
};

export function generateMetadata({ searchParams }: { searchParams: SearchParams }): Metadata {
  const hasSearch = Boolean(
    searchParams.latitude || searchParams.postalCode || searchParams.city || searchParams.service
  );

  return {
    title: "Find contractors near me in Canada",
    description:
      "Search published Canadian contractor profiles by browser location, service radius, city or postal/FSA coverage.",
    alternates: { canonical: "/contractors/nearby" },
    robots: hasSearch ? { index: false, follow: true } : { index: true, follow: true },
  };
}

export const dynamic = "force-dynamic";

export default async function NearbyContractorsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const coordinates = validCoordinates(searchParams.latitude, searchParams.longitude);
  const radiusRaw = Number(searchParams.radiusKm || 50);
  const radiusKm = Number.isFinite(radiusRaw) ? Math.min(Math.max(radiusRaw, 1), 250) : 50;
  const hasOrigin = Boolean(coordinates || searchParams.postalCode || searchParams.city);
  const matches = hasOrigin
    ? await findNearbyContractors({
        coordinates,
        postalCode: searchParams.postalCode,
        city: searchParams.city,
        province: searchParams.province,
        service: searchParams.service,
        radiusKm,
      })
    : [];
  const serviceName =
    SERVICE_CATALOG.find((service) => service.slug === searchParams.service)?.name ?? null;

  const originLabel = coordinates
    ? `your approximate location within ${radiusKm} km`
    : searchParams.postalCode
      ? `postal area ${searchParams.postalCode.toUpperCase()}`
      : searchParams.city
        ? `${searchParams.city}${searchParams.province ? `, ${searchParams.province}` : ""}`
        : "your area";

  return (
    <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <section className="rounded-3xl bg-slate-950 px-6 py-10 text-white sm:px-10">
        <div className="max-w-3xl">
          <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-orange-300">
            <Crosshair className="h-4 w-4" />
            Radius and postal coverage
          </p>
          <h1 className="mt-3 text-4xl font-black tracking-tight sm:text-5xl">
            Find contractors near you.
          </h1>
          <p className="mt-4 leading-7 text-slate-300">
            Results use contractor service radius, stored coordinates, supported city centroids and
            Canadian postal-prefix coverage. Precise browser coordinates are used only in the current
            request and are not saved by this search page.
          </p>
        </div>
      </section>

      <section className="mt-8">
        <NearbyContractorSearch
          defaultPostalCode={searchParams.postalCode}
          defaultCity={searchParams.city}
          defaultProvince={searchParams.province}
          defaultService={searchParams.service}
          defaultRadiusKm={radiusKm}
        />
      </section>

      <section className="mt-10">
        <div className="flex flex-col justify-between gap-3 border-b border-slate-200 pb-6 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-orange-600">
              Nearby service coverage
            </p>
            <h2 className="mt-2 text-3xl font-black tracking-tight">
              {hasOrigin
                ? `${matches.length} contractor match${matches.length === 1 ? "" : "es"}`
                : "Choose a location to search"}
            </h2>
            {hasOrigin && (
              <p className="mt-2 text-sm text-slate-500">
                {serviceName ? `${serviceName} around ` : "Published contractors around "}
                {originLabel}
              </p>
            )}
          </div>
          <Link
            href="/hire"
            className="inline-flex rounded-xl bg-orange-500 px-4 py-3 text-sm font-black text-white"
          >
            Post a project instead
          </Link>
        </div>

        {!hasOrigin ? (
          <div className="mt-8 rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center">
            <MapPin className="mx-auto h-10 w-10 text-slate-300" />
            <h3 className="mt-4 text-xl font-black">No location selected</h3>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">
              Use approximate browser location or enter a Canadian postal code, city or province.
            </p>
          </div>
        ) : matches.length > 0 ? (
          <div className="mt-6 grid gap-5 lg:grid-cols-2">
            {matches.map((match) => (
              <div key={match.contractor.id} className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-600">
                  <span>
                    Match: {match.matchReason === "DISTANCE" ? "service radius" : match.matchReason === "POSTAL" ? "postal coverage" : "city coverage"}
                  </span>
                  {match.distanceKm != null && <span>{match.distanceKm.toFixed(1)} km approximate</span>}
                </div>
                <ContractorCard contractor={match.contractor} />
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-8 rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center">
            <Search className="mx-auto h-10 w-10 text-slate-300" />
            <h3 className="mt-4 text-xl font-black">No published contractor coverage found.</h3>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">
              Increase the radius, remove the service filter or post the project for network matching.
              Empty nearby searches are not indexable.
            </p>
          </div>
        )}
      </section>
    </main>
  );
}
