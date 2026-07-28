"use client";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";

interface Tenant {
  id: string;
  slug: string;
  businessName: string;
  ownerEmail: string;
  plan: "DEMO" | "PAID";
  expiresAt: string | null;
  createdAt: string;
  _count: { users: number; leads: number; projects: number };
}

export default function SuperAdminPage() {
  const { data: session } = useSession();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/admin/tenants")
      .then(r => r.json())
      .then(d => { setTenants(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => { setError("Failed to load"); setLoading(false); });
  }, []);

  async function upgrade(id: string) {
    await fetch("/api/admin/tenants", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, plan: "PAID", expiresAt: null }),
    });
    setTenants(prev => prev.map(t => t.id === id ? { ...t, plan: "PAID", expiresAt: null } : t));
  }

  async function deleteTenant(id: string, name: string) {
    if (!confirm(`Delete tenant "${name}" and ALL their data? This cannot be undone.`)) return;
    await fetch(`/api/admin/tenants?id=${id}`, { method: "DELETE" });
    setTenants(prev => prev.filter(t => t.id !== id));
  }

  const email = (session?.user as { email?: string })?.email || "";
  const superAdminEmails = process.env.NEXT_PUBLIC_SUPER_ADMIN_EMAILS || "";

  return (
    <div className="min-h-screen bg-navy-900 p-6 text-plate">
      <div className="max-w-6xl mx-auto">
        <div className="mono text-[11px] uppercase tracking-[0.12em] text-ink-rail">Operator console</div>
        <h1 className="mt-2 text-[28px] font-black leading-none tracking-tight">Tenants</h1>
        <p className="mono mb-7 mt-2 text-[12px] text-ink-rail">{email}</p>

        {loading && <p className="mono text-[12px] text-ink-rail">Loading…</p>}
        {error && <p className="mono text-[12px]" style={{ color: "var(--rose)" }}>{error}</p>}
        {!superAdminEmails && (
          <div className="mb-4 border-l-2 py-1.5 pl-3 text-[13px]" style={{ borderColor: "var(--amber)", color: "var(--amber)" }}>
            Set SUPER_ADMIN_EMAILS in .env to grant access to this panel.
          </div>
        )}

        <div className="overflow-hidden border border-navy-700 bg-navy-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-navy-700">
                <th className="mono p-4 text-left text-[11px] uppercase tracking-[0.09em] text-ink-rail">Tenant</th>
                <th className="mono p-4 text-left text-[11px] uppercase tracking-[0.09em] text-ink-rail">Owner</th>
                <th className="mono p-4 text-left text-[11px] uppercase tracking-[0.09em] text-ink-rail">Plan</th>
                <th className="mono p-4 text-left text-[11px] uppercase tracking-[0.09em] text-ink-rail">Data</th>
                <th className="mono p-4 text-left text-[11px] uppercase tracking-[0.09em] text-ink-rail">Created</th>
                <th className="mono p-4 text-right text-[11px] uppercase tracking-[0.09em] text-ink-rail">Actions</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map(t => {
                const expired = t.plan === "DEMO" && t.expiresAt && new Date(t.expiresAt) < new Date();
                const daysLeft = t.expiresAt
                  ? Math.max(0, Math.ceil((new Date(t.expiresAt).getTime() - Date.now()) / 86400000))
                  : null;
                return (
                  <tr key={t.id} className="border-b border-navy-700 transition-colors duration-[140ms] hover:bg-navy-700/40">
                    <td className="p-4">
                      <div className="font-medium">{t.businessName}</div>
                      <div className="mono text-[11px] text-ink-rail">{t.slug}</div>
                    </td>
                    <td className="mono p-4 text-[12px] text-ink-rail">{t.ownerEmail}</td>
                    <td className="p-4">
                      <span
                        className="mono text-[11px] uppercase tracking-[0.08em]"
                        style={{
                          color:
                            t.plan === "PAID"
                              ? "var(--emerald-ink)"
                              : expired
                                ? "var(--rose)"
                                : "var(--amber)",
                        }}
                      >
                        {t.plan === "PAID" ? "Paid" : expired ? "Expired" : `Demo (${daysLeft}d)`}
                      </span>
                    </td>
                    <td className="mono p-4 text-[11px] text-ink-rail">
                      {t._count.users}u · {t._count.leads}l · {t._count.projects}p
                    </td>
                    <td className="mono p-4 text-[11px] text-ink-rail">
                      {new Date(t.createdAt).toLocaleDateString()}
                    </td>
                    <td className="p-4 text-right space-x-2">
                      {t.plan === "DEMO" && (
                        <button
                          onClick={() => upgrade(t.id)}
                          className="mono border border-navy-700 px-3 py-1 text-[11px] uppercase tracking-[0.06em] transition-colors hover:border-plate"
                        >
                          Upgrade
                        </button>
                      )}
                      <button
                        onClick={() => deleteTenant(t.id, t.businessName)}
                        className="mono border border-navy-700 px-3 py-1 text-[11px] uppercase tracking-[0.06em] transition-colors hover:border-rose"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
              {!loading && tenants.length === 0 && (
                <tr>
                  <td colSpan={6} className="mono p-8 text-center text-[12px] uppercase tracking-[0.09em] text-ink-rail">No tenants yet</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mono mt-4 text-[11px] uppercase tracking-[0.09em] text-ink-rail">
          Total: {tenants.length} tenants · {tenants.filter(t => t.plan === "PAID").length} paid · {tenants.filter(t => t.plan === "DEMO").length} demo
        </div>
      </div>
    </div>
  );
}
