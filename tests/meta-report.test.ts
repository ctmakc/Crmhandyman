import { describe, expect, it } from "vitest";
import { encodeLeadAttribution } from "@/lib/lead-attribution";
import {
  buildMetaCampaignBreakdown,
  type MetaReportLead,
} from "@/lib/meta-report";

function project(
  quotedCents: number,
  invoicedCents: number,
  collectedCents: number,
  costsCents: number
): NonNullable<MetaReportLead["project"]> {
  return {
    estimates: [{ totalCents: quotedCents, status: "ACCEPTED" }],
    invoices: [{ totalCents: invoicedCents, status: "SENT" }],
    payments: [{ amountCents: collectedCents }],
    expenses: [{ amountCents: costsCents }],
  };
}

const meta = (input: Parameters<typeof encodeLeadAttribution>[0]) =>
  encodeLeadAttribution(input) ?? null;

describe("Meta campaign report", () => {
  it("rolls paid Lead Ads from campaign to ad set to ad to form", () => {
    const leads: MetaReportLead[] = [
      {
        status: "NEW",
        sourceMeta: meta({
          platform: "facebook",
          campaignId: "c1",
          campaignName: "Ottawa Movers",
          adsetId: "s1",
          adsetName: "Kanata",
          adId: "a1",
          adName: "Video A",
          formId: "f1",
        }),
        project: null,
      },
      {
        status: "VERIFIED",
        sourceMeta: meta({
          platform: "instagram",
          campaignId: "c1",
          campaignName: "Ottawa Movers",
          adsetId: "s1",
          adsetName: "Kanata",
          adId: "a2",
          adName: "Static B",
          formId: "f1",
        }),
        project: null,
      },
      {
        status: "CONVERTED",
        sourceMeta: meta({
          platform: "facebook",
          campaignId: "c1",
          campaignName: "Ottawa Movers",
          adsetId: "s1",
          adsetName: "Kanata",
          adId: "a1",
          adName: "Video A",
          formId: "f1",
        }),
        project: project(120_000, 120_000, 100_000, 30_000),
      },
      {
        status: "REJECTED",
        sourceMeta: meta({
          platform: "facebook",
          campaignId: "c2",
          campaignName: "Toronto Route",
          adsetId: "s2",
          adId: "a3",
          formId: "f2",
        }),
        project: null,
      },
    ];

    const report = buildMetaCampaignBreakdown(leads);
    expect(report.total).toMatchObject({
      leads: 4,
      reached: 3,
      qualified: 2,
      rejected: 1,
      jobs: 1,
      jobsPaid: 1,
      quotedCents: 120_000,
      invoicedCents: 120_000,
      collectedCents: 100_000,
      costsCents: 30_000,
      marginCents: 70_000,
    });

    expect(report.campaigns).toHaveLength(2);
    const ottawa = report.campaigns.find((row) => row.id === "c1");
    expect(ottawa).toMatchObject({
      name: "Ottawa Movers",
      leads: 3,
      reached: 2,
      qualified: 2,
      jobs: 1,
      collectedCents: 100_000,
      marginCents: 70_000,
      platforms: ["facebook", "instagram"],
    });

    const kanata = ottawa?.children[0];
    expect(kanata).toMatchObject({ id: "s1", name: "Kanata", leads: 3, jobs: 1 });
    const video = kanata?.children.find((row) => row.id === "a1");
    expect(video).toMatchObject({ name: "Video A", leads: 2, jobs: 1, collectedCents: 100_000 });
    expect(video?.children[0]).toMatchObject({ id: "f1", leads: 2, jobs: 1 });
  });

  it("keeps unattributed Facebook leads visible instead of dropping them", () => {
    const report = buildMetaCampaignBreakdown([
      { status: "NEW", sourceMeta: null, project: null },
      { status: "CONTACTED", sourceMeta: "{broken", project: null },
    ]);

    expect(report.total.leads).toBe(2);
    expect(report.campaigns).toHaveLength(1);
    expect(report.campaigns[0]).toMatchObject({
      key: "unknown",
      id: null,
      name: "Campaign unavailable",
      leads: 2,
      reached: 1,
    });
    expect(report.campaigns[0].children[0].name).toBe("Ad set unavailable");
    expect(report.campaigns[0].children[0].children[0].name).toBe("Ad unavailable");
  });

  it("uses ids as stable bucket identity even when names differ", () => {
    const report = buildMetaCampaignBreakdown([
      {
        status: "NEW",
        sourceMeta: meta({ campaignId: "c1", campaignName: "Old name" }),
        project: null,
      },
      {
        status: "NEW",
        sourceMeta: meta({ campaignId: "c1", campaignName: "New name" }),
        project: null,
      },
    ]);

    expect(report.campaigns).toHaveLength(1);
    expect(report.campaigns[0].id).toBe("c1");
    expect(report.campaigns[0].leads).toBe(2);
  });
});
