import type { Metadata } from "next";
import { redirect } from "next/navigation";
import AdminEmailOutbox from "@/components/admin/AdminEmailOutbox";
import { getAppSessionUser } from "@/lib/session";
import { isSuperAdminEmail } from "@/lib/super-admin";

export const metadata: Metadata = {
  title: "Email Delivery Operations",
  robots: { index: false, follow: false, noarchive: true },
};

export default async function EmailDeliveryOperationsPage() {
  const user = await getAppSessionUser();
  if (!user) redirect("/login?callbackUrl=/admin/email");
  if (!isSuperAdminEmail(user.email)) redirect("/app");

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-7xl">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-violet-600">
          Super-admin delivery operations
        </p>
        <h1 className="mt-2 text-3xl font-black text-slate-950">Email outbox</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
          Monitor persisted outbound messages, inspect delivery failures, retry individual emails and
          process due queue entries without losing the original idempotency record.
        </p>
        <div className="mt-8">
          <AdminEmailOutbox />
        </div>
      </div>
    </main>
  );
}
