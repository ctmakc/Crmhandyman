import Link from "next/link";
import {
  BadgeCheck,
  BriefcaseBusiness,
  CarFront,
  MapPin,
  ShieldAlert,
  Wrench,
} from "lucide-react";
import { titleFromSlug } from "@/lib/marketplace-config";
import { formatWorkerRate, type PublicWorker } from "@/lib/workers";

export default function WorkerCard({ worker }: { worker: PublicWorker }) {
  const initials = worker.publicName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join("")
    .toUpperCase();

  return (
    <article className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg">
      <div className="flex gap-4">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-sm font-black text-white">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/worker/${worker.slug}`}
              className="truncate text-lg font-extrabold text-slate-950 group-hover:text-blue-700"
            >
              {worker.publicName}
            </Link>
            {worker.verificationStatus === "VERIFIED" ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-emerald-700">
                <BadgeCheck className="h-3.5 w-3.5" />
                Verified
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-amber-700">
                <ShieldAlert className="h-3.5 w-3.5" />
                Self-reported
              </span>
            )}
          </div>
          <p className="mt-1 line-clamp-2 text-sm leading-5 text-slate-600">{worker.headline}</p>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs font-semibold text-slate-500">
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" />
              {worker.city}, {worker.province}
            </span>
            {worker.yearsExperience != null && (
              <span>{worker.yearsExperience} years experience</span>
            )}
            {formatWorkerRate(worker) && <span>{formatWorkerRate(worker)}</span>}
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {worker.skills.slice(0, 5).map((skill) => (
          <Link
            key={skill.slug}
            href={`/workers?skill=${encodeURIComponent(skill.slug)}`}
            className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-blue-50 hover:text-blue-700"
          >
            {skill.name}
          </Link>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1">
          <BriefcaseBusiness className="h-3.5 w-3.5" />
          {worker.employmentTypes.slice(0, 3).map((value) => titleFromSlug(value.toLowerCase())).join(" · ")}
        </span>
        {worker.hasVehicle && (
          <span className="inline-flex items-center gap-1">
            <CarFront className="h-3.5 w-3.5 text-emerald-600" />
            Vehicle
          </span>
        )}
        {worker.hasTools && (
          <span className="inline-flex items-center gap-1">
            <Wrench className="h-3.5 w-3.5 text-emerald-600" />
            Own tools
          </span>
        )}
      </div>

      <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4">
        <span className="text-xs text-slate-500">
          Contacts stay private until a platform-mediated inquiry.
        </span>
        <Link
          href={`/worker/${worker.slug}`}
          className="rounded-lg bg-slate-950 px-3 py-2 text-xs font-black text-white hover:bg-blue-700"
        >
          View profile
        </Link>
      </div>
    </article>
  );
}
