import { prisma } from "@/lib/prisma";
import { parseCents } from "@/lib/money";
import { metaGraphVersion } from "@/lib/integrations/facebook";

export const META_ADS_CHANNEL = "META_ADS";

export type MetaAdSpendRow = {
  id: string;
  tenantId: string;
  accountId: string;
  day: string;
  campaignId: string;
  campaignName: string | null;
  adsetId: string;
  adsetName: string | null;
  adId: string;
  adName: string | null;
  spendCents: number;
  currency: string;
  impressions: number;
  clicks: number;
  syncedAt: Date | string;
};

type InsightsRow = {
  date_start?: string;
  date_stop?: string;
  account_id?: string;
  account_currency?: string;
  campaign_id?: string;
  campaign_name?: string;
  adset_id?: string;
  adset_name?: string;
  ad_id?: string;
  ad_name?: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
};

type InsightsPage = {
  data?: InsightsRow[];
  paging?: { cursors?: { after?: string } };
  error?: { message?: string; code?: number };
};

const INSIGHT_FIELDS = [
  "date_start",
  "date_stop",
  "account_id",
  "account_currency",
  "campaign_id",
  "campaign_name",
  "adset_id",
  "adset_name",
  "ad_id",
  "ad_name",
  "spend",
  "impressions",
  "clicks",
].join(",");

export function normalizeMetaAdAccountId(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  const text = String(raw).trim().replace(/^act_/i, "");
  return /^\d{5,30}$/.test(text) ? text : null;
}

export function isIsoDay(raw: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return false;
  const [year, month, day] = raw.split("-").map(Number);
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

export function metaInsightsUrl(accountId: string, since: string, until: string, after?: string) {
  const params = new URLSearchParams({
    level: "ad",
    fields: INSIGHT_FIELDS,
    time_range: JSON.stringify({ since, until }),
    time_increment: "1",
    limit: "500",
  });
  if (after) params.set("after", after);
  return `https://graph.facebook.com/${metaGraphVersion()}/act_${encodeURIComponent(accountId)}/insights?${params}`;
}

function integer(raw: unknown): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function cacheId(tenantId: string, accountId: string, day: string, adId: string) {
  return `metaspend_${tenantId}_${accountId}_${day}_${adId}`;
}

export async function fetchMetaAdSpend(input: {
  accountId: string;
  accessToken: string;
  since: string;
  until: string;
}): Promise<Omit<MetaAdSpendRow, "id" | "tenantId" | "syncedAt">[]> {
  const rows: Omit<MetaAdSpendRow, "id" | "tenantId" | "syncedAt">[] = [];
  let after: string | undefined;

  // One year of one small-business account should be nowhere near 100 * 500 rows. The
  // cap prevents a malformed cursor from turning an owner click into an endless request.
  for (let page = 0; page < 100; page += 1) {
    const res = await fetch(metaInsightsUrl(input.accountId, input.since, input.until, after), {
      headers: { Authorization: `Bearer ${input.accessToken}` },
      cache: "no-store",
    });
    const payload = (await res.json().catch(() => null)) as InsightsPage | null;
    if (!res.ok || !payload) {
      const message = payload?.error?.message?.slice(0, 240) || `${res.status} ${res.statusText}`;
      throw new Error(`Meta Ads Insights: ${message}`);
    }

    for (const source of payload.data || []) {
      const day = source.date_start || "";
      const adId = source.ad_id?.trim() || "";
      const campaignId = source.campaign_id?.trim() || "";
      const adsetId = source.adset_id?.trim() || "";
      if (!isIsoDay(day) || !adId || !campaignId || !adsetId) continue;

      const spendCents = parseCents(source.spend ?? "0");
      if (spendCents === null || spendCents < 0) continue;
      rows.push({
        accountId: source.account_id?.trim() || input.accountId,
        day,
        campaignId,
        campaignName: source.campaign_name?.trim() || null,
        adsetId,
        adsetName: source.adset_name?.trim() || null,
        adId,
        adName: source.ad_name?.trim() || null,
        spendCents,
        currency: source.account_currency?.trim().toUpperCase() || "UNKNOWN",
        impressions: integer(source.impressions),
        clicks: integer(source.clicks),
      });
    }

    const next = payload.paging?.cursors?.after;
    if (!next || next === after || (payload.data?.length ?? 0) === 0) break;
    after = next;
  }

  return rows;
}

export async function replaceMetaAdSpend(input: {
  tenantId: string;
  accountId: string;
  since: string;
  until: string;
  rows: Omit<MetaAdSpendRow, "id" | "tenantId" | "syncedAt">[];
}) {
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`
      DELETE FROM "MetaAdSpend"
      WHERE "tenantId" = ${input.tenantId}
        AND "accountId" = ${input.accountId}
        AND "day" >= ${input.since}
        AND "day" <= ${input.until}
    `;

    for (const row of input.rows) {
      await tx.$executeRaw`
        INSERT INTO "MetaAdSpend" (
          "id", "tenantId", "accountId", "day",
          "campaignId", "campaignName", "adsetId", "adsetName",
          "adId", "adName", "spendCents", "currency", "impressions", "clicks", "syncedAt"
        ) VALUES (
          ${cacheId(input.tenantId, input.accountId, row.day, row.adId)},
          ${input.tenantId}, ${input.accountId}, ${row.day},
          ${row.campaignId}, ${row.campaignName}, ${row.adsetId}, ${row.adsetName},
          ${row.adId}, ${row.adName}, ${row.spendCents}, ${row.currency},
          ${row.impressions}, ${row.clicks}, ${now}
        )
      `;
    }

    await tx.channelIntegration.update({
      where: { tenantId_channel: { tenantId: input.tenantId, channel: META_ADS_CHANNEL } },
      data: { lastSyncAt: now },
    });
  });
}

export async function loadMetaAdSpend(input: {
  tenantId: string;
  accountId?: string | null;
  since: string;
  until: string;
}): Promise<MetaAdSpendRow[]> {
  if (input.accountId) {
    return prisma.$queryRaw<MetaAdSpendRow[]>`
      SELECT * FROM "MetaAdSpend"
      WHERE "tenantId" = ${input.tenantId}
        AND "accountId" = ${input.accountId}
        AND "day" >= ${input.since}
        AND "day" <= ${input.until}
      ORDER BY "day" ASC, "adId" ASC
    `;
  }
  return prisma.$queryRaw<MetaAdSpendRow[]>`
    SELECT * FROM "MetaAdSpend"
    WHERE "tenantId" = ${input.tenantId}
      AND "day" >= ${input.since}
      AND "day" <= ${input.until}
    ORDER BY "day" ASC, "adId" ASC
  `;
}
