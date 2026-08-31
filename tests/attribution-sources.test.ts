import { describe, expect, it } from "vitest";
import { CHANNELS, adSpendChannel, channelLabel } from "@/lib/attribution";

describe("Beaver acquisition source catalog", () => {
  it("keeps the paid marketplaces separate in the source-to-cash report", () => {
    const keys = CHANNELS.map((row) => row.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        "GOOGLE_LSA",
        "HOMESTARS",
        "BARK",
        "URBANTASKER",
        "MOVINGWALDO",
        "WEBSITE",
      ])
    );
    expect(channelLabel("GOOGLE_LSA")).toBe("Google LSA");
    expect(channelLabel("URBANTASKER")).toBe("UrbanTasker");
  });

  it("books source spend to the same buckets the leads use", () => {
    expect(adSpendChannel("Ad spend: LSA — August")).toBe("GOOGLE_LSA");
    expect(adSpendChannel("Ads: Bark")).toBe("BARK");
    expect(adSpendChannel("Advertising: UrbanTasker")).toBe("URBANTASKER");
    expect(adSpendChannel("Ad spend: MovingWaldo")).toBe("MOVINGWALDO");
    expect(adSpendChannel("Ad spend: website")).toBe("WEBSITE");
  });
});
