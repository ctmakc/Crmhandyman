import type { Metadata } from "next";
import { redirect } from "next/navigation";
import AdminCreditsManager from "@/components/admin/AdminCreditsManager";
import { getAppSessionUser } from "@/lib/session";

export const metadata: Metadata = {
  title: "Credit Administration",
  robots: { index: false, follow: false, noarchive: true },
};

function superAdminEmails() {
  return new Set(
    (process.env.SUPER_ADMIN_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean)
  );
}

export default async function CreditAdministrationPage() {
  const user = await getAppSessionUser();
  if (!user) redirect("/login?callbackUrl=/admin/credits");
  if (!superAdminEmails().has(user.email.toLowerCase())) redirect("/app");

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-7xl">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-amber-600">
          Super-admin operations
        </p>
        <h1 className="mt-2 text-3xl font-black text-slate-950">Credit wallets</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
          Review tenant balances and write idempotent purchase or adjustment entries. Every operation
          persists the resulting balance in the immutable credit ledger.
        </p>
        <div className="mt-8">
          <AdminCreditsManager />
        </div>
      </div>
    </main>
  );
}
