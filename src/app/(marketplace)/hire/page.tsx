import type { Metadata } from "next";
import { CheckCircle2, LockKeyhole, Route, ShieldCheck } from "lucide-react";
import JobRequestForm from "@/components/marketplace/JobRequestForm";
import { titleFromSlug } from "@/lib/marketplace";

export const metadata: Metadata = {
  title: "Post a home-service project | HandymanPro Network",
  description:
    "Describe your project once and route it to suitable contractors by trade, service area and availability. Contact details stay private until matching.",
  alternates: { canonical: "/hire" },
};

type SearchParams = {
  service?: string;
  city?: string;
  province?: string;
  contractor?: string;
};

export default function HirePage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <main className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <div className="grid gap-10 lg:grid-cols-[0.75fr_1.25fr]">
        <aside>
          <div className="sticky top-24">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-orange-600">
              Structured project intake
            </p>
            <h1 className="mt-3 text-4xl font-black tracking-tight sm:text-5xl">
              Tell the network what needs to be done.
            </h1>
            <p className="mt-5 leading-7 text-slate-600">
              The request is stored as a marketplace job, not published as a classified ad. Matching
              uses service, city, urgency and contractor coverage.
            </p>

            {searchParams.contractor && (
              <div className="mt-5 rounded-xl border border-orange-200 bg-orange-50 p-4 text-sm text-orange-900">
                Preferred profile: <strong>{titleFromSlug(searchParams.contractor)}</strong>
              </div>
            )}

            <div className="mt-8 space-y-5">
              {[
                {
                  icon: LockKeyhole,
                  title: "Private contact data",
                  text: "Email, phone and exact location are never placed on public project pages.",
                },
                {
                  icon: Route,
                  title: "Relevant routing",
                  text: "Requests can be matched by service, city, radius, urgency and availability.",
                },
                {
                  icon: ShieldCheck,
                  title: "Consent recorded",
                  text: "The backend requires explicit permission before contact details can be shared.",
                },
                {
                  icon: CheckCircle2,
                  title: "CRM-ready",
                  text: "A matched request can be converted into a tenant lead and then a project.",
                },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.title} className="flex gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-950 text-white">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <h2 className="font-extrabold">{item.title}</h2>
                      <p className="mt-1 text-sm leading-6 text-slate-500">{item.text}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </aside>

        <section>
          <JobRequestForm
            defaultService={searchParams.service}
            defaultCity={searchParams.city ? titleFromSlug(searchParams.city) : ""}
            defaultProvince={searchParams.province ? titleFromSlug(searchParams.province) : ""}
            preferredContractor={searchParams.contractor}
          />
        </section>
      </div>
    </main>
  );
}
