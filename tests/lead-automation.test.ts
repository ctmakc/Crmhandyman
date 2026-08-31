import { describe, expect, it } from "vitest";
import {
  automationTaskMarker,
  leadAutomationSettings,
  parseAutomationTask,
} from "@/lib/lead-automation";

describe("lead automation settings", () => {
  it("keeps every automatic send off for legacy SMS config", () => {
    expect(leadAutomationSettings('"+16135550100"')).toEqual({
      instantAck: false,
      slaCallback: false,
      followUps: false,
      slaMinutes: 5,
      firstFollowUpMinutes: 120,
      finalFollowUpMinutes: 1440,
    });
  });

  it("reads enabled automation and clamps unsafe timing values", () => {
    const config = JSON.stringify({
      fromNumber: "+16135550100",
      automation: {
        instantAck: true,
        slaCallback: true,
        followUps: true,
        slaMinutes: 0,
        firstFollowUpMinutes: 2,
        finalFollowUpMinutes: 999999,
      },
    });
    expect(leadAutomationSettings(config)).toEqual({
      instantAck: true,
      slaCallback: true,
      followUps: true,
      slaMinutes: 1,
      firstFollowUpMinutes: 15,
      finalFollowUpMinutes: 10080,
    });
  });
});

describe("lead automation task markers", () => {
  it("round-trips a durable step and lead id", () => {
    const description = `${automationTaskMarker("NO_REPLY_2H")}\n[[LEAD:lead_123]]\nStep: NO_REPLY_2H`;
    expect(parseAutomationTask(description)).toEqual({ step: "NO_REPLY_2H", leadId: "lead_123" });
  });

  it("refuses unknown or incomplete steps", () => {
    expect(parseAutomationTask("[[AUTOMATION:MADE_UP]]\n[[LEAD:lead_123]]")).toBeNull();
    expect(parseAutomationTask("[[AUTOMATION:NO_REPLY_2H]]")).toBeNull();
  });
});
