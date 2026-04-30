"use client";
import { useSession } from "next-auth/react";
import { useState, useEffect } from "react";

interface TenantInfo {
  plan: string;
  expiresAt: string | null;
  businessName: string;
}

export default function DemoBanner() {
  const { data: session } = useSession();
  const [tenant, setTenant] = useState<TenantInfo | null>(null);

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const slug = (session?.user as any)?.tenantSlug || "demo";
    fetch(`/api/tenant/resolve?slug=${slug}`)
      .then(r => r.json())
      .then(d => setTenant(d))
      .catch(() => null);
  }, [session]);

  if (!tenant || tenant.plan !== "DEMO") return null;

  const daysLeft = tenant.expiresAt
    ? Math.max(0, Math.ceil((new Date(tenant.expiresAt).getTime() - Date.now()) / 86400000))
    : null;

  return (
    <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center justify-between text-sm">
      <span className="text-amber-800">
        <strong>Demo Account</strong> — {daysLeft !== null ? `${daysLeft} day${daysLeft !== 1 ? "s" : ""} remaining` : "Trial active"}
      </span>
      <a
        href="/api/tenant/upgrade"
        className="bg-amber-500 text-white px-3 py-1 rounded font-medium hover:bg-amber-600 transition-colors"
      >
        Upgrade
      </a>
    </div>
  );
}
