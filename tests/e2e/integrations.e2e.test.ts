import { beforeAll, describe, expect, inject, it } from "vitest";
import { twilioSignature } from "@/lib/sms";
import { signedIn, type Workspace } from "./harness/client";

describe.sequential("channel addresses are claimed once, across all workspaces", () => {
  let baseUrl = "";
  let alpha: Workspace;
  let beta: Workspace;

  beforeAll(async () => {
    baseUrl = inject("baseUrl");
    alpha = inject("alpha");
    beta = inject("beta");
  }, 120_000);

  async function twilioPost(
    values: Record<string, string>,
    token = "alpha-twilio-token",
    signatureOverride?: string,
  ) {
    const url = new URL("/api/webhooks/twilio/sms", baseUrl).toString();
    const form = new URLSearchParams(values);
    return fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "x-forwarded-for": "10.77.201.25",
        "x-twilio-signature": signatureOverride ?? twilioSignature(url, form, token),
      },
      body: form.toString(),
      redirect: "manual",
    });
  }

  it("lets a workspace claim a fresh inbound email address", async () => {
    const admin = await signedIn(baseUrl, alpha.admin);
    const res = await admin.put("/api/settings/integrations/email", {
      config: { address: "leads-alpha@parse.example" },
      isActive: true,
    });
    expect(res.status).toBe(200);
    expect(res.body.config).toContain("leads-alpha@parse.example");
  });

  it("lets the same workspace re-save its own email address unchanged", async () => {
    const admin = await signedIn(baseUrl, alpha.admin);
    const res = await admin.put("/api/settings/integrations/email", {
      config: { address: "leads-alpha@parse.example" },
    });
    expect(res.status).toBe(200);
  });

  it("refuses another workspace the same email address — even with different case or spacing", async () => {
    const other = await signedIn(baseUrl, beta.admin);
    const res = await other.put("/api/settings/integrations/email", {
      config: { address: "  Leads-Alpha@Parse.Example " },
      isActive: true,
    });
    expect(res.status).toBe(409);
  });

  it("lets that other workspace claim its own distinct email address", async () => {
    const other = await signedIn(baseUrl, beta.admin);
    const res = await other.put("/api/settings/integrations/email", {
      config: { address: "leads-beta@parse.example" },
      isActive: true,
    });
    expect(res.status).toBe(200);
  });

  it("normalizes a Canadian Twilio number and makes that number workspace-exclusive", async () => {
    const admin = await signedIn(baseUrl, alpha.admin);
    const claimed = await admin.put("/api/settings/integrations/sms", {
      pageId: "AC-alpha-test",
      accessToken: "alpha-twilio-token",
      config: "613-555-0100",
      isActive: true,
    });
    expect(claimed.status).toBe(200);
    expect(claimed.body.normalizedAddress).toBe("+16135550100");
    expect(claimed.body.hasAccessToken).toBe(true);
    expect(claimed.body.accessToken).toBeUndefined();

    const other = await signedIn(baseUrl, beta.admin);
    const collision = await other.put("/api/settings/integrations/sms", {
      pageId: "AC-beta-test",
      accessToken: "beta-twilio-token",
      config: "+1 (613) 555-0100",
      isActive: true,
    });
    expect(collision.status).toBe(409);
  });

  it("accepts a signed Twilio reply, raises a callback, and enforces STOP/START", async () => {
    const admin = await signedIn(baseUrl, alpha.admin);
    const created = await admin.post("/api/leads", {
      name: "Twilio Reply Test",
      phone: "613-555-0198",
      source: "MANUAL",
      jobType: "Moving",
    });
    expect(created.status).toBe(201);
    const leadId = created.body.id;

    const reply = await twilioPost({
      AccountSid: "AC-alpha-test",
      MessageSid: "SM-alpha-reply-001",
      From: "+16135550198",
      To: "+16135550100",
      Body: "Saturday morning works for us",
    });
    expect(reply.status).toBe(200);
    expect(reply.headers.get("content-type")).toContain("text/xml");

    const history = await admin.get(`/api/leads/${leadId}/sms`);
    expect(history.status).toBe(200);
    expect(history.body.history[0].action).toBe("lead.activity.sms_received");
    expect(history.body.history[0].meta.message).toBe("Saturday morning works for us");
    expect(history.body.optedOut).toBe(false);

    const afterReply = await admin.get(`/api/leads/${leadId}`);
    expect(afterReply.status).toBe(200);
    expect(afterReply.body.status).toBe("NEW");
    const callbacks = await admin.get("/api/leads/follow-ups");
    const replyTask = callbacks.body.find((item: { lead?: { id?: string } }) => item.lead?.id === leadId);
    expect(replyTask).toBeTruthy();
    expect(replyTask.lead.name).toBe("Twilio Reply Test");

    const badSignature = await twilioPost(
      {
        AccountSid: "AC-alpha-test",
        MessageSid: "SM-alpha-forged-001",
        From: "+16135550198",
        To: "+16135550100",
        Body: "forged",
      },
      "alpha-twilio-token",
      "definitely-not-a-signature",
    );
    expect(badSignature.status).toBe(401);

    const stop = await twilioPost({
      AccountSid: "AC-alpha-test",
      MessageSid: "SM-alpha-stop-001",
      From: "+16135550198",
      To: "+16135550100",
      Body: "STOP",
      OptOutType: "STOP",
    });
    expect(stop.status).toBe(200);

    const stopped = await admin.get(`/api/leads/${leadId}/sms`);
    expect(stopped.body.optedOut).toBe(true);
    expect(stopped.body.history[0].action).toBe("lead.activity.sms_opt_out");

    const blocked = await admin.post(`/api/leads/${leadId}/sms`, {
      message: "This must never leave the CRM",
    });
    expect(blocked.status).toBe(409);

    const start = await twilioPost({
      AccountSid: "AC-alpha-test",
      MessageSid: "SM-alpha-start-001",
      From: "+16135550198",
      To: "+16135550100",
      Body: "START",
      OptOutType: "START",
    });
    expect(start.status).toBe(200);

    const restarted = await admin.get(`/api/leads/${leadId}/sms`);
    expect(restarted.body.optedOut).toBe(false);
    expect(restarted.body.history[0].action).toBe("lead.activity.sms_opt_in");
  });

  it("fails closed on the lead-automation scheduler secret", async () => {
    const url = new URL("/api/webhooks/lead-automation?limit=5", baseUrl);
    const refused = await fetch(url, {
      method: "POST",
      headers: {
        authorization: "Bearer wrong-secret",
        "x-forwarded-for": "10.77.201.26",
      },
    });
    expect(refused.status).toBe(401);

    const accepted = await fetch(url, {
      method: "POST",
      headers: {
        authorization: "Bearer e2e-automation-secret",
        "x-forwarded-for": "10.77.201.27",
      },
    });
    expect(accepted.status).toBe(200);
    const body = await accepted.json();
    expect(body.ok).toBe(true);
    expect(typeof body.found).toBe("number");
    expect(typeof body.sent).toBe("number");
  });

  it("refuses a malformed SMS sending number before it reaches the database", async () => {
    const admin = await signedIn(baseUrl, alpha.admin);
    const res = await admin.put("/api/settings/integrations/sms", {
      config: "555-0100",
    });
    expect(res.status).toBe(400);
  });

  it("only an admin may set a channel address at all", async () => {
    const worker = await signedIn(baseUrl, beta.worker);
    const res = await worker.put("/api/settings/integrations/email", {
      config: { address: "leads-sneaky@parse.example" },
    });
    expect(res.status).toBe(403);
  });
});
