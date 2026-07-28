import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BadgeCheck, BriefcaseBusiness, CalendarDays, MapPin } from "lucide-react";
import { formatCompensation, getPublicVacancy, titleFromSlug } from "@/lib/marketplace";

type Params = { slug: string };

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const vacancy = await getPublicVacancy(params.slug);
  if (!vacancy) return { title: "Job not found", robots: { index: false, follow: false } };

  return {
    title: `${vacancy.title} at ${vacancy.company.name} | ${vacancy.city}`,
    description: vacancy.description.slice(0, 155),
    alternates: { canonical: `/jobs/${vacancy.slug}` },
  };
}

export const dynamic = "force-dynamic";

function googleEmploymentType(type: string) {
  switch (type) {
    case "FULL_TIME":
      return "FULL_TIME";
    case "PART_TIME":
      return "PART_TIME";
    case "TEMPORARY":
    case "GIG":
      return "TEMPORARY";
    case "CONTRACT":
    case "SUBCONTRACT":
      return "CONTRACTOR";
    default:
      return "OTHER";
  }
}

export default async function JobPage({ params }: { params: Params }) {
  const vacancy = await getPublicVacancy(params.slug);
  if (!vacancy) notFound();

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://handymanpro.ca";
  const jobSchema = {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: vacancy.title,
    description: vacancy.description,
    identifier: {
      "@type": "PropertyValue",
      name: vacancy.company.name,
      value: vacancy.id,
    },
    datePosted: vacancy.createdAt.toISOString(),
    validThrough: vacancy.validThrough?.toISOString(),
    employmentType: googleEmploymentType(vacancy.employmentType),
    hiringOrganization: {
      "@type": "Organization",
      name: vacancy.company.name,
      sameAs: `${baseUrl}/pro/${vacancy.company.slug}`,
      logo: vacancy.company.logoUrl || undefined,
    },
    jobLocation: {
      "@type": "Place",
      address: {
        "@type": "PostalAddress",
        addressLocality: vacancy.city,
        addressRegion: vacancy.province,
        addressCountry: "CA",
      },
    },
    baseSalary:
      vacancy.compensationMin != null || vacancy.compensationMax != null
        ? {
            "@type": "MonetaryAmount",
            currency: "CAD",
            value: {
              "@type": "QuantitativeValue",
              minValue: vacancy.compensationMin || undefined,
              maxValue: vacancy.compensationMax || undefined,
              unitText: vacancy.compensationUnit,
            },
          }
        : undefined,
    url: `${baseUrl}/jobs/${vacancy.slug}`,
  };

  return (
    <main className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
      <div className="grid gap-8 lg:grid-cols-[1fr_300px]">
        <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black uppercase tracking-wider text-blue-700">
              {titleFromSlug(vacancy.employmentType.toLowerCase())}
            </span>
            {vacancy.company.verificationStatus === "VERIFIED" && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">
                <BadgeCheck className="h-4 w-4" />
                Verified employer
              </span>
            )}
          </div>

          <h1 className="mt-5 text-4xl font-black tracking-tight">{vacancy.title}</h1>
          <Link
            href={`/pro/${vacancy.company.slug}`}
            className="mt-3 inline-block text-lg font-bold text-slate-600 hover:text-orange-600"
          >
            {vacancy.company.name}
          </Link>

          <div className="mt-5 flex flex-wrap gap-4 text-sm font-semibold text-slate-500">
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="h-4 w-4" />
              {vacancy.city}, {vacancy.province}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <BriefcaseBusiness className="h-4 w-4" />
              {titleFromSlug(vacancy.serviceSlug)}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays className="h-4 w-4" />
              Posted {vacancy.createdAt.toLocaleDateString("en-CA")}
            </span>
          </div>

          {formatCompensation(vacancy) && (
            <div className="mt-6 rounded-xl bg-slate-950 px-5 py-4 text-lg font-black text-white">
              {formatCompensation(vacancy)}
            </div>
          )}

          <div className="mt-8 border-t border-slate-100 pt-8">
            <h2 className="text-xl font-black">Job description</h2>
            <p className="mt-4 whitespace-pre-line leading-7 text-slate-600">
              {vacancy.description}
            </p>
          </div>
        </article>

        <aside>
          <div className="sticky top-24 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="font-black">Apply through the company</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Candidate accounts and private resumes are the next workflow. For now, applications
              are routed through the verified contractor profile.
            </p>
            <Link
              href={`/pro/${vacancy.company.slug}`}
              className="mt-5 flex w-full justify-center rounded-xl bg-orange-500 px-4 py-3 text-sm font-black text-white"
            >
              Open company profile
            </Link>
          </div>
        </aside>
      </div>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jobSchema) }}
      />
    </main>
  );
}
