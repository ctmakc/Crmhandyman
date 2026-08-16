import { describe, expect, it } from "vitest";
import { normalizeChannelAddress } from "@/lib/channel-address";

/**
 * The webhook (configuredAddress) and the settings PUT must reduce an address to the
 * same string, or a workspace could "own" an inbox the router never matches. These cases
 * pin the shared reducer to the webhook's own two-step (parse-then-lower/trim) across
 * every shape the settings form has stored over the product's life.
 */
describe("normalizeChannelAddress", () => {
  it("lowercases and trims a JSON address, the way the router compares it", () => {
    expect(normalizeChannelAddress({ address: "  Leads-Bob@Ex.COM " })).toBe("leads-bob@ex.com");
    // The parsed-object form the PUT hands in and the stored JSON string agree.
    expect(normalizeChannelAddress('{"address":"  Leads-Bob@Ex.COM "}')).toBe("leads-bob@ex.com");
  });

  it("accepts the older `email` key and the bare-string form", () => {
    expect(normalizeChannelAddress({ email: "OLD@Ex.com" })).toBe("old@ex.com");
    expect(normalizeChannelAddress("  Plain@Ex.com  ")).toBe("plain@ex.com");
  });

  it("prefers `address` over `email` when both are present", () => {
    expect(normalizeChannelAddress({ address: "new@ex.com", email: "old@ex.com" })).toBe("new@ex.com");
  });

  it("returns null when there is no address to claim", () => {
    expect(normalizeChannelAddress(undefined)).toBeNull();
    expect(normalizeChannelAddress(null)).toBeNull();
    expect(normalizeChannelAddress("")).toBeNull();
    expect(normalizeChannelAddress("   ")).toBeNull();
    expect(normalizeChannelAddress({})).toBeNull();
    expect(normalizeChannelAddress({ address: "   " })).toBeNull();
    expect(normalizeChannelAddress({ address: 42 })).toBeNull();
  });
});
