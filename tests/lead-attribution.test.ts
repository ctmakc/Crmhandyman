import { describe, expect, it } from "vitest";
import {
  decodeLeadAttribution,
  encodeLeadAttribution,
  intakeLeadAttribution,
  leadAttributionRows,
  metaLeadAttribution,
} from "@/lib/lead-attribution";

describe("lead attribution metadata", () => {
  it("extracts website UTM, landing and referrer facts", () => {
    const meta = intakeLeadAttribution(
      {
        utm_source: "facebook",
        utm_medium: "paid_social",
        utm_campaign: "ottawa-moving-september",
        utm_content: "video-a",
        event_source_url: "https://beavermovers.com/quote?utm_source=facebook",
        fbclid: "fb-click-123",
      },
      "https://www.facebook.com/"
    );

    expect(meta).toMatchObject({
      platform: "website",
      utmSource: "facebook",
      utmMedium: "paid_social",
      utmCampaign: "ottawa-moving-september",
      utmContent: "video-a",
      landingPage: "https://beavermovers.com/quote?utm_source=facebook",
      referrer: "https://www.facebook.com/",
      fbclid: "fb-click-123",
    });
  });

  it("maps Meta Lead Ads campaign hierarchy", () => {
    expect(
      metaLeadAttribution({
        platform: "facebook",
        campaign_id: "cmp-1",
        campaign_name: "Ottawa Movers",
        adset_id: "set-2",
        adset_name: "Kanata homeowners",
        ad_id: "ad-3",
        ad_name: "No-surprise-price video",
        form_id: "form-4",
        is_organic: false,
      })
    ).toMatchObject({
      campaignId: "cmp-1",
      campaignName: "Ottawa Movers",
      adsetId: "set-2",
      adsetName: "Kanata homeowners",
      adId: "ad-3",
      adName: "No-surprise-price video",
      formId: "form-4",
      isOrganic: false,
    });
  });

  it("round-trips safely and refuses broken JSON", () => {
    const encoded = encodeLeadAttribution({ utmSource: "google", gclid: "g-1" });
    expect(decodeLeadAttribution(encoded)).toEqual({ utmSource: "google", gclid: "g-1" });
    expect(decodeLeadAttribution("{broken")).toBeUndefined();
  });

  it("renders concise owner-facing rows", () => {
    const rows = leadAttributionRows({
      campaignName: "Ottawa Movers",
      adName: "Video A",
      formId: "form-4",
      platform: "facebook",
    });
    expect(rows).toEqual([
      { label: "Campaign", value: "Ottawa Movers" },
      { label: "Ad", value: "Video A" },
      { label: "Form ID", value: "form-4" },
      { label: "Platform", value: "facebook" },
    ]);
  });
});
