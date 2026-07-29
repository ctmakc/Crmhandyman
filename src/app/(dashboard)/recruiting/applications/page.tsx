import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import ApplicationsManager from "@/components/recruiting/ApplicationsManager";

export const metadata: Metadata = {
  title: "Job Applications",
};

export default function RecruitingApplicationsPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6">
        <Link
          href="/recruiting"
          className="inline-flex items-center text-sm font-bold text-slate-500 hover:text-slate-900"
        >
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          Back to vacancies
        </Link>
        <p className="mt-6 text-xs font-black uppercase tracking-[0.18em] text-blue-600">
          Private candidate pipeline
        </p>
        <h1 className="mt-2 text-3xl font-black text-slate-950">Applications</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
          Search candidates across skills, experience, city and vacancy. Applications remain tenant
          private and are also available in the standard lead pipeline with source `JOB_BOARD`.
        </p>
      </div>
      <ApplicationsManager />
    </div>
  );
}
