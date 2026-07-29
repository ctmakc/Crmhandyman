"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Coins, Loader2, RefreshCw, Search, WalletCards } from "lucide-react";

type TenantWallet = {
  id: string;
  slug: string;
  businessName: string;
  plan: string;
  creditWallet: {
    balance: number;
    lifetimePurchased: number;
    lifetimeSpent: number;
    updatedAt: string;
    transactions: Array<{
      id: string;
      type: string;
      amount: number;
      balanceAfter: number;
      description: string;
      idempotencyKey: string;
      createdAt: string;
    }>;
  } | null;
};

export default function AdminCreditsManager() {
  const [tenants, setTenants] = useState<TenantWallet[]>([]);
  const [query, setQuery] = useState("");
  const [selectedTenantId, setSelectedTenantId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setNotice(null);
    try {
      const response = await fetch("/api/admin/credits", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to load tenant wallets.");
      setTenants(payload.data);
      setSelectedTenantId((current) => current || payload.data[0]?.id || "");
    } catch (error) {
      setNotice({
        type: "error",
        text: error instanceof Error ? error.message : "Unable to load tenant wallets.",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return tenants;
    return tenants.filter((tenant) =>
      `${tenant.businessName} ${tenant.slug} ${tenant.plan}`.toLowerCase().includes(normalized)
    );
  }, [query, tenants]);

  async function adjust(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setNotice(null);

    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/admin/credits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...Object.fromEntries(form.entries()),
          tenantId: selectedTenantId,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        const details = Array.isArray(payload.details) ? payload.details.join(" ") : payload.error;
        throw new Error(details || "Unable to adjust credits.");
      }

      setNotice({
        type: "success",
        text: payload.replayed
          ? `Existing ledger entry replayed. Balance remains ${payload.wallet.balance}.`
          : `Wallet updated. New balance: ${payload.wallet.balance}.`,
      });
      await load();
    } catch (error) {
      setNotice({
        type: "error",
        text: error instanceof Error ? error.message : "Unable to adjust credits.",
      });
    } finally {
      setSaving(false);
    }
  }

  const selected = tenants.find((tenant) => tenant.id === selectedTenantId) ?? null;

  return (
    <div className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-black">Tenant wallets</h2>
            <p className="mt-1 text-sm text-slate-500">{tenants.length} workspaces loaded</p>
          </div>
          <div className="flex gap-2">
            <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="w-48 bg-transparent py-2.5 text-sm outline-none"
                placeholder="Search tenant"
              />
            </label>
            <button
              onClick={() => void load()}
              disabled={loading}
              className="rounded-xl border border-slate-200 p-3 text-slate-600 disabled:opacity-50"
              aria-label="Refresh wallets"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div className="max-h-[720px] divide-y divide-slate-100 overflow-auto">
          {filtered.map((tenant) => (
            <button
              key={tenant.id}
              type="button"
              onClick={() => setSelectedTenantId(tenant.id)}
              className={`grid w-full gap-4 p-5 text-left sm:grid-cols-[1fr_auto] ${
                selectedTenantId === tenant.id ? "bg-amber-50" : "hover:bg-slate-50"
              }`}
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="truncate font-black text-slate-900">{tenant.businessName}</h3>
                  <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-slate-600">
                    {tenant.plan}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500">{tenant.slug} · {tenant.id}</p>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-slate-500">
                  <span>Purchased {tenant.creditWallet?.lifetimePurchased ?? 0}</span>
                  <span>Spent {tenant.creditWallet?.lifetimeSpent ?? 0}</span>
                  <span>{tenant.creditWallet?.transactions.length ?? 0} recent ledger entries</span>
                </div>
              </div>
              <div className="flex items-center gap-2 sm:text-right">
                <WalletCards className="h-5 w-5 text-amber-600" />
                <span className="text-3xl font-black text-amber-950">
                  {tenant.creditWallet?.balance ?? 0}
                </span>
              </div>
            </button>
          ))}
        </div>
      </section>

      <aside className="space-y-6">
        <form onSubmit={adjust} className="rounded-2xl border border-amber-200 bg-white p-5 shadow-sm">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
            <Coins className="h-5 w-5" />
          </div>
          <h2 className="mt-4 text-lg font-black">Adjust selected wallet</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            {selected ? `${selected.businessName} · current balance ${selected.creditWallet?.balance ?? 0}` : "Select a tenant."}
          </p>

          <div className="mt-5 space-y-4">
            <label className="block">
              <span className="text-sm font-bold">Type</span>
              <select name="type" defaultValue="CREDIT_PURCHASE" className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm">
                <option value="CREDIT_PURCHASE">Credit purchase</option>
                <option value="ADJUSTMENT">Manual adjustment</option>
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-bold">Amount</span>
              <input name="amount" type="number" required min="-100000" max="100000" step="1" className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm" />
              <span className="mt-1 block text-xs text-slate-500">Negative amounts are allowed only for adjustments and cannot exceed the balance.</span>
            </label>
            <label className="block">
              <span className="text-sm font-bold">Description</span>
              <textarea name="description" required minLength={5} maxLength={500} rows={4} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm" />
            </label>
            <label className="block">
              <span className="text-sm font-bold">Idempotency key</span>
              <input name="idempotencyKey" required minLength={8} maxLength={200} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-3 font-mono text-xs" placeholder="stripe:pi_... or admin:ticket-123" />
            </label>
            <label className="block">
              <span className="text-sm font-bold">External reference</span>
              <input name="referenceId" maxLength={200} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm" />
            </label>
          </div>

          <button disabled={saving || !selectedTenantId} className="mt-5 flex w-full items-center justify-center rounded-xl bg-amber-500 px-4 py-3 text-sm font-black text-amber-950 hover:bg-amber-400 disabled:opacity-50">
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Write ledger transaction
          </button>
        </form>

        {notice && (
          <div className={`rounded-xl border p-4 text-sm font-semibold ${notice.type === "error" ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
            {notice.text}
          </div>
        )}

        {selected?.creditWallet?.transactions.length ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="font-black">Recent selected ledger</h2>
            <div className="mt-4 divide-y divide-slate-100">
              {selected.creditWallet.transactions.map((transaction) => (
                <div key={transaction.id} className="py-3">
                  <div className="flex justify-between gap-3">
                    <span className="text-sm font-bold text-slate-800">{transaction.description}</span>
                    <span className={`font-black ${transaction.amount < 0 ? "text-red-700" : "text-emerald-700"}`}>
                      {transaction.amount > 0 ? "+" : ""}{transaction.amount}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {transaction.type} · balance {transaction.balanceAfter} · {new Date(transaction.createdAt).toLocaleString("en-CA")}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </aside>
    </div>
  );
}
