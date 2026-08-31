import { describe, expect, it } from "vitest";
import {
  evaluateGoLiveReadiness,
  type ReadinessFacts,
} from "@/lib/go-live-readiness";

const NOW = new Date("2026-08-31T22:00:00.000Z");

function readyFacts(): ReadinessFacts {
  return {
    now: NOW,
    tenant: {
      slug: "beaver-movers",
      status: "ACTIVE",
      plan: "PAID",
      businessName: "Beaver Movers",
      ownerEmail: "owner@example.com",
      businessAddress: "100 Test St, Ottawa, ON",
      businessPhone: "+16135550100",
      businessEmail: "hello@example.com",
      paymentInstructions: "E-transfer to billing@example.com",
    },
    currentHost: "beaver-movers.itopsi.com",
    approvedUsers: 3,
    approvedAdmins: 1,
    activeWebsiteKeys: 1,
    latestWebsiteKeyUseAt: new Date("2026-08-31T21:30:00.000Z"),
    smsReady: true,
    automation: { instantAck: true, slaCallback: true, followUps: true },
    cronSecretPresent: true,
    alerts: {
      active: true,
      channelConfigured: true,
      lastSentAt: "2026-08-31T21:31:00.000Z",
      lastDelivered: true,
    },
    facebook: {
      active: true,
      pageIdPresent: true,
      pageTokenPresent: true,
      appIdPresent: true,
      appSecretPresent: true,
      verifyTokenPresent: true,
    },
    metaAds: {
      configured: true,
      lastSyncAt: new Date("2026-08-31T21:40:00.000Z"),
      lastSyncSince: "2026-08-01",
      lastSyncUntil: "2026-08-31",
    },
    latestExternalLead: {
      id: "lead_test",
      name: "Acceptance Test",
      source: "WEBSITE",
      status: "CONTACTED",
      createdAt: new Date("2026-08-31T21:30:00.000Z"),
      phonePresent: true,
    },
    latestSmsActivityAt: new Date("2026-08-31T21:31:00.000Z"),
  };
}

describe("go-live readiness", () => {
  it("returns READY only when every launch-blocking gate is satisfied", () => {
    const report = evaluateGoLiveReadiness(readyFacts());
    expect(report.verdict).toBe("READY");
    expect(report.counts.blocked).toBe(0);
    expect(report.gates).toHaveLength(10);
    expect(report.gates.every((row) => row.state === "READY")).toBe(true);
  });

  it("blocks paid traffic when webhook verification or acceptance evidence is missing", () => {
    const facts = readyFacts();
    facts.facebook.appSecretPresent = false;
    facts.latestExternalLead = null;
    facts.latestSmsActivityAt = null;

    const report = evaluateGoLiveReadiness(facts);
    expect(report.verdict).toBe("BLOCKED");
    expect(report.gates.find((row) => row.id === "meta-leads")?.state).toBe("BLOCKED");
    expect(report.gates.find((row) => row.id === "acceptance")?.state).toBe("BLOCKED");
  });

  it("requires the cron secret only for delayed SLA/follow-up automation", () => {
    const scheduled = readyFacts();
    scheduled.cronSecretPresent = false;
    expect(
      evaluateGoLiveReadiness(scheduled).gates.find((row) => row.id === "automation")?.state,
    ).toBe("BLOCKED");

    const instantOnly = readyFacts();
    instantOnly.cronSecretPresent = false;
    instantOnly.automation = { instantAck: true, slaCallback: false, followUps: false };
    expect(
      evaluateGoLiveReadiness(instantOnly).gates.find((row) => row.id === "automation")?.state,
    ).toBe("READY");
  });

  it("keeps optional Meta spend reporting as a warning instead of a launch blocker", () => {
    const facts = readyFacts();
    facts.metaAds = { configured: false, lastSyncAt: null };

    const report = evaluateGoLiveReadiness(facts);
    expect(report.gates.find((row) => row.id === "meta-reporting")?.state).toBe("WARN");
    expect(report.verdict).toBe("READY");
    expect(report.counts.warn).toBe(1);
  });
});
