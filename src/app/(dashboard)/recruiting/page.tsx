import type { Metadata } from "next";
import Link from "next/link";
import { UserRoundSearch } from "lucide-react";
import RecruitingManager from "@/components/recruiting/RecruitingManager";

export const metadata: Metadata = {
  title: "Recruiting",
};

export default function RecruitingPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-blue-600">
            Jobs and subcontractors
          </p>
          <h1 className="mt-2 text-3xl font-black text-slate-950">Recruiting</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
            Create permanent roles, temporary work, day gigs and subcontractor requests. Published
            vacancies appear in the public jobs index and receive structured job-search metadata.
          </p>
        </div>
        <Link
          href="/recruiting/applications"
          className="inline-flex shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-800 shadow-sm hover:border-blue-300 hover:text-blue-700"
        >
          <UserRoundSearch className="mr-2 h-4 w-4" />
          Search applications
        </Link>
      </div>
      <RecruitingManager />
    </div>
  );
}
