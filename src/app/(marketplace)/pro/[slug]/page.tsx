import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  BadgeCheck,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  Star,
  Wrench,
} from "lucide-react";
import { getPublicContractor } from "@/lib/marketplace";

type Params = { slug: string };

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const contractor = await getPublicContractor(params.slug);
  if (!contractor) {
    return {
      title: "Contractor profile not found",
      robots: { index: false, follow: false },
    };
  }

  return {
    title:
      contractor.seoTitle ??
      `${contractor.displayName} | Contractor in ${contractor.city}, ${contractor.province}`,
    description:
      contractor.seoDescription ??
      contractor.description ??
      `View services, verification, service areas and reviews for ${contractor.displayName}.`,
    alternates: { canonical: `/pro/${contractor.slug}` },
    openGraph: {
      title: contractor.displayName,
      description: contractor.headline ?? contractor.description ?? undefined,
      images: contractor.coverUrl ? [contractor.coverUrl] : undefined,
      type: "website",
    },
  };
}

export const dynamic = "force-dynamic";

function reviewLabel(source: string) {
  switch (source) {
    case "VERIFIED_PROJECT":
      return "Verified project";
    case "VERIFIED_CUSTOMER":
      return "Verified customer";
    case "IMPORTED":
      return "Imported review";
    default:
      return "Unverified review";
  }
}

export default async function ContractorProfilePage({ params }: { params: Params }) {
  const contractor = await getPublicContractor(params.slug);
  if (!contractor) notFound();

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://handymanpro.ca";
  const localBusinessSchema = {
    "@context": "https://schema.org",
    "@type": "HomeAndConstructionBusiness",
    "@id": `${baseUrl}/pro/${contractor.slug}#business`,
    name: contractor.displayName,
    url: `${baseUrl}/pro/${contractor.slug}`,
    image: contractor.coverUrl || contractor.logoUrl || undefined,
    logo: contractor.logoUrl || undefined,
    telephone: contractor.phone || undefined,
    email: contractor.publicEmail || undefined,
    address: {
      "@type": "PostalAddress",
      addressLocality: contractor.city,
      addressRegion: contractor.province,
      postalCode: contractor.postalCode || undefined,
      addressCountry: "CA",
    },
    areaServed: contractor.serviceAreas.map((area) => ({
      "@type": "City",
      name: `${area.city}, ${area.province}`,
    })),
    knowsAbout: contractor.services.map((service) => service.name),
    aggregateRating:
      contractor.reviewCount > 0
        ? {
            "@type": "AggregateRating",
            ratingValue: contractor.averageRating,
            reviewCount: contractor.reviewCount,
            bestRating: 5,
            worstRating: 1,
          }
        : undefined,
    review: contractor.reviews
      .filter((review) => review.source !== "UNVERIFIED")
      .slice(0, 10)
      .map((review) => ({
        "@type": "Review",
        author: { "@type": "Person", name: review.authorName },
        datePublished: review.createdAt.toISOString().slice(0, 10),
        reviewBody: review.body,
        reviewRating: {
          "@type": "Rating",
          ratingValue: review.rating,
          bestRating: 5,
          worstRating: 1,
        },
      })),
  };

  const initials = contractor.displayName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join("")
    .toUpperCase();

  return (
    <main>
      <section className="relative min-h-56 overflow-hidden bg-slate-900 text-white">
        {contractor.coverUrl && (
          <div
            className="absolute inset-0 bg-cover bg-center opacity-45"
            style={{ backgroundImage: `url(${contractor.coverUrl})` }}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/65 to-slate-900/30" />
        <div className="relative mx-auto flex max-w-7xl items-end px-4 py-10 sm:px-6">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-end">
            <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-3xl border-4 border-white bg-orange-500 text-2xl font-black shadow-xl">
              {contractor.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={contractor.logoUrl}
                  alt={`${contractor.displayName} logo`}
                  className="h-full w-full object-cover"
                />
              ) : (
                initials
              )}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-3xl font-black tracking-tight sm:text-5xl">
                  {contractor.displayName}
                </h1>
                {contractor.verificationStatus === "VERIFIED" && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-2.5 py-1 text-xs font-bold text-emerald-200">
                    <BadgeCheck className="h-4 w-4" />
                    Verified business
                  </span>
                )}
              </div>
              <p className="mt-2 max-w-3xl text-slate-200">
                {contractor.headline || contractor.description}
              </p>
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-300">
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="h-4 w-4" />
                  {contractor.city}, {contractor.province}
                </span>
                {contractor.reviewCount > 0 && (
                  <span className="inline-flex items-center gap-1.5 text-amber-300">
                    <Star className="h-4 w-4 fill-current" />
                    {contractor.averageRating.toFixed(1)} from {contractor.reviewCount} reviews
                  </span>
                )}
                {contractor.responseTimeMinutes != null && (
                  <span className="inline-flex items-center gap-1.5">
                    <Clock3 className="h-4 w-4" />
                    Typical reply in {Math.max(1, Math.round(contractor.responseTimeMinutes / 60))}h
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-8">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-black">About the business</h2>
            <p className="mt-4 whitespace-pre-line leading-7 text-slate-600">
              {contractor.description || "This contractor has not published a full description yet."}
            </p>
            <div className="mt-6 grid gap-4 border-t border-slate-100 pt-6 sm:grid-cols-3">
              <div>
                <div className="text-2xl font-black">{contractor.completedJobs}</div>
                <div className="text-xs font-semibold text-slate-500">CRM-recorded completed jobs</div>
              </div>
              <div>
                <div className="text-2xl font-black">
                  {contractor.yearsInBusiness ?? "—"}
                </div>
                <div className="text-xs font-semibold text-slate-500">Years in business</div>
              </div>
              <div>
                <div className="text-2xl font-black">{contractor.serviceRadiusKm} km</div>
                <div className="text-xs font-semibold text-slate-500">Default service radius</div>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-2">
              <Wrench className="h-5 w-5 text-orange-500" />
              <h2 className="text-xl font-black">Services</h2>
            </div>
            {contractor.services.length > 0 ? (
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {contractor.services.map((service) => (
                  <div key={service.slug} className="rounded-xl border border-slate-200 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="font-extrabold">{service.name}</h3>
                      {service.isPrimary && (
                        <span className="rounded-full bg-orange-50 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-orange-700">
                          Primary
                        </span>
                      )}
                    </div>
                    {service.description && (
                      <p className="mt-2 text-sm leading-6 text-slate-500">{service.description}</p>
                    )}
                    {service.priceFrom != null && (
                      <p className="mt-3 text-xs font-bold text-slate-700">
                        Typical minimum from ${Math.round(service.priceFrom)}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-4 text-sm text-slate-500">No public services have been added.</p>
            )}
          </section>

          {contractor.portfolio.length > 0 && (
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-black">Recent work</h2>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                {contractor.portfolio.map((item) => (
                  <article key={item.id} className="overflow-hidden rounded-xl border border-slate-200">
                    <div
                      className="aspect-[16/10] bg-slate-100 bg-cover bg-center"
                      style={{ backgroundImage: `url(${item.imageUrl})` }}
                    />
                    <div className="p-4">
                      <h3 className="font-extrabold">{item.title}</h3>
                      {item.description && (
                        <p className="mt-2 text-sm leading-6 text-slate-500">{item.description}</p>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-xl font-black">Customer reviews</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Each review shows how its source was verified.
                </p>
              </div>
              {contractor.reviewCount > 0 && (
                <div className="text-right">
                  <div className="text-3xl font-black">{contractor.averageRating.toFixed(1)}</div>
                  <div className="text-xs text-slate-500">{contractor.reviewCount} reviews</div>
                </div>
              )}
            </div>

            {contractor.reviews.length > 0 ? (
              <div className="mt-6 space-y-4">
                {contractor.reviews.map((review) => (
                  <article key={review.id} className="rounded-xl bg-slate-50 p-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="font-extrabold">{review.authorName}</div>
                        <div className="mt-1 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                          {reviewLabel(review.source)}
                        </div>
                      </div>
                      <div className="flex text-amber-500" aria-label={`${review.rating} out of 5`}>
                        {Array.from({ length: 5 }).map((_, index) => (
                          <Star
                            key={index}
                            className={`h-4 w-4 ${index < review.rating ? "fill-current" : "text-slate-200"}`}
                          />
                        ))}
                      </div>
                    </div>
                    {review.title && <h3 className="mt-4 font-bold">{review.title}</h3>}
                    <p className="mt-2 text-sm leading-6 text-slate-600">{review.body}</p>
                  </article>
                ))}
              </div>
            ) : (
              <p className="mt-5 text-sm text-slate-500">No public reviews yet.</p>
            )}
          </section>
        </div>

        <aside className="space-y-5">
          <div className="sticky top-24 space-y-5">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-black">Request an estimate</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                Send one structured project request. Your contact details are not published.
              </p>
              <Link
                href={`/hire?contractor=${contractor.slug}`}
                className="mt-5 flex w-full items-center justify-center rounded-xl bg-orange-500 px-4 py-3 text-sm font-black text-white hover:bg-orange-600"
              >
                Start project request
              </Link>

              <div className="mt-5 space-y-3 border-t border-slate-100 pt-5 text-sm">
                {contractor.phone && (
                  <a href={`tel:${contractor.phone}`} className="flex items-center gap-3 hover:text-orange-600">
                    <Phone className="h-4 w-4 text-slate-400" />
                    {contractor.phone}
                  </a>
                )}
                {contractor.publicEmail && (
                  <a
                    href={`mailto:${contractor.publicEmail}`}
                    className="flex items-center gap-3 hover:text-orange-600"
                  >
                    <Mail className="h-4 w-4 text-slate-400" />
                    {contractor.publicEmail}
                  </a>
                )}
                {contractor.website && (
                  <a
                    href={contractor.website}
                    target="_blank"
                    rel="nofollow noopener noreferrer"
                    className="flex items-center gap-3 hover:text-orange-600"
                  >
                    <ExternalLink className="h-4 w-4 text-slate-400" />
                    Company website
                  </a>
                )}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2 font-black">
                <ShieldCheck className="h-5 w-5 text-emerald-600" />
                Verification
              </div>
              <div className="mt-4 space-y-3 text-sm">
                {[
                  ["Identity", contractor.identityVerified],
                  ["Insurance", contractor.insuranceVerified],
                  ["Licence", contractor.licenceVerified],
                ].map(([label, verified]) => (
                  <div key={String(label)} className="flex items-center justify-between">
                    <span className="text-slate-600">{String(label)}</span>
                    <span
                      className={`inline-flex items-center gap-1 text-xs font-bold ${
                        verified ? "text-emerald-700" : "text-slate-400"
                      }`}
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      {verified ? "Checked" : "Not checked"}
                    </span>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="font-black">Service area</h2>
              <div className="mt-4 space-y-2 text-sm text-slate-600">
                {contractor.serviceAreas.length > 0 ? (
                  contractor.serviceAreas.map((area) => (
                    <div key={`${area.city}-${area.province}-${area.postalPrefix ?? ""}`}>
                      {area.city}, {area.province}
                      {area.postalPrefix ? ` · ${area.postalPrefix}` : ""}
                    </div>
                  ))
                ) : (
                  <div>
                    {contractor.city}, {contractor.province} and nearby communities
                  </div>
                )}
              </div>
            </section>
          </div>
        </aside>
      </div>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(localBusinessSchema) }}
      />
    </main>
  );
}
