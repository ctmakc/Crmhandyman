import { describe, expect, it } from "vitest";
import { encodeLeadAttribution } from "@/lib/lead-attribution";
import { metaInsightsUrl, normalizeMetaAdAccountId } from "@/lib/meta-ads";
import {
  buildMetaCampaignBreakdown,
  type MetaReportLead,
  type MetaReportSpend,
} from "@/lib/meta-report";

function project(collectedCents: number): NonNullable<MetaReportLead["project"]> {
  return {
    estimates: [{ totalCents: collectedCents, status: "ACCEPTED" }],
    invoices: [{ totalCents: collectedCents, status: "SENT" }],
    payments: [{ amountCents: collectedCents }],
    expenses: [],
  };
}

const meta = (value: Parameters<typeof encodeLeadAttribution>[0]) =>
  encodeLeadAttribution(value) ?? null;

function spend(overrides: Partial<MetaReportSpend> = {}): MetaReportSpend {
  return {
    campaignId: "c1",
    campaignName: "Ottawa Movers",
    adsetId: "s1",
    adsetName: "Kanata",
    adId: "a1",
    adName: "Video A",
    spendCents: 10_000,
    currency: "CAD",
    impressions: 1000,
    clicks: 25,
    ...overrides,
  };
}

describe("Meta Ads Insights", () => {
  it("normalizes Ads Manager account ids and builds an ad-level daily Insights request", () => {
    expect(normalizeMetaAdAccountId(" act_123456789 ")).toBe("123456789");
    expect(normalizeMetaAdAccountId("not-an-account")).toBeNull();

    const url = new URL(metaInsightsUrl("123456789", "2026-08-01", "2026-08-31"));
    expect(url.hostname).toBe("graph.facebook.com");
    expect(url.pathname).toContain("/v26.0/act_123456789/insights");
    expect(url.searchParams.get("level")).toBe("ad");
    expect(url.searchParams.get("time_increment")).toBe("1");
    expect(url.searchParams.get("fields")).toContain("campaign_id");
    expect(url.searchParams.get("fields")).toContain("spend");
    expect(url.searchParams.has("access_token")).toBe(false);
  });

  it("rolls trusted CAD spend up ad → ad set → campaign and calculates CRM ROAS", () => {
    const leads: MetaReportLead[] = [
      {
        status: "CONVERTED",
        sourceMeta: meta({
          campaignId: "c1",
          campaignName: "Ottawa Movers",
          adsetId: "s1",
          adsetName: "Kanata",
          adId: "a1",
          adName: "Video A",
          formId: "f1",
        }),
        project: project(50_000),
      },
    ];

    const report = buildMetaCampaignBreakdown(leads, [spend()]);
    expect(report.spend).toMatchObject({
      spendCents: 10_000,
      spendCurrency: "CAD",
      roas: 5,
      costPerLeadCents: 10_000,
      costPerJobCents: 10_000,
      impressions: 1000,
      clicks: 25,
    });

    const campaign = report.campaigns[0];
    expect(campaign).toMatchObject({ id: "c1", spendCents: 10_000, roas: 5 });
    const adset = campaign.children[0];
    expect(adset).toMatchObject({ id: "s1", spendCents: 10_000, roas: 5 });
    const ad = adset.children[0];
    expect(ad).toMatchObject({ id: "a1", spendCents: 10_000, roas: 5 });
    // Insights has no lead-form spend dimension. Do not invent an allocation.
    expect(ad.children[0]).toMatchObject({ id: "f1", spendCents: null, roas: null });
  });

  it("keeps spend-only campaigns visible so zero-lead waste cannot disappear", () => {
    const report = buildMetaCampaignBreakdown([], [spend({ campaignId: "waste", campaignName: "No leads" })]);
    expect(report.total.leads).toBe(0);
    expect(report.campaigns).toHaveLength(1);
    expect(report.campaigns[0]).toMatchObject({
      id: "waste",
      name: "No leads",
      leads: 0,
      spendCents: 10_000,
    });
  });

  it("refuses CAD revenue ROAS when Meta spend is not CAD", () => {
    const report = buildMetaCampaignBreakdown(
      [
        {
          status: "CONVERTED",
          sourceMeta: meta({ campaignId: "c1", adsetId: "s1", adId: "a1" }),
          project: project(50_000),
        },
      ],
      [spend({ currency: "USD" })],
    );
    expect(report.spend.spendCurrency).toBe("USD");
    expect(report.spend.spendCents).toBe(10_000);
    expect(report.spend.roas).toBeNull();
    expect(report.spend.costPerLeadCents).toBeNull();
  });
});
