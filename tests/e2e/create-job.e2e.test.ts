import { beforeAll, describe, expect, inject, it } from "vitest";
import { Client, signedIn, type Workspace } from "./harness/client";

/**
 * Opening a job, over HTTP.
 *
 * A partial payload used to be answered by the database, not the route: `project.create`
 * hit a NOT NULL column and threw, Next returned an empty-bodied 500, and — the part that
 * cost the desk — `resolveClient` had already minted the customer, so a failed job left an
 * orphan Client the crew had no button to delete. This file pins both halves of the fix:
 * a bad body is refused up front with a 400 the dispatcher can read, and nothing at all is
 * written when it is; a real form payload still opens the job and its client together.
 */
describe.sequential("Opening a job — validation and the orphaned client", () => {
  let workspace: Workspace;
  let admin: Client;

  /** A phone the resolver would create a brand-new customer for — its digits are unique. */
  const stamp = Date.now().toString();
  const orphanName = `Orphan Probe ${stamp}`;
  const orphanPhone = `613${stamp.slice(-7)}`;

  async function clientsMatching(q: string) {
    const res = await admin.get(`/api/clients?q=${encodeURIComponent(q)}`);
    expect(res.status).toBe(200);
    return res.body as Array<{ id: string; name: string }>;
  }

  beforeAll(async () => {
    const baseUrl = inject("baseUrl");
    workspace = inject("alpha");
    admin = await signedIn(baseUrl, workspace.admin);
  });

  it("refuses a partial payload with a readable 400 — no 500, no empty body", async () => {
    // A client name and a phone the resolver would happily create a customer from, but no
    // title and no address — exactly the shape that used to reach the database and throw.
    const res = await admin.post("/api/projects", {
      clientName: orphanName,
      phone: orphanPhone,
    });

    expect(res.status).toBe(400);
    expect(typeof res.body).toBe("object");
    expect(res.body.error).toMatch(/job title/i);
    expect(res.body.error).toMatch(/address/i);
  });

  it("leaves no orphaned client behind when the job is refused", async () => {
    // The refused call above must not have minted a customer. If the resolver had run
    // outside a transaction, this probe would find the row it created.
    const hits = await clientsMatching(orphanName);
    expect(hits.some((c) => c.name === orphanName)).toBe(false);

    const byPhone = await clientsMatching(orphanPhone);
    expect(byPhone.length).toBe(0);
  });

  it("rejects a body that is not JSON with a 400, not a crash", async () => {
    const res = await admin.request("/api/projects", {
      method: "POST",
      raw: "{ not valid json",
      headers: { "content-type": "application/json" },
    });
    expect(res.status).toBe(400);
  });

  it("opens the job and its client together on the real form payload", async () => {
    const custName = `Real Customer ${stamp}`;
    const custPhone = `343${stamp.slice(-7)}`;

    // The shape the New-job form actually posts: the three required fields plus the
    // optional details, and no assignee (a fresh workspace has no crew to pick).
    const res = await admin.post("/api/projects", {
      clientId: "",
      clientName: custName,
      phone: custPhone,
      email: "",
      address: "42 Elm Street, Ottawa",
      title: "Replace kitchen faucet",
      description: "Single-lever, customer supplies the fixture",
      jobType: "Plumbing",
      scheduledDate: "",
    });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeTruthy();
    expect(res.body.clientName).toBe(custName);
    expect(res.body.title).toBe("Replace kitchen faucet");
    expect(res.body.address).toBe("42 Elm Street, Ottawa");
    // A job is never dispatched without a client; the resolver minted one for this name.
    expect(res.body.clientId).toBeTruthy();
    expect(res.body.conflicts).toEqual([]);

    const hits = await clientsMatching(custName);
    expect(hits.filter((c) => c.name === custName).length).toBe(1);
  });
});
