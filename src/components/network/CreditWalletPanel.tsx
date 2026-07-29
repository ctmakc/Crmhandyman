"use client";

import { useCallback, useEffect, useState } from "react";
import { Coins, Loader2, RefreshCw, ReceiptText } from "lucide-react";

type WalletPayload = {
  wallet: {
    balance: number;
    lifetimePurchased: number;
    lifetimeSpent: number;
    transactions: Array<{
      id: string;
      type: string;
      amount: number;
      balanceAfter: number;
      description: string;
      createdAt: string;
    }>;
  };
};

function transactionClass(amount: number) {
  return amount < 0 ? "text-red-700" : "text-emerald-700";
}

export default function CreditWalletPanel() {
  const [data, setData] = useState<WalletPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/network", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to load credit wallet.");
      setData(payload);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load credit wallet.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const refresh = () => void load();
    window.addEventListener("network-wallet-refresh", refresh);
    return () => window.removeEventListener("network-wallet-refresh", refresh);
  }, [load]);

  return (
    <section className="mb-6 overflow-hidden rounded-2xl border border-amber-200 bg-white shadow-sm">
      <div className="grid gap-0 lg:grid-cols-[260px_1fr]">
        <div className="bg-amber-50 p-5">
          <div className="flex items-center justify-between">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500 text-white">
              <Coins className="h-5 w-5" />
            </span>
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="rounded-lg p-2 text-amber-800 hover:bg-amber-100 disabled:opacity-50"
              aria-label="Refresh credit wallet"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </button>
          </div>
          <p className="mt-4 text-xs font-black uppercase tracking-[0.18em] text-amber-700">
            Network credits
          </p>
          <div className="mt-1 text-4xl font-black text-amber-950">
            {data?.wallet.balance ?? "—"}
          </div>
          <p className="mt-2 text-sm leading-6 text-amber-900">
            Credits are debited only when an approved lead contact is unlocked. Failed or replayed
            requests cannot double-charge the wallet.
          </p>
          {data && (
            <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
              <div className="rounded-xl bg-white/70 p-3">
                <div className="font-black text-amber-950">{data.wallet.lifetimeSpent}</div>
                <div className="mt-1 text-amber-800">Lifetime spent</div>
              </div>
              <div className="rounded-xl bg-white/70 p-3">
                <div className="font-black text-amber-950">{data.wallet.lifetimePurchased}</div>
                <div className="mt-1 text-amber-800">Purchased</div>
              </div>
            </div>
          )}
        </div>

        <div className="p-5">
          <div className="flex items-center gap-2">
            <ReceiptText className="h-5 w-5 text-slate-500" />
            <h2 className="font-black text-slate-950">Recent credit ledger</h2>
          </div>

          {error ? (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
              {error}
            </div>
          ) : loading && !data ? (
            <div className="mt-4 flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading wallet...
            </div>
          ) : data?.wallet.transactions.length ? (
            <div className="mt-4 max-h-64 divide-y divide-slate-100 overflow-auto">
              {data.wallet.transactions.slice(0, 12).map((transaction) => (
                <div key={transaction.id} className="flex items-start justify-between gap-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-slate-800">
                      {transaction.description}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {new Date(transaction.createdAt).toLocaleString("en-CA")} · balance{" "}
                      {transaction.balanceAfter}
                    </p>
                  </div>
                  <div className={`shrink-0 text-sm font-black ${transactionClass(transaction.amount)}`}>
                    {transaction.amount > 0 ? "+" : ""}
                    {transaction.amount}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-sm text-slate-500">No credit transactions yet.</p>
          )}
        </div>
      </div>
    </section>
  );
}
