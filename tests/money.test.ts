import { describe, it, expect } from "vitest";
import { formatCurrency } from "@/lib/utils";

/**
 * Every number a client sees on paper goes through formatCurrency. Money is stored as
 * Float, so the formatter is the last place cent-level drift can be caught before it
 * is printed and argued about.
 */

describe("formatCurrency", () => {
  it("always prints two decimals with a thousands separator", () => {
    expect(formatCurrency(1234.5)).toBe("$1,234.50");
    expect(formatCurrency(0)).toBe("$0.00");
    expect(formatCurrency(2102.5)).toBe("$2,102.50");
  });

  it("hides float dust that Float storage leaves behind", () => {
    // 8 × 115 + 380 + 175 accumulated through JS floats lands a hair off; the invoice
    // must still read as a round number.
    expect(formatCurrency(1234.5000000001)).toBe("$1,234.50");
    expect(formatCurrency(0.1 + 0.2)).toBe("$0.30");
  });

  it("rounds to the cent at display time", () => {
    expect(formatCurrency(1234.567)).toBe("$1,234.57");
    expect(formatCurrency(0.005)).toBe("$0.01");
  });

  it("prints a credit as negative — the deposit line on a balance invoice", () => {
    // api/invoices/route.ts writes "Less deposit invoice INV-…" with a negative rate.
    expect(formatCurrency(-1300)).toBe("-$1,300.00");
  });
});
