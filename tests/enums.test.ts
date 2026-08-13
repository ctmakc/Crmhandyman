import { describe, it, expect } from "vitest";
import {
  EXPENSE_CATEGORIES,
  LEAD_SOURCES,
  PAYMENT_METHODS,
  PROJECT_STATUSES,
  badChoice,
  choice,
} from "@/lib/enums";

/**
 * The three answers a route needs, and why the middle one exists.
 *
 * An enum column rejects an unknown value at the driver, which surfaces as a 500 and, on
 * a screen, as a button that does nothing at all — the desk cannot tell that apart from a
 * dead network. Four doors answered that way. `choice` separates «not sent» from «sent
 * wrong», because a route keeps the column's default for the first and refuses the second.
 */
describe("choice", () => {
  it("passes a value the shop actually offers", () => {
    expect(choice(PAYMENT_METHODS, "E_TRANSFER")).toBe("E_TRANSFER");
    expect(choice(EXPENSE_CATEGORIES, "MATERIALS")).toBe("MATERIALS");
    expect(choice(PROJECT_STATUSES, "COMPLETED")).toBe("COMPLETED");
  });

  it("refuses one it does not, whatever shape it arrives in", () => {
    expect(choice(PAYMENT_METHODS, "CRYPTO")).toBeNull();
    expect(choice(EXPENSE_CATEGORIES, "FUEL")).toBeNull();
    expect(choice(LEAD_SOURCES, "TIKTOK")).toBeNull();
    expect(choice(PROJECT_STATUSES, "ON_FIRE")).toBeNull();
    // Case matters: the columns are upper case and «cash» is not one of them.
    expect(choice(PAYMENT_METHODS, "cash")).toBeNull();
    expect(choice(PAYMENT_METHODS, 7)).toBeNull();
    expect(choice(PAYMENT_METHODS, ["CASH"])).toBeNull();
  });

  it("reads an absent field as absent, so the column keeps its default", () => {
    expect(choice(PAYMENT_METHODS, undefined)).toBeUndefined();
    expect(choice(PAYMENT_METHODS, null)).toBeUndefined();
    expect(choice(PAYMENT_METHODS, "")).toBeUndefined();
  });
});

describe("badChoice", () => {
  it("names the field and lists what is on offer, so the screen can say it", () => {
    const body = badChoice("payment method", PAYMENT_METHODS);
    expect(body.error).toContain("payment method");
    expect(body.field).toBe("payment method");
    expect(body.allowed).toEqual(["CASH", "E_TRANSFER", "CHEQUE", "CARD"]);
  });
});

/**
 * The lists here are a hand-written copy of `prisma/schema.prisma`, so the one failure
 * worth guarding against is drift: a value added to the schema and not here is refused
 * by every door that reads it, and the screen offering it stops working.
 */
describe("the lists agree with the schema", () => {
  it("matches what Prisma generated", async () => {
    const client = await import("@prisma/client");
    const same = (mine: readonly string[], theirs: Record<string, string>) =>
      expect([...mine].sort()).toEqual(Object.values(theirs).sort());

    same(EXPENSE_CATEGORIES, client.ExpenseCategory);
    same(PAYMENT_METHODS, client.PaymentMethod);
    same(LEAD_SOURCES, client.LeadSource);
    same(PROJECT_STATUSES, client.ProjectStatus);
  });
});
