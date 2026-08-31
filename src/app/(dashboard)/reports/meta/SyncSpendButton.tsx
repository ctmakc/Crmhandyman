"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/primitives";
import { toast } from "@/components/ui/Toaster";

export default function SyncSpendButton({
  year,
  month,
}: {
  year: number;
  month: number | null;
}) {
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);

  async function sync() {
    setSyncing(true);
    const res = await fetch("/api/settings/meta-ads/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ year, month }),
    });
    setSyncing(false);
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      toast(body?.error || "Meta spend sync failed", "bad");
      return;
    }

    const spend = Array.isArray(body?.spendByCurrency)
      ? body.spendByCurrency
          .map((row: { currency?: string; amount?: number }) =>
            `${row.currency || "?"} ${Number(row.amount || 0).toFixed(2)}`
          )
          .join(" · ")
      : "";
    toast(`Meta spend synced · ${body?.rows ?? 0} rows${spend ? ` · ${spend}` : ""}`);
    router.refresh();
  }

  return (
    <Button onClick={() => void sync()} disabled={syncing}>
      {syncing ? "Syncing…" : "Sync spend"}
    </Button>
  );
}
