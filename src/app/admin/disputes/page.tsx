import type { Metadata } from "next";
import { redirect } from "next/navigation";
import NetworkDisputesManager from "@/components/network/NetworkDisputesManager";
import { getAppSessionUser } from "@/lib/session";
import { isSuperAdminEmail } from "@/lib/super-admin";

export const metadata: Metadata = {
  title: "Dispute Moderation",
  robots: { index: false, follow: false, noarchive: true },
};

export default async function DisputeModerationPage() {
  const user = await getAppSessionUser();
  if (!user) redirect("/login?callbackUrl=/admin/disputes");
  if (!isSuperAdminEmail(user.email)) redirect("/app");

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-7xl">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-violet-600">
          Super-admin moderation
        </p>
        <h1 className="mt-2 text-3xl font-black text-slate-950">Lead network disputes</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
          Review all cases across tenants, request information, resolve with or without a ledger
          refund, and monitor overdue SLA commitments.
        </p>
        <div className="mt-8">
          <NetworkDisputesManager allCases />
        </div>
      </div>
    </main>
  );
}
