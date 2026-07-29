import type { Metadata } from "next";
import { redirect } from "next/navigation";
import AdminAuditConsole from "@/components/admin/AdminAuditConsole";
import { getAppSessionUser } from "@/lib/session";
import { isSuperAdminEmail } from "@/lib/super-admin";

export const metadata: Metadata = {
  title: "Audit and Webhook Operations",
  robots: { index: false, follow: false, noarchive: true },
};

export default async function AuditOperationsPage() {
  const user = await getAppSessionUser();
  if (!user) redirect("/login?callbackUrl=/admin/audit");
  if (!isSuperAdminEmail(user.email)) redirect("/app");

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-7xl">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-violet-600">
          Super-admin observability
        </p>
        <h1 className="mt-2 text-3xl font-black text-slate-950">Audit and webhooks</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
          Review append-only privileged actions and signed webhook delivery receipts without storing
          raw payment payloads or plaintext request IP addresses.
        </p>
        <div className="mt-8">
          <AdminAuditConsole />
        </div>
      </div>
    </main>
  );
}
