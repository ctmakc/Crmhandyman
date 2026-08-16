import { beforeAll, describe, expect, inject, it } from "vitest";
import { signedIn, type Workspace } from "./harness/client";

/**
 * The inbound email address is a workspace-owning fact, not a preference: the webhook
 * routes every lead by the address it was sent to, so whoever holds leads-<slug>@…
 * receives that shop's enquiries (src/app/api/webhooks/email/route.ts). Those addresses
 * are guessable, so the settings PUT has to refuse an address another workspace already
 * claims — otherwise workspace B could name workspace A's inbox and harvest A's leads the
 * moment routing pointed there.
 *
 * This drives the real handler over HTTP so the admin guard, the cross-tenant lookup and
 * the database's unique index are all exercised together, exactly as a browser would hit
 * them.
 */
describe.sequential("the email channel address is claimed once, across all workspaces", () => {
  let baseUrl = "";
  let alpha: Workspace;
  let beta: Workspace;

  beforeAll(async () => {
    baseUrl = inject("baseUrl");
    alpha = inject("alpha");
    beta = inject("beta");
  }, 120_000);

  it("lets a workspace claim a fresh inbound address", async () => {
    const admin = await signedIn(baseUrl, alpha.admin);
    const res = await admin.put("/api/settings/integrations/email", {
      config: { address: "leads-alpha@parse.example" },
      isActive: true,
    });
    expect(res.status).toBe(200);
    expect(res.body.config).toContain("leads-alpha@parse.example");
  });

  it("lets the same workspace re-save its own address unchanged", async () => {
    const admin = await signedIn(baseUrl, alpha.admin);
    const res = await admin.put("/api/settings/integrations/email", {
      config: { address: "leads-alpha@parse.example" },
    });
    expect(res.status).toBe(200);
  });

  it("refuses another workspace the same address — even spelled with different case or spacing", async () => {
    const other = await signedIn(baseUrl, beta.admin);
    const res = await other.put("/api/settings/integrations/email", {
      config: { address: "  Leads-Alpha@Parse.Example " },
      isActive: true,
    });
    expect(res.status).toBe(409);
  });

  it("lets that other workspace claim its own distinct address", async () => {
    const other = await signedIn(baseUrl, beta.admin);
    const res = await other.put("/api/settings/integrations/email", {
      config: { address: "leads-beta@parse.example" },
      isActive: true,
    });
    expect(res.status).toBe(200);
  });

  it("only an admin may set the address at all", async () => {
    const worker = await signedIn(baseUrl, beta.worker);
    const res = await worker.put("/api/settings/integrations/email", {
      config: { address: "leads-sneaky@parse.example" },
    });
    expect(res.status).toBe(403);
  });
});
