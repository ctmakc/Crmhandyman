import { prisma } from "@/lib/prisma";
import { jobMoney, type JobMoneyInput } from "@/lib/margin";
import { decodeLeadAttribution, type LeadAttribution } from "@/lib/lead-attribution";

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

export interface MetaBreakdownNode extends MetaOutcome {
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
  campaigns: MetaBreakdownNode[];
  /**
   * Campaign outcome is real; campaign spend is deliberately absent. A general Meta
   * invoice cannot be split across campaigns without Ads Insights or another trusted
   * campaign-level source, and inventing that split would make ROAS look precise while
   * being false.
   */
  spendAllocated: false;
}

type MetaProject = JobMoneyInput;

export type MetaReportLead = {
  status: string;
  sourceMeta: string | null;
  project: MetaProject | null;
};

type MutableNode = MetaOutcome & {
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

function identity(
  meta: LeadAttribution | undefined,
  level: MetaBreakdownLevel
): { key: string; id: string | null; name: string } {
  const pair =
    level === "campaign"
      ? [meta?.campaignId, meta?.campaignName, "Campaign unavailable"]
      : level === "adset"
        ? [meta?.adsetId, meta?.adsetName, "Ad set unavailable"]
        : level === "ad"
          ? [meta?.adId, meta?.adName, "Ad unavailable"]
          : [meta?.formId, meta?.formName, "Form unavailable"];

  const id = pair[0] || null;
  const label = pair[1] || id || pair[2];
  const key = id ? `id:${id}` : pair[1] ? `name:${pair[1]}` : "unknown";
  return { key, id, name: label };
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
  }
  return node;
}

function sortNodes(a: MetaBreakdownNode, b: MetaBreakdownNode) {
  return (
    b.collectedCents - a.collectedCents ||
    b.jobs - a.jobs ||
    b.qualified - a.qualified ||
    b.leads - a.leads ||
    a.name.localeCompare(b.name)
  );
}

function freeze(node: MutableNode): MetaBreakdownNode {
  return {
    level: node.level,
    key: node.key,
    id: node.id,
    name: node.name,
    platforms: Array.from(node.platforms).sort(),
    children: Array.from(node.children.values()).map(freeze).sort(sortNodes),
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
}

/** Pure hierarchy builder, exported so the campaign arithmetic is regression-testable. */
export function buildMetaCampaignBreakdown(leads: MetaReportLead[]): {
  total: MetaOutcome;
  campaigns: MetaBreakdownNode[];
} {
  const total = emptyOutcome();
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

  return {
    total,
    campaigns: Array.from(roots.values()).map(freeze).sort(sortNodes),
  };
}

export async function loadMetaCampaignReport(
  tenantId: string,
  opts: { year: number; month?: number | null }
): Promise<MetaCampaignReport> {
  const year = opts.year;
  const month = opts.month && opts.month >= 1 && opts.month <= 12 ? opts.month : null;
  const from = month ? new Date(year, month - 1, 1) : new Date(year, 0, 1);
  const to = month
    ? new Date(year, month, 0, 23, 59, 59, 999)
    : new Date(year, 11, 31, 23, 59, 59, 999);

  const leads = await prisma.lead.findMany({
    where: {
      tenantId,
      // Native Meta Lead Ads currently enter through the Facebook leadgen webhook even
      // when the placement/platform field says Instagram. Instagram DM leads use another
      // webhook and intentionally do not pollute this paid-lead campaign report.
      source: "FACEBOOK",
      createdAt: { gte: from, lte: to },
    },
    select: {
      status: true,
      sourceMeta: true,
      project: {
        select: {
          estimates: {
            select: { totalCents: true, status: true },
            orderBy: { createdAt: "desc" },
          },
          invoices: { select: { totalCents: true, status: true } },
          payments: { select: { amountCents: true } },
          expenses: { select: { amountCents: true } },
        },
      },
    },
  });

  const built = buildMetaCampaignBreakdown(leads);
  return { year, month, ...built, spendAllocated: false };
}
