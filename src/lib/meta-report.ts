import { prisma } from "@/lib/prisma";
import { jobMoney, type JobMoneyInput } from "@/lib/margin";
import { decodeLeadAttribution, type LeadAttribution } from "@/lib/lead-attribution";
import {
  META_ADS_CHANNEL,
  loadMetaAdSpend,
  normalizeMetaAdAccountId,
  type MetaAdSpendRow,
} from "@/lib/meta-ads";

export type MetaBreakdownLevel = "campaign" | "adset" | "ad" | "form";

export interface MetaOutcome {
  leads: number;
  reached: number;
  qualified: number;
  rejected: number;
  jobs: number;
  jobsPaid: number;
  quotedCents: number;
  invoicedCents: number;
  collectedCents: number;
  costsCents: number;
  marginCents: number;
}

export interface MetaSpendMetrics {
  spendCents: number | null;
  spendCurrency: string | null;
  mixedCurrency: boolean;
  impressions: number;
  clicks: number;
  /** Collected CAD / spend CAD. Null for non-CAD, mixed currency or zero/unknown spend. */
  roas: number | null;
  costPerLeadCents: number | null;
  costPerJobCents: number | null;
}

export interface MetaBreakdownNode extends MetaOutcome, MetaSpendMetrics {
  level: MetaBreakdownLevel;
  key: string;
  id: string | null;
  name: string;
  platforms: string[];
  children: MetaBreakdownNode[];
}

export interface MetaCampaignReport {
  year: number;
  month: number | null;
  total: MetaOutcome;
  spend: MetaSpendMetrics & {
    configured: boolean;
    accountId: string | null;
    lastSyncAt: Date | null;
    coverageSince: string | null;
    coverageUntil: string | null;
  };
  campaigns: MetaBreakdownNode[];
  /** Backward-readable flag: true only when trusted Ads Insights rows exist for the period. */
  spendAllocated: boolean;
}

type MetaProject = JobMoneyInput;

export type MetaReportLead = {
  status: string;
  sourceMeta: string | null;
  project: MetaProject | null;
};

export type MetaReportSpend = Pick<
  MetaAdSpendRow,
  | "campaignId"
  | "campaignName"
  | "adsetId"
  | "adsetName"
  | "adId"
  | "adName"
  | "spendCents"
  | "currency"
  | "impressions"
  | "clicks"
>;

type SpendAccumulator = {
  spendByCurrency: Map<string, number>;
  impressions: number;
  clicks: number;
};

type MutableNode = MetaOutcome & SpendAccumulator & {
  level: MetaBreakdownLevel;
  key: string;
  id: string | null;
  name: string;
  platforms: Set<string>;
  children: Map<string, MutableNode>;
};

const emptyOutcome = (): MetaOutcome => ({
  leads: 0,
  reached: 0,
  qualified: 0,
  rejected: 0,
  jobs: 0,
  jobsPaid: 0,
  quotedCents: 0,
  invoicedCents: 0,
  collectedCents: 0,
  costsCents: 0,
  marginCents: 0,
});

const emptySpend = (): SpendAccumulator => ({
  spendByCurrency: new Map<string, number>(),
  impressions: 0,
  clicks: 0,
});

function emptyNode(
  level: MetaBreakdownLevel,
  key: string,
  id: string | null,
  name: string
): MutableNode {
  return {
    level,
    key,
    id,
    name,
    platforms: new Set<string>(),
    children: new Map<string, MutableNode>(),
    ...emptyOutcome(),
    ...emptySpend(),
  };
}

function addOutcome(target: MetaOutcome, lead: MetaReportLead) {
  target.leads += 1;
  if (lead.status !== "NEW") target.reached += 1;
  if (lead.status === "VERIFIED" || lead.status === "CONVERTED") target.qualified += 1;
  if (lead.status === "REJECTED") target.rejected += 1;

  if (!lead.project) return;
  const money = jobMoney(lead.project);
  target.jobs += 1;
  if (money.collectedCents > 0) target.jobsPaid += 1;
  target.quotedCents += money.quotedCents;
  target.invoicedCents += money.invoicedCents;
  target.collectedCents += money.collectedCents;
  target.costsCents += money.costsCents;
  target.marginCents += money.marginCents;
}

function addSpend(target: SpendAccumulator, row: MetaReportSpend) {
  const currency = row.currency?.trim().toUpperCase() || "UNKNOWN";
  target.spendByCurrency.set(
    currency,
    (target.spendByCurrency.get(currency) ?? 0) + Math.max(0, row.spendCents),
  );
  target.impressions += Math.max(0, row.impressions);
  target.clicks += Math.max(0, row.clicks);
}

function identity(
  meta: LeadAttribution | undefined,
  level: MetaBreakdownLevel
): { key: string; id: string | null; name: string } {
  let rawId: string | undefined;
  let rawName: string | undefined;
  let fallback: string;

  if (level === "campaign") {
    rawId = meta?.campaignId;
    rawName = meta?.campaignName;
    fallback = "Campaign unavailable";
  } else if (level === "adset") {
    rawId = meta?.adsetId;
    rawName = meta?.adsetName;
    fallback = "Ad set unavailable";
  } else if (level === "ad") {
    rawId = meta?.adId;
    rawName = meta?.adName;
    fallback = "Ad unavailable";
  } else {
    rawId = meta?.formId;
    rawName = meta?.formName;
    fallback = "Form unavailable";
  }

  const id = rawId || null;
  const name = rawName || id || fallback;
  const key = id ? `id:${id}` : rawName ? `name:${rawName}` : "unknown";
  return { key, id, name };
}

function spendAttribution(row: MetaReportSpend): LeadAttribution {
  return {
    campaignId: row.campaignId,
    campaignName: row.campaignName || undefined,
    adsetId: row.adsetId,
    adsetName: row.adsetName || undefined,
    adId: row.adId,
    adName: row.adName || undefined,
  };
}

function touch(
  map: Map<string, MutableNode>,
  level: MetaBreakdownLevel,
  meta: LeadAttribution | undefined
) {
  const row = identity(meta, level);
  let node = map.get(row.key);
  if (!node) {
    node = emptyNode(level, row.key, row.id, row.name);
    map.set(row.key, node);
  } else if ((!node.name || node.name === node.id) && row.name) {
    node.name = row.name;
  }
  return node;
}

function spendMetrics(
  source: SpendAccumulator,
  outcome: MetaOutcome,
  allowAllocation: boolean
): MetaSpendMetrics {
  const currencies = Array.from(source.spendByCurrency.entries()).filter(([, cents]) => cents >= 0);
  const mixedCurrency = currencies.length > 1;
  const single = currencies.length === 1 ? currencies[0] : null;
  const spendCurrency = single?.[0] ?? null;
  const spendCents = allowAllocation && single ? single[1] : null;
  const comparableCad = spendCurrency === "CAD" && spendCents !== null;

  return {
    spendCents,
    spendCurrency: allowAllocation ? spendCurrency : null,
    mixedCurrency: allowAllocation ? mixedCurrency : false,
    impressions: allowAllocation ? source.impressions : 0,
    clicks: allowAllocation ? source.clicks : 0,
    roas:
      comparableCad && spendCents > 0
        ? outcome.collectedCents / spendCents
        : null,
    costPerLeadCents:
      comparableCad && outcome.leads > 0
        ? Math.round(spendCents / outcome.leads)
        : null,
    costPerJobCents:
      comparableCad && outcome.jobs > 0
        ? Math.round(spendCents / outcome.jobs)
        : null,
  };
}

function sortNodes(a: MetaBreakdownNode, b: MetaBreakdownNode) {
  return (
    b.collectedCents - a.collectedCents ||
    b.jobs - a.jobs ||
    b.qualified - a.qualified ||
    b.leads - a.leads ||
    (b.spendCents ?? 0) - (a.spendCents ?? 0) ||
    a.name.localeCompare(b.name)
  );
}

function freeze(node: MutableNode): MetaBreakdownNode {
  const outcome: MetaOutcome = {
    leads: node.leads,
    reached: node.reached,
    qualified: node.qualified,
    rejected: node.rejected,
    jobs: node.jobs,
    jobsPaid: node.jobsPaid,
    quotedCents: node.quotedCents,
    invoicedCents: node.invoicedCents,
    collectedCents: node.collectedCents,
    costsCents: node.costsCents,
    marginCents: node.marginCents,
  };
  return {
    level: node.level,
    key: node.key,
    id: node.id,
    name: node.name,
    platforms: Array.from(node.platforms).sort(),
    children: Array.from(node.children.values()).map(freeze).sort(sortNodes),
    ...outcome,
    // Ads Insights supplies spend at ad level. Rolling it up to ad set/campaign is exact;
    // pushing it down to a lead form would be an allocation Meta did not report.
    ...spendMetrics(node, outcome, node.level !== "form"),
  };
}

/** Pure hierarchy builder, exported so outcome + Ads Insights arithmetic is regression-testable. */
export function buildMetaCampaignBreakdown(
  leads: MetaReportLead[],
  spendRows: MetaReportSpend[] = []
): {
  total: MetaOutcome;
  spend: MetaSpendMetrics;
  campaigns: MetaBreakdownNode[];
} {
  const total = emptyOutcome();
  const totalSpend = emptySpend();
  const roots = new Map<string, MutableNode>();

  for (const lead of leads) {
    const meta = decodeLeadAttribution(lead.sourceMeta);
    const platform = meta?.platform?.trim();
    addOutcome(total, lead);

    const campaign = touch(roots, "campaign", meta);
    const adset = touch(campaign.children, "adset", meta);
    const ad = touch(adset.children, "ad", meta);
    const form = touch(ad.children, "form", meta);

    for (const node of [campaign, adset, ad, form]) {
      addOutcome(node, lead);
      if (platform) node.platforms.add(platform);
    }
  }

  for (const row of spendRows) {
    const meta = spendAttribution(row);
    const campaign = touch(roots, "campaign", meta);
    const adset = touch(campaign.children, "adset", meta);
    const ad = touch(adset.children, "ad", meta);
    addSpend(totalSpend, row);
    for (const node of [campaign, adset, ad]) addSpend(node, row);
  }

  return {
    total,
    spend: spendMetrics(totalSpend, total, true),
    campaigns: Array.from(roots.values()).map(freeze).sort(sortNodes),
  };
}

function rangeFor(year: number, month: number | null) {
  const mm = (n: number) => String(n).padStart(2, "0");
  if (month) {
    const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return {
      from: new Date(year, month - 1, 1),
      to: new Date(year, month, 0, 23, 59, 59, 999),
      since: `${year}-${mm(month)}-01`,
      until: `${year}-${mm(month)}-${mm(last)}`,
    };
  }
  return {
    from: new Date(year, 0, 1),
    to: new Date(year, 11, 31, 23, 59, 59, 999),
    since: `${year}-01-01`,
    until: `${year}-12-31`,
  };
}

export async function loadMetaCampaignReport(
  tenantId: string,
  opts: { year: number; month?: number | null }
): Promise<MetaCampaignReport> {
  const year = opts.year;
  const month = opts.month && opts.month >= 1 && opts.month <= 12 ? opts.month : null;
  const range = rangeFor(year, month);

  const money = {
    estimates: {
      select: { totalCents: true, status: true },
      orderBy: { createdAt: "desc" as const },
    },
    invoices: { select: { totalCents: true, status: true } },
    payments: { select: { amountCents: true } },
    expenses: { select: { amountCents: true } },
  } as const;

  const [leads, integration] = await Promise.all([
    prisma.lead.findMany({
      where: {
        tenantId,
        source: "FACEBOOK",
        createdAt: { gte: range.from, lte: range.to },
      },
      select: {
        status: true,
        sourceMeta: true,
        project: { select: money },
      },
    }),
    prisma.channelIntegration.findUnique({
      where: { tenantId_channel: { tenantId, channel: META_ADS_CHANNEL } },
      select: {
        pageId: true,
        accessToken: true,
        isActive: true,
        lastSyncAt: true,
      },
    }),
  ]);

  const accountId = normalizeMetaAdAccountId(integration?.pageId);
  const spendRows = accountId
    ? await loadMetaAdSpend({ tenantId, accountId, since: range.since, until: range.until })
    : [];

  const built = buildMetaCampaignBreakdown(leads, spendRows);
  const days = spendRows.map((row) => row.day).sort();
  return {
    year,
    month,
    total: built.total,
    campaigns: built.campaigns,
    spend: {
      ...built.spend,
      configured: Boolean(integration?.isActive && integration.accessToken && accountId),
      accountId,
      lastSyncAt: integration?.lastSyncAt ?? null,
      coverageSince: days[0] ?? null,
      coverageUntil: days[days.length - 1] ?? null,
    },
    spendAllocated: spendRows.length > 0,
  };
}
