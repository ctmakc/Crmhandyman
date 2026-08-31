import { describe, expect, it } from "vitest";
import {
  LEAD_OUTCOMES,
  followUpDate,
  leadOutcome,
  leadTaskMarker,
  outcomePlan,
} from "@/lib/lead-sales";

describe("lead sales outcomes", () => {
  it("accepts only the call-sheet outcomes", () => {
    expect(leadOutcome("NO_ANSWER")).toBe("NO_ANSWER");
    expect(leadOutcome("QUOTE_SENT")).toBe("QUOTE_SENT");
    expect(leadOutcome("whatever")).toBeNull();
    expect(leadOutcome(7)).toBeNull();
    expect(LEAD_OUTCOMES).toContain("BOOKED");
  });

  it("maps outcomes onto the existing safe lead lifecycle", () => {
    expect(outcomePlan("NO_ANSWER")).toMatchObject({ status: "CONTACTED", terminal: false });
    expect(outcomePlan("QUALIFIED")).toMatchObject({ status: "VERIFIED", terminal: false });
    expect(outcomePlan("QUOTE_SENT")).toMatchObject({ status: "VERIFIED", terminal: false });
    expect(outcomePlan("NOT_INTERESTED")).toMatchObject({ status: "REJECTED", terminal: true });
    expect(outcomePlan("BAD_LEAD")).toMatchObject({ status: "REJECTED", terminal: true });
  });

  it("does not pretend BOOKED is a job before /convert has the job details", () => {
    expect(outcomePlan("BOOKED").status).toBe("VERIFIED");
  });
});

describe("follow-up input", () => {
  it("parses a valid ISO timestamp", () => {
    expect(followUpDate("2026-09-01T14:30:00-04:00")?.toISOString()).toBe(
      "2026-09-01T18:30:00.000Z"
    );
  });

  it("separates absent from invalid", () => {
    expect(followUpDate(undefined)).toBeUndefined();
    expect(followUpDate("")).toBeUndefined();
    expect(followUpDate("not-a-date")).toBeNull();
    expect(followUpDate(123)).toBeNull();
  });
});

describe("lead task marker", () => {
  it("is deterministic and hard to collide with ordinary task prose", () => {
    expect(leadTaskMarker("abc123")).toBe("[[LEAD:abc123]]");
  });
});
