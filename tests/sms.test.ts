import { describe, expect, it, vi } from "vitest";
import {
  normalizeSmsPhone,
  sendSms,
  smsConsentCommand,
  smsFromNumber,
  twilioConfig,
  twilioSignature,
  verifyTwilioSignature,
} from "@/lib/sms";
import { smsTemplate, smsTemplates } from "@/lib/sms-templates";

describe("SMS phone normalization", () => {
  it("turns Canadian ten-digit numbers into E.164 without guessing other countries", () => {
    expect(normalizeSmsPhone("613-555-0199")).toBe("+16135550199");
    expect(normalizeSmsPhone("1 (613) 555-0199")).toBe("+16135550199");
    expect(normalizeSmsPhone("+44 20 7946 0958")).toBe("+442079460958");
    expect(normalizeSmsPhone("5550199")).toBeNull();
  });

  it("reads both old bare config and the object shape", () => {
    expect(smsFromNumber('"+16135550100"')).toBe("+16135550100");
    expect(smsFromNumber(JSON.stringify({ fromNumber: "613 555 0101" }))).toBe("+16135550101");
  });
});

describe("Twilio configuration", () => {
  it("requires an active row with all three credentials/routing facts", () => {
    expect(
      twilioConfig({
        isActive: true,
        pageId: "AC123",
        accessToken: "secret",
        config: '"+16135550100"',
      }),
    ).toEqual({
      provider: "TWILIO",
      accountSid: "AC123",
      authToken: "secret",
      fromNumber: "+16135550100",
    });
    expect(twilioConfig({ isActive: false, pageId: "AC123", accessToken: "secret", config: '"+16135550100"' })).toBeNull();
  });
});

describe("Twilio send adapter", () => {
  it("posts form data with Basic auth and returns only provider-safe facts", async () => {
    const fetcher = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe("https://twilio.test/2010-04-01/Accounts/AC123/Messages.json");
      expect(init?.method).toBe("POST");
      expect((init?.headers as Record<string, string>).Authorization).toBe(
        `Basic ${Buffer.from("AC123:token").toString("base64")}`,
      );
      const form = new URLSearchParams(String(init?.body));
      expect(form.get("To")).toBe("+16135550199");
      expect(form.get("From")).toBe("+16135550100");
      expect(form.get("Body")).toBe("Hello");
      return new Response(JSON.stringify({ sid: "SM123", status: "queued" }), {
        status: 201,
        headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof fetch;

    await expect(
      sendSms(
        { provider: "TWILIO", accountSid: "AC123", authToken: "token", fromNumber: "+16135550100" },
        "6135550199",
        "Hello",
        { fetcher, baseUrl: "https://twilio.test/" },
      ),
    ).resolves.toEqual({ provider: "TWILIO", id: "SM123", status: "queued" });
  });
});

describe("Twilio webhook signature", () => {
  it("accepts the exact URL/body pair and refuses tampering", () => {
    const params = new URLSearchParams({ From: "+16135550199", To: "+16135550100", Body: "Hello" });
    const url = "https://crm.example.com/api/webhooks/twilio/sms";
    const signature = twilioSignature(url, params, "token");
    expect(verifyTwilioSignature(url, params, signature, "token")).toBe(true);
    params.set("Body", "changed");
    expect(verifyTwilioSignature(url, params, signature, "token")).toBe(false);
  });

  it("canonicalizes repeated form values the same way as twilio-node", () => {
    const a = new URLSearchParams();
    a.append("Foo", "z");
    a.append("Foo", "a");
    a.append("Foo", "z");
    a.append("Body", "Hello");

    const b = new URLSearchParams();
    b.append("Body", "Hello");
    b.append("Foo", "a");
    b.append("Foo", "z");

    expect(twilioSignature("https://crm.example.com/hook", a, "token")).toBe(
      twilioSignature("https://crm.example.com/hook", b, "token"),
    );
  });
});

describe("SMS consent words", () => {
  it("recognizes opt-out and opt-back-in commands only when the whole body is the command", () => {
    expect(smsConsentCommand(" stop ")).toBe("STOP");
    expect(smsConsentCommand("UNSUBSCRIBE")).toBe("STOP");
    expect(smsConsentCommand("START")).toBe("START");
    expect(smsConsentCommand("please stop by tomorrow")).toBeNull();
  });
});

describe("moving lead templates", () => {
  it("renders the lead and business name and keeps STOP language on every quick template", () => {
    const templates = smsTemplates({ leadName: "Jane Smith", businessName: "Beaver Movers" });
    expect(templates).toHaveLength(6);
    expect(templates.every((template) => template.message.includes("Reply STOP to opt out."))).toBe(true);
    expect(smsTemplate("MISSED_CALL", { leadName: "Jane Smith", businessName: "Beaver Movers" })?.message).toContain(
      "Hi Jane",
    );
    expect(smsTemplate("LAST_CHECK_IN", { leadName: "Jane Smith", businessName: "Beaver Movers" })?.message).toContain(
      "still need help with your move",
    );
    expect(smsTemplate("MADE_UP", { leadName: "Jane", businessName: "Beaver" })).toBeNull();
  });
});
