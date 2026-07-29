import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  BadgeCheck,
  BriefcaseBusiness,
  CarFront,
  Languages,
  MapPin,
  ShieldAlert,
  ShieldCheck,
  Wrench,
} from "lucide-react";
import WorkerInquiryForm from "@/components/marketplace/WorkerInquiryForm";
import { titleFromSlug } from "@/lib/marketplace-config";
import { getAppSessionUser } from "@/lib/session";
import { formatWorkerRate, getPublicWorker } from "@/lib/workers";

type Params = { slug: string };

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const worker = await getPublicWorker(params.slug);
  if (!worker) return { title: "Worker profile not found", robots: { index: false, follow: false } };

  return {
    title: `${worker.publicName} | ${worker.headline}`,
    description: `${worker.headline}. ${worker.skills.map((skill) => skill.name).slice(0, 4).join(", ")} in ${worker.city}, ${worker.province}.`,
    alternates: { canonical: `/worker/${worker.slug}` },
  };
}

export const dynamic = "force-dynamic";

export default async function WorkerProfilePage({ params }: { params: Params }) {
  const [worker, sessionUser] = await Promise.all([
    getPublicWorker(params.slug),
    getAppSessionUser(),
  ]);
  if (!worker) notFound();

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://handymanpro.ca";
  const schema = {
    "@context": "https://schema.org",
    "@type": "Person",
    "@id": `${baseUrl}/worker/${worker.slug}#worker`,
    name: worker.publicName,
    url: `${baseUrl}/worker/${worker.slug}`,
    jobTitle: worker.headline,
    description: worker.summary,
    address: {
      "@type": "PostalAddress",
      addressLocality: worker.city,
      addressRegion: worker.province,
      addressCountry: "CA",
    },
    knowsAbout: worker.skills.map((skill) => skill.name),
    knowsLanguage: worker.languages.split(",").map((language) => language.trim()).filter(Boolean),
    hasOccupation: {
      "@type": "Occupation",
      name: worker.headline,
      experienceRequirements:
        worker.yearsExperience != null ? `${worker.yearsExperience} years` : undefined,
      skills: worker.skills.map((skill) => skill.name).join(", "),
    },
  };

  const initials = worker.publicName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join("")
    .toUpperCase();

  return (
    <main>
      <section className="bg-blue-800 text-white">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
          <Link href="/workers" className="text-sm font-bold text-blue-200 hover:text-white">
            ← Back to worker directory
          </Link>
          <div className="mt-8 flex flex-col gap-5 sm:flex-row sm:items-center">
            <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-3xl border-4 border-white/20 bg-white text-2xl font-black text-blue-800 shadow-xl">
              {initials}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-4xl font-black tracking-tight sm:text-5xl">{worker.publicName}</h1>
                {worker.verificationStatus === "VERIFIED" ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-400/15 px-3 py-1 text-xs font-black text-emerald-200">
                    <BadgeCheck className="h-4 w-4" />
                    Verified worker
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-300/15 px-3 py-1 text-xs font-black text-amber-200">
                    <ShieldAlert className="h-4 w-4" />
                    Self-reported profile
                  </span>
                )}
              </div>
              <p className="mt-3 max-w-3xl text-lg leading-8 text-blue-100">{worker.headline}</p>
              <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm font-semibold text-blue-100">
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="h-4 w-4" />
                  {worker.city}, {worker.province}
                </span>
                {worker.yearsExperience != null && (
                  <span>{worker.yearsExperience} years experience</span>
                )}
                {formatWorkerRate(worker) && <span>{formatWorkerRate(worker)}</span>}
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-8">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-black">Professional summary</h2>
            <p className="mt-4 whitespace-pre-line leading-7 text-slate-600">{worker.summary}</p>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-2">
              <Wrench className="h-5 w-5 text-blue-600" />
              <h2 className="text-xl font-black">Skills</h2>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {worker.skills.map((skill) => (
                <div key={skill.slug} className="rounded-xl border border-slate-200 p-4">
                  <h3 className="font-extrabold">{skill.name}</h3>
                  {skill.yearsExperience != null && (
                    <p className="mt-1 text-xs text-slate-500">
                      Up to {skill.yearsExperience} years self-reported experience
                    </p>
                  )}
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-black">Work preferences</h2>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl bg-slate-50 p-4">
                <div className="flex items-center gap-2 font-extrabold">
                  <BriefcaseBusiness className="h-4 w-4 text-blue-600" />
                  Work types
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {worker.employmentTypes
                    .map((type) => titleFromSlug(type.toLowerCase()))
                    .join(", ")}
                </p>
              </div>
              <div className="rounded-xl bg-slate-50 p-4">
                <div className="flex items-center gap-2 font-extrabold">
                  <Languages className="h-4 w-4 text-blue-600" />
                  Languages
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-600">{worker.languages}</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-4">
                <h3 className="font-extrabold">Availability</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {worker.availability || "Not specified"}
                </p>
              </div>
              <div className="rounded-xl bg-slate-50 p-4">
                <h3 className="font-extrabold">Equipment and mobility</h3>
                <div className="mt-2 flex flex-wrap gap-3 text-sm text-slate-600">
                  <span className="inline-flex items-center gap-1">
                    <CarFront className="h-4 w-4" />
                    {worker.hasVehicle ? "Has vehicle" : "Vehicle not stated"}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Wrench className="h-4 w-4" />
                    {worker.hasTools ? "Has own tools" : "Tools not stated"}
                  </span>
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
            <div className="flex gap-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
              <div>
                <h2 className="font-black text-amber-950">Profile provenance</h2>
                <p className="mt-2 text-sm leading-6 text-amber-900">
                  This worker explicitly opted into public visibility. Skills, experience, rates and
                  availability are self-reported unless the profile carries a verified badge. Legal
                  name, email, phone and resume links are excluded from this page and the public API.
                </p>
              </div>
            </div>
          </section>
        </div>

        <aside>
          <div className="sticky top-24">
            <WorkerInquiryForm
              workerSlug={worker.slug}
              workerName={worker.publicName}
              canInquire={sessionUser?.role === "ADMIN"}
              defaultName={sessionUser?.name ?? ""}
              defaultEmail={sessionUser?.email ?? ""}
            />
          </div>
        </aside>
      </div>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
    </main>
  );
}
