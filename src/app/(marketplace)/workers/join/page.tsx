import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck, UserRoundPlus } from "lucide-react";
import WorkerJoinForm from "@/components/marketplace/WorkerJoinForm";

export const metadata: Metadata = {
  title: "Create a worker profile",
  description:
    "Create an opt-in skilled trade worker profile. Private legal name, email, phone and resume links remain excluded from public pages.",
  alternates: { canonical: "/workers/join" },
  robots: { index: false, follow: true },
};

export default function WorkerJoinPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
      <Link href="/workers" className="text-sm font-bold text-slate-500 hover:text-slate-900">
        ← Back to worker directory
      </Link>

      <div className="mt-8 grid gap-10 lg:grid-cols-[0.72fr_1.28fr]">
        <aside>
          <div className="sticky top-24">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-100 text-blue-700">
              <UserRoundPlus className="h-6 w-6" />
            </div>
            <h1 className="mt-5 text-4xl font-black tracking-tight">Publish your trade profile.</h1>
            <p className="mt-4 leading-7 text-slate-600">
              Create a searchable profile for employment, gigs and subcontract work without exposing
              your private contact details.
            </p>

            <div className="mt-8 space-y-5 text-sm leading-6 text-slate-600">
              <div className="flex gap-3">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                <div>
                  <h2 className="font-black text-slate-900">Email verification required</h2>
                  <p>A draft cannot enter the directory until the private email owner confirms it.</p>
                </div>
              </div>
              <div className="flex gap-3">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                <div>
                  <h2 className="font-black text-slate-900">Contact stays private</h2>
                  <p>Employers send introductions through HandymanPro. You decide whether to reply.</p>
                </div>
              </div>
              <div className="flex gap-3">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                <div>
                  <h2 className="font-black text-slate-900">You control visibility</h2>
                  <p>Use a 30-minute magic link to update or hide the profile at any time.</p>
                </div>
              </div>
            </div>

            <Link
              href="/workers/manage"
              className="mt-8 inline-flex rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black"
            >
              Already have a profile? Manage it
            </Link>
          </div>
        </aside>

        <section>
          <WorkerJoinForm />
        </section>
      </div>
    </main>
  );
}
