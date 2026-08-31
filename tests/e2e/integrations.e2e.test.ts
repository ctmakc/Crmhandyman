import { beforeAll, describe, expect, inject, it } from "vitest";
import { signedIn, type Workspace } from "./harness/client";

/**
 * Email inboxes and SMS numbers are workspace-owning routing facts, not preferences.
 * The database holds one normalizedAddress globally, so two tenants cannot both claim
 * the address a provider uses to decide where an inbound message belongs.
 */
describe.sequential("channel addresses are claimed once, across all workspaces", () => {
  let baseUrl = "";
  let alpha: Workspace;
  let beta: Workspace;

  beforeAll(async () => {
    baseUrl = inject("baseUrl");
    alpha = inject("alpha");
    beta = inject("beta");
  }, 120_000);

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
