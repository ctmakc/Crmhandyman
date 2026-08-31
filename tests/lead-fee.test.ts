import { describe, expect, it } from "vitest";
import {
  DIRECT_FEE_SOURCES,
  leadFeeApiValue,
  leadFeeDescription,
  leadFeeExpenseId,
  leadIdFromFeeExpenseId,
  parseLeadFee,
  supportsDirectLeadFee,
} from "@/lib/lead-fee";
import { adSpendChannel } from "@/lib/attribution";

describe("per-lead acquisition fees", () => {
  it("uses one deterministic expense row per lead", () => {
    expect(leadFeeExpenseId("cm123")).toBe("leadfee_cm123");
    expect(leadIdFromFeeExpenseId("leadfee_cm123")).toBe("cm123");
    expect(leadIdFromFeeExpenseId("expense_cm123")).toBeNull();
  });

  it("books the direct fee into the existing source-to-cash acquisition spend", () => {
    const description = leadFeeDescription("BARK", "cm123");
    expect(description).toContain("direct lead fee");
    expect(adSpendChannel(description)).toBe("BARK");
  });

  it("only allows sources that can charge for a concrete lead", () => {
    expect(DIRECT_FEE_SOURCES).toEqual([
      "GOOGLE_LSA",
      "HOMESTARS",
      "BARK",
      "URBANTASKER",
      "MOVINGWALDO",
    ]);
    expect(supportsDirectLeadFee("BARK")).toBe(true);
    expect(supportsDirectLeadFee("GOOGLE_LSA")).toBe(true);
    expect(supportsDirectLeadFee("FACEBOOK")).toBe(false);
    expect(supportsDirectLeadFee("GOOGLE")).toBe(false);
    expect(supportsDirectLeadFee("MANUAL")).toBe(false);
  });

  it("accepts dollars, preserves explicit zero and lets blank clear the fee", () => {
    expect(parseLeadFee("12.34")).toEqual({ ok: true, cents: 1234 });
    expect(parseLeadFee(0)).toEqual({ ok: true, cents: 0 });
    expect(parseLeadFee("")).toEqual({ ok: true, cents: null });
    expect(parseLeadFee(null)).toEqual({ ok: true, cents: null });
    expect(parseLeadFee(-1)).toEqual({ ok: false, error: "Lead cost must be zero or more" });
    expect(leadFeeApiValue(1234)).toBe(12.34);
  });

  it("blocks obvious cents/dollars mistakes", () => {
    expect(parseLeadFee(100000.01)).toEqual({ ok: false, error: "Lead cost is too large" });
  });
});
