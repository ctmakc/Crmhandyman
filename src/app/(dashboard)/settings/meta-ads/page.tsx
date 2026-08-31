"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BackLink, Button, Field, PageHead, Status, buttonClass } from "@/components/ui/primitives";
import { toast } from "@/components/ui/Toaster";

type Integration = {
  isActive: boolean;
  pageId: string | null;
  config: string | null;
  hasAccessToken: boolean;
  accessTokenHint: string | null;
  lastSyncAt: string | null;
};

type SyncConfig = {
  lastSyncSince?: string;
  lastSyncUntil?: string;
  lastSyncRows?: number;
};

function syncConfig(raw: string | null): SyncConfig {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as SyncConfig;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export default function MetaAdsSettingsPage() {
  const [loaded, setLoaded] = useState<Integration | null>(null);
  const [accountId, setAccountId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);

  async function load() {
    const res = await fetch("/api/settings/integrations/meta_ads", { cache: "no-store" });
    if (!res.ok) {
      toast("Meta Ads reporting settings could not be read", "bad");
      return;
    }
    const row = (await res.json()) as Integration;
    setLoaded(row);
    setAccountId(row.pageId || "");
    setActive(row.isActive);
  }

  useEffect(() => {
    void load();
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch("/api/settings/integrations/meta_ads", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pageId: accountId,
        accessToken,
        isActive: active,
      }),
    });
    setSaving(false);
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      toast(body?.error || "Meta Ads settings were not saved", "bad");
      return;
    }
    setAccessToken("");
    toast("Meta Ads reporting saved");
    await load();
  }

  const ready = Boolean(loaded?.isActive && loaded.hasAccessToken && loaded.pageId);
  const sync = syncConfig(loaded?.config ?? null);

  return (
    <div className="page-doc space-y-6 pb-24 md:pb-0">
      <BackLink href="/settings" label="Settings" />
      <PageHead
        eyebrow="Desk setup · 08"
        title="Meta Ads reporting"
        sub="Read-only Ads Insights credentials for campaign spend and ROAS. This is separate from the Facebook Page token that receives Lead Ads."
      />

      <div className="border-y border-line py-4">
        <Status value={ready ? "READY" : "NOT READY"} tone={ready ? "var(--emerald)" : "var(--slate)"} />
        <p className="t-meta mt-2 text-ink-2">
          {ready
            ? `Ad account ${loaded?.pageId}. Spend stays in a reporting cache and is never booked as a second accounting expense.`
            : "Add the Meta ad account id and a token with ads_read access."}
        </p>
        {loaded?.lastSyncAt ? (
          <p className="eyebrow mt-2">
            Last sync {new Date(loaded.lastSyncAt).toLocaleString("en-CA")}
            {sync.lastSyncSince && sync.lastSyncUntil
              ? ` · ${sync.lastSyncSince} → ${sync.lastSyncUntil} · ${sync.lastSyncRows ?? 0} ad/day rows`
              : ""}
          </p>
        ) : null}
      </div>

      <form onSubmit={save} className="space-y-5">
        <Field
          id="meta-ad-account"
          label="Meta ad account ID"
          hint="Ads Manager shows it as act_123456789…; either form is accepted."
          required
        >
          {(f) => (
            <input
              {...f}
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              placeholder="act_123456789012345"
              className={`${f.className} mono max-w-[420px]`}
            />
          )}
        </Field>

        <Field
          id="meta-ads-token"
          label="Ads Insights access token"
          hint={
            loaded?.hasAccessToken
              ? `A token ending ${loaded.accessTokenHint || "••••"} is already stored. Leave blank to keep it.`
              : "Use a user/system-user token that can read this ad account and has ads_read. The token is never returned by the API."
          }
        >
          {(f) => (
            <input
              {...f}
              type="password"
              autoComplete="off"
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
              placeholder={loaded?.hasAccessToken ? "Leave blank to keep existing token" : "Meta access token"}
              className={`${f.className} mono max-w-[520px]`}
            />
          )}
        </Field>

        <label className="eyebrow flex items-center gap-2">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
            className="h-4 w-4 accent-current"
          />
          Enable Ads Insights reporting
        </label>

        <div className="flex flex-wrap gap-2 border-t border-line pt-4">
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save Meta Ads"}
          </Button>
          <Link href="/reports/meta" className={buttonClass("ghost")}>
            Campaign outcomes →
          </Link>
        </div>
      </form>

      <div className="border-l-2 border-amber-ink pl-4">
        <p className="measure t-meta text-ink-2">
          This connection is read-only. HandyCRM requests Ads Insights spend/impressions/clicks;
          it does not create, edit or pause ads. The normal Facebook Lead Ads integration keeps
          its own Page token because lead retrieval and ad-account reporting are different Meta assets.
        </p>
      </div>
    </div>
  );
}
