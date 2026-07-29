"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, CreditCard, Loader2, PackageOpen, XCircle } from "lucide-react";

type CreditPack = {
  id: string;
  label: string;
  credits: number;
  description: string | null;
};

export default function CreditPurchasePanel() {
  const [packs, setPacks] = useState<CreditPack[]>([]);
  const [currency, setCurrency] = useState("CAD");
  const [loading, setLoading] = useState(true);
  const [buying, setBuying] = useState("");
  const [error, setError] = useState("");
  const [checkoutState, setCheckoutState] = useState<"success" | "cancelled" | null>(null);

  useEffect(() => {
    const state = new URLSearchParams(window.location.search).get("credits");
    if (state === "success" || state === "cancelled") setCheckoutState(state);

    fetch("/api/billing/credits/packs", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Unable to load credit packs.");
        setPacks(payload.data || []);
        setCurrency(payload.meta?.currency || "CAD");
      })
      .catch((reason) => {
        setError(reason instanceof Error ? reason.message : "Unable to load credit packs.");
      })
      .finally(() => setLoading(false));

    if (state === "success") {
      const refreshDelays = [500, 2000, 5000, 10_000];
      const timers = refreshDelays.map((delay) =>
        window.setTimeout(() => {
          window.dispatchEvent(new Event("network-wallet-refresh"));
        }, delay)
      );
      return () => timers.forEach((timer) => window.clearTimeout(timer));
    }
  }, []);

  async function buy(packId: string) {
    setBuying(packId);
    setError("");
    try {
      const response = await fetch("/api/billing/credits/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packId }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.url) {
        throw new Error(payload.error || "Unable to start Stripe Checkout.");
      }
      window.location.assign(payload.url);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to start Stripe Checkout.");
      setBuying("");
    }
  }

  return (
    <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div>
          <div className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-blue-600" />
            <h2 className="text-lg font-black">Buy network credits</h2>
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
            Checkout is hosted by Stripe. Credits are added only after a signed paid webhook is
            validated against the server-side pack catalog.
          </p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black uppercase tracking-wider text-slate-600">
          {currency}
        </span>
      </div>

      {checkoutState === "success" && (
        <div className="mt-4 flex gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <div className="font-black">Payment completed.</div>
            <p className="mt-1 leading-6">
              The signed webhook is reconciling the purchase. Wallet refreshes are running
              automatically; duplicate webhook delivery cannot add the pack twice.
            </p>
          </div>
        </div>
      )}
      {checkoutState === "cancelled" && (
        <div className="mt-4 flex gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          <XCircle className="mt-0.5 h-5 w-5 shrink-0" />
          Stripe Checkout was cancelled. No credits were added.
        </div>
      )}
      {error && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="mt-5 flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading credit packs...
        </div>
      ) : packs.length > 0 ? (
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {packs.map((pack) => (
            <article key={pack.id} className="rounded-2xl border border-slate-200 p-5">
              <div className="text-3xl font-black text-slate-950">{pack.credits}</div>
              <div className="mt-1 text-xs font-black uppercase tracking-wider text-blue-700">
                credits
              </div>
              <h3 className="mt-4 font-black">{pack.label}</h3>
              <p className="mt-2 min-h-12 text-sm leading-6 text-slate-500">
                {pack.description || "Network lead contact unlock credits."}
              </p>
              <button
                type="button"
                onClick={() => void buy(pack.id)}
                disabled={Boolean(buying)}
                className="mt-5 flex w-full items-center justify-center rounded-xl bg-blue-700 px-4 py-3 text-sm font-black text-white hover:bg-blue-800 disabled:opacity-50"
              >
                {buying === pack.id && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Continue to Stripe
              </button>
            </article>
          ))}
        </div>
      ) : (
        <div className="mt-5 flex gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
          <PackageOpen className="mt-0.5 h-5 w-5 shrink-0" />
          No Stripe credit packs are configured. Set `STRIPE_CREDIT_PACKS_JSON` with valid Stripe
          Price IDs before exposing purchases.
        </div>
      )}
    </section>
  );
}
