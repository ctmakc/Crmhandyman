import { describe, expect, it } from "vitest";
import {
  detectInboundEmailSource,
  inboundEmailSourceLeadId,
  parseInboundLeadEmail,
} from "@/lib/marketplace-email";

describe("detectInboundEmailSource", () => {
  it("keeps Google Local Services separate from generic Google", () => {
    expect(
      detectInboundEmailSource(
        "Google Local Services <noreply@google.com>",
        "New Local Services lead",
        "Google Guaranteed customer request"
      )
    ).toBe("GOOGLE_LSA");
    expect(detectInboundEmailSource("Google <noreply@google.com>", "New enquiry", "")).toBe("GOOGLE");
  });

  it("recognises the Canadian marketplace buckets Beaver will actually buy from", () => {
    expect(detectInboundEmailSource("leads@homestars.com", "New homeowner request", "")).toBe("HOMESTARS");
    expect(detectInboundEmailSource("notifications@bark.com", "You have a new lead", "")).toBe("BARK");
    expect(detectInboundEmailSource("hello@urbantasker.com", "New customer request", "")).toBe("URBANTASKER");
    expect(detectInboundEmailSource("partners@movingwaldo.com", "New moving referral", "")).toBe("MOVINGWALDO");
  });
});

describe("parseInboundLeadEmail", () => {
  it("turns a HomeStars notification into the homeowner, not the platform sender", () => {
    const parsed = parseInboundLeadEmail({
      from: "HomeStars <notifications@homestars.com>",
      subject: "New homeowner request in Kanata",
      messageId: "<hs-4815@example.mail>",
      body: [
        "Customer name: Jane Smith",
        "Phone number: (613) 555-0188",
        "Email address: jane.smith@example.ca",
        "Location: Kanata, ON",
        "Service requested: Local moving",
        "Lead ID: HS-4815",
      ].join("\n"),
    });

    expect(parsed).toMatchObject({
      source: "HOMESTARS",
      name: "Jane Smith",
      phone: "(613) 555-0188",
      email: "jane.smith@example.ca",
      city: "Kanata, ON",
      jobType: "Local moving",
      providerLeadId: "HS-4815",
      sourceLeadId: "email:hs-4815@example.mail",
    });
  });

  it("extracts split names and excludes the platform sender address", () => {
    const parsed = parseInboundLeadEmail({
      from: "Bark <notifications@bark.com>",
      subject: "New removals lead",
      body: [
        "First name: Omar",
        "Last name: Khan",
        "Email: omar.khan@example.com",
        "Phone: +1 613 555 0114",
        "Project: Two-bedroom apartment move",
        "For help contact support@bark.com",
      ].join("\n"),
    });

    expect(parsed.source).toBe("BARK");
    expect(parsed.name).toBe("Omar Khan");
    expect(parsed.email).toBe("omar.khan@example.com");
    expect(parsed.phone).toBe("+1 613 555 0114");
    expect(parsed.jobType).toBe("Two-bedroom apartment move");
    expect(parsed.sourceLeadId).toMatch(/^email-sha256:[a-f0-9]{64}$/);
  });

  it("uses a truthful platform placeholder when contact details are still locked", () => {
    const parsed = parseInboundLeadEmail({
      from: "UrbanTasker <leads@urbantasker.com>",
      subject: "Moving request near Ottawa",
      body: "Service: Office moving\nLocation: Ottawa, ON\nUnlock this lead to see customer details.",
    });

    expect(parsed.source).toBe("URBANTASKER");
    expect(parsed.name).toBe("UrbanTasker lead");
    expect(parsed.email).toBeUndefined();
    expect(parsed.jobType).toBe("Office moving");
  });

  it("keeps ordinary direct email sender identity as the customer fallback", () => {
    const parsed = parseInboundLeadEmail({
      from: "Mary Brown <mary@example.ca>",
      subject: "Need movers next Friday",
      body: "Call me at 613-555-0171 please.",
    });

    expect(parsed.source).toBe("EMAIL");
    expect(parsed.name).toBe("Mary Brown");
    expect(parsed.email).toBe("mary@example.ca");
    expect(parsed.phone).toBe("613-555-0171");
  });
});

describe("inboundEmailSourceLeadId", () => {
  it("is stable for a replay when Message-ID is unavailable", () => {
    const input = { from: "a@example.com", subject: "Lead", body: "same notification" };
    expect(inboundEmailSourceLeadId(input)).toBe(inboundEmailSourceLeadId(input));
    expect(inboundEmailSourceLeadId({ ...input, body: "different notification" })).not.toBe(
      inboundEmailSourceLeadId(input)
    );
  });
});
