import { beforeAll, describe, expect, inject, it } from "vitest";
import { signedIn, type Workspace } from "./harness/client";

describe.sequential("lead callback inbox", () => {
  let baseUrl = "";
  let alpha: Workspace;
  let beta: Workspace;
  let leadId = "";

  beforeAll(async () => {
    baseUrl = inject("baseUrl");
    alpha = inject("alpha");
    beta = inject("beta");

    const admin = await signedIn(baseUrl, alpha.admin);
    const created = await admin.post("/api/leads", {
      name: "Beaver Callback Inbox Test",
      phone: "+16135550231",
      source: "MANUAL",
      jobType: "Moving",
    });
    expect(created.status).toBe(201);
    leadId = created.body.id;
  }, 120_000);

  it("shows a scheduled callback on the lead desk", async () => {
    const admin = await signedIn(baseUrl, alpha.admin);
    const due = new Date(Date.now() + 3 * 3600_000).toISOString();

    const logged = await admin.post(`/api/leads/${leadId}/activity`, {
      outcome: "NO_ANSWER",
      note: "Try once more this afternoon",
      followUpAt: due,
    });
    expect(logged.status).toBe(200);

    const queue = await admin.get("/api/leads/follow-ups");
    expect(queue.status).toBe(200);
    const row = queue.body.find((item: { lead?: { id?: string } }) => item.lead?.id === leadId);
    expect(row).toBeTruthy();
    expect(row.lead.name).toBe("Beaver Callback Inbox Test");
    expect(row.lead.phone).toBe("+16135550231");
    expect(new Date(row.dueDate).toISOString()).toBe(due);
  });

  it("never shows that callback to another workspace", async () => {
    const other = await signedIn(baseUrl, beta.admin);
    const queue = await other.get("/api/leads/follow-ups");
    expect(queue.status).toBe(200);
    expect(queue.body.some((item: { lead?: { id?: string } }) => item.lead?.id === leadId)).toBe(false);
  });

  it("drops the callback from the inbox after the next contact", async () => {
    const admin = await signedIn(baseUrl, alpha.admin);
    const contacted = await admin.post(`/api/leads/${leadId}/activity`, {
      outcome: "CONNECTED",
      note: "Reached customer",
    });
    expect(contacted.status).toBe(200);

    const queue = await admin.get("/api/leads/follow-ups");
    expect(queue.status).toBe(200);
    expect(queue.body.some((item: { lead?: { id?: string } }) => item.lead?.id === leadId)).toBe(false);
  });
});
