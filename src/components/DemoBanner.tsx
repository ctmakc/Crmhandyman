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
    <div className="flex items-center justify-between gap-3 border-b border-line bg-sunk px-4 py-2 md:px-6">
      <span className="flex items-center gap-2">
        <span
          className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ background: "var(--amber)" }}
        />
        <span className="eyebrow">
          Demo account —{" "}
          {daysLeft !== null
            ? `${daysLeft} day${daysLeft !== 1 ? "s" : ""} left`
            : "trial active"}
        </span>
      </span>
      {/* Upgrading is an operator action, so this asks for one instead of granting it —
          the old link pointed a GET at a POST endpoint and never worked anyway. */}
      <a
        href={`mailto:${process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "support@handymanpro.ca"}?subject=Upgrade%20my%20HandyCRM%20account`}
        className="border border-navy-900 bg-navy-900 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.06em] text-plate transition-colors duration-[140ms] ease-instrument hover:bg-navy-800"
      >
        Upgrade
      </a>
    </div>
  );
}
