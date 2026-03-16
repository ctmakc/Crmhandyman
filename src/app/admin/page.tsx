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
    <div className="min-h-screen bg-gray-900 text-gray-100 p-6">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-2xl font-bold mb-2">Super Admin Panel</h1>
        <p className="text-gray-400 mb-6 text-sm">Logged in as: {email}</p>

        {loading && <p className="text-gray-400">Loading...</p>}
        {error && <p className="text-red-400">{error}</p>}
        {!superAdminEmails && (
          <div className="mb-4 p-3 bg-yellow-900/50 border border-yellow-700 rounded text-yellow-300 text-sm">
            Set SUPER_ADMIN_EMAILS in .env to grant access to this panel.
          </div>
        )}

        <div className="bg-gray-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700">
                <th className="text-left p-4 text-gray-400 font-medium">Tenant</th>
                <th className="text-left p-4 text-gray-400 font-medium">Owner</th>
                <th className="text-left p-4 text-gray-400 font-medium">Plan</th>
                <th className="text-left p-4 text-gray-400 font-medium">Data</th>
                <th className="text-left p-4 text-gray-400 font-medium">Created</th>
                <th className="text-right p-4 text-gray-400 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map(t => {
                const expired = t.plan === "DEMO" && t.expiresAt && new Date(t.expiresAt) < new Date();
                const daysLeft = t.expiresAt
                  ? Math.max(0, Math.ceil((new Date(t.expiresAt).getTime() - Date.now()) / 86400000))
                  : null;
                return (
                  <tr key={t.id} className="border-b border-gray-700/50 hover:bg-gray-750">
                    <td className="p-4">
                      <div className="font-medium">{t.businessName}</div>
                      <div className="text-gray-400 text-xs">{t.slug}</div>
                    </td>
                    <td className="p-4 text-gray-300">{t.ownerEmail}</td>
                    <td className="p-4">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                        t.plan === "PAID" ? "bg-green-900 text-green-300" :
                        expired ? "bg-red-900 text-red-300" : "bg-amber-900 text-amber-300"
                      }`}>
                        {t.plan === "PAID" ? "Paid" : expired ? "Expired" : `Demo (${daysLeft}d)`}
                      </span>
                    </td>
                    <td className="p-4 text-gray-400 text-xs">
                      {t._count.users}u · {t._count.leads}l · {t._count.projects}p
                    </td>
                    <td className="p-4 text-gray-400 text-xs">
                      {new Date(t.createdAt).toLocaleDateString()}
                    </td>
                    <td className="p-4 text-right space-x-2">
                      {t.plan === "DEMO" && (
                        <button
                          onClick={() => upgrade(t.id)}
                          className="px-3 py-1 bg-green-700 hover:bg-green-600 rounded text-xs"
                        >
                          Upgrade
                        </button>
                      )}
                      <button
                        onClick={() => deleteTenant(t.id, t.businessName)}
                        className="px-3 py-1 bg-red-800 hover:bg-red-700 rounded text-xs"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
              {!loading && tenants.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-gray-500">No tenants yet</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 text-xs text-gray-500">
          Total: {tenants.length} tenants · {tenants.filter(t => t.plan === "PAID").length} paid · {tenants.filter(t => t.plan === "DEMO").length} demo
        </div>
      </div>
    </div>
  );
}
