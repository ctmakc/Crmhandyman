import Link from "next/link";
import { BadgeCheck, CheckCircle2, Clock3, MapPin, Star } from "lucide-react";
import type { PublicContractor } from "@/lib/marketplace";

export default function ContractorCard({ contractor }: { contractor: PublicContractor }) {
  const primaryServices = contractor.services.slice(0, 3);
  const initials = contractor.displayName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join("")
    .toUpperCase();

  return (
    <article className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg">
      <div className="flex gap-4">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-slate-900 text-sm font-black text-white">
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

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/pro/${contractor.slug}`}
              className="truncate text-lg font-extrabold text-slate-950 group-hover:text-orange-600"
            >
              {contractor.displayName}
            </Link>
            {contractor.verificationStatus === "VERIFIED" && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-bold text-emerald-700">
                <BadgeCheck className="h-3.5 w-3.5" />
                Verified
              </span>
            )}
          </div>

          <p className="mt-1 line-clamp-2 text-sm leading-5 text-slate-600">
            {contractor.headline || contractor.description || "Local home-service contractor"}
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-medium text-slate-500">
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" />
              {contractor.city}, {contractor.province}
            </span>
            <span className="inline-flex items-center gap-1 text-amber-700">
              <Star className="h-3.5 w-3.5 fill-current" />
              {contractor.reviewCount > 0 ? contractor.averageRating.toFixed(1) : "New"}
              {contractor.reviewCount > 0 && ` (${contractor.reviewCount})`}
            </span>
            {contractor.responseTimeMinutes != null && (
              <span className="inline-flex items-center gap-1">
                <Clock3 className="h-3.5 w-3.5" />
                Replies in about {Math.max(1, Math.round(contractor.responseTimeMinutes / 60))}h
              </span>
            )}
          </div>
        </div>
      </div>

      {primaryServices.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {primaryServices.map((service) => (
            <Link
              key={service.slug}
              href={`/contractors/${contractor.province.toLowerCase().replace(/\s+/g, "-")}/${contractor.city
                .toLowerCase()
                .replace(/\s+/g, "-")}/${service.slug}`}
              className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-orange-50 hover:text-orange-700"
            >
              {service.name}
            </Link>
          ))}
        </div>
      )}

      <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4">
        <div className="flex flex-wrap gap-3 text-xs text-slate-500">
          {contractor.insuranceVerified && (
            <span className="inline-flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
              Insurance checked
            </span>
          )}
          {contractor.completedJobs > 0 && <span>{contractor.completedJobs} completed jobs</span>}
        </div>
        <Link
          href={`/pro/${contractor.slug}`}
          className="rounded-lg bg-slate-950 px-3 py-2 text-xs font-bold text-white hover:bg-orange-600"
        >
          View profile
        </Link>
      </div>
    </article>
  );
}
