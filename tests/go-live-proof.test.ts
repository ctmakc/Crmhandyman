import { describe, expect, it } from "vitest";
import { applyLiveProof } from "@/lib/go-live-proof";
import type { GoLiveReadiness } from "@/lib/go-live-readiness";

const NOW = new Date("2026-08-31T22:00:00.000Z");

function report(): GoLiveReadiness {
  return {
    verdict: "READY",
    checkedAt: NOW.toISOString(),
    expectedWorkspaceUrl: "https://beaver-movers.itopsi.com",
    currentHost: "beaver-movers.itopsi.com",
    counts: { ready: 2, warn: 0, blocked: 0 },
    gates: [
      {
        id: "alerts",
        title: "Lead alerts",
        state: "READY",
        summary: "old evaluator state",
        details: [],
      },
      {
        id: "acceptance",
        title: "End-to-end lead evidence",
        state: "READY",
        summary: "old evaluator state",
        details: [],
      },
    ],
    evidence: {
      latestExternalLead: {
        id: "lead_acceptance",
        name: "Acceptance Test",
        source: "WEBSITE",
        status: "NEW",
        createdAt: "2026-08-31T21:30:00.000Z",
        phonePresent: true,
      },
      // Deliberately represents an unrelated lead: proof-layer must replace it.
      latestSmsActivityAt: "2026-08-31T21:45:00.000Z",
    },
  };
}

function proof(overrides: Partial<Parameters<typeof applyLiveProof>[1]> = {}) {
  return {
    now: NOW,
    alerts: {
      active: true,
      telegramReady: true,
      smtpReady: false,
      lastSentAt: "2026-08-31T21:40:00.000Z",
      lastDelivered: true,
    },
    exactAcceptanceSmsAt: new Date("2026-08-31T21:35:00.000Z"),
    ...overrides,
  };
}

describe("go-live live proof", () => {
  it("accepts fresh alert delivery and SMS tied to the exact acceptance lead", () => {
    const result = applyLiveProof(report(), proof());
    expect(result.verdict).toBe("READY");
    expect(result.gates.find((row) => row.id === "alerts")?.state).toBe("READY");
    expect(result.gates.find((row) => row.id === "acceptance")?.state).toBe("READY");
    expect(result.evidence.latestSmsActivityAt).toBe("2026-08-31T21:35:00.000Z");
  });

  it("blocks when SMS activity belongs to some other lead", () => {
    const result = applyLiveProof(report(), proof({ exactAcceptanceSmsAt: null }));
    expect(result.gates.find((row) => row.id === "acceptance")?.state).toBe("BLOCKED");
    expect(result.evidence.latestSmsActivityAt).toBeNull();
    expect(result.verdict).toBe("BLOCKED");
  });

  it("blocks stale alert proof even when the transport remains configured", () => {
    const result = applyLiveProof(
      report(),
      proof({
        alerts: {
          active: true,
          telegramReady: true,
          smtpReady: false,
          lastSentAt: "2026-08-01T12:00:00.000Z",
          lastDelivered: true,
        },
      }),
    );
    expect(result.gates.find((row) => row.id === "alerts")?.state).toBe("BLOCKED");
    expect(result.verdict).toBe("BLOCKED");
  });

  it("blocks acceptance when the latest external lead cannot exercise SMS", () => {
    const source = report();
    source.evidence.latestExternalLead!.phonePresent = false;
    const result = applyLiveProof(source, proof());
    expect(result.gates.find((row) => row.id === "acceptance")?.state).toBe("BLOCKED");
  });
});
