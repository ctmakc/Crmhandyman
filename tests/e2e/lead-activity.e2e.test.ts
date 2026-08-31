import { beforeAll, describe, expect, inject, it } from "vitest";
import { signedIn, type Workspace } from "./harness/client";

type SignedClient = Awaited<ReturnType<typeof signedIn>>;

describe.sequential("lead activity and follow-up", () => {
  let baseUrl = "";
  let alpha: Workspace;
  let beta: Workspace;
  let admin: SignedClient;
  let other: SignedClient;
  let leadId = "";

  beforeAll(async () => {
    baseUrl = inject("baseUrl");
    alpha = inject("alpha");
    beta = inject("beta");

    // Reuse the two sessions for the whole suite. Login is itself rate-limited and the
    // thing under test here is lead workflow, not how often a test can authenticate.
    [admin, other] = await Promise.all([
      signedIn(baseUrl, alpha.admin),
      signedIn(baseUrl, beta.admin),
    ]);

    const created = await admin.post("/api/leads", {
      name: "Beaver Follow-up Test",
      phone: "+16135550199",
      source: "MANUAL",
      jobType: "Moving",
    });
    expect(created.status).toBe(201);
    leadId = created.body.id;
  }, 120_000);

  it("records a no-answer attempt and puts the callback on the lead desk", async () => {
    const due = new Date(Date.now() + 6 * 3600_000).toISOString();
    const res = await admin.post(`/api/leads/${leadId}/activity`, {
      outcome: "NO_ANSWER",
      note: "Left voicemail",
      followUpAt: due,
    });

    expect(res.status).toBe(200);
    expect(res.body.lead.status).toBe("CONTACTED");
    expect(res.body.outcome).toBe("NO_ANSWER");

    const activity = await admin.get(`/api/leads/${leadId}/activity`);
    expect(activity.status).toBe(200);
    expect(activity.body.activity[0].action).toBe("lead.activity.no_answer");
    expect(activity.body.activity[0].meta.note).toBe("Left voicemail");
    expect(activity.body.followUps).toHaveLength(1);
    expect(activity.body.followUps[0].status).toBe("TODO");
    expect(activity.body.followUps[0].title).toContain("Beaver Follow-up Test");

    const queue = await admin.get("/api/leads/follow-ups");
    expect(queue.status).toBe(200);
    const row = queue.body.find((item: { lead?: { id?: string } }) => item.lead?.id === leadId);
    expect(row).toBeTruthy();
    expect(row.lead.name).toBe("Beaver Follow-up Test");
    expect(row.lead.phone).toBe("+16135550199");
    expect(new Date(row.dueDate).toISOString()).toBe(due);

    // The callback is live at this point, so absence on the neighbour's desk proves
    // tenant isolation rather than merely observing a callback that was already closed.
    const neighbourQueue = await other.get("/api/leads/follow-ups");
    expect(neighbourQueue.status).toBe(200);
    expect(
      neighbourQueue.body.some((item: { lead?: { id?: string } }) => item.lead?.id === leadId)
    ).toBe(false);
  });

  it("a later contact closes the previous callback promise and removes it from the inbox", async () => {
    const res = await admin.post(`/api/leads/${leadId}/activity`, {
      outcome: "CONNECTED",
      note: "Spoke with customer; collecting move details",
    });
    expect(res.status).toBe(200);

    const activity = await admin.get(`/api/leads/${leadId}/activity`);
    expect(activity.status).toBe(200);
    expect(activity.body.followUps).toHaveLength(1);
    expect(activity.body.followUps[0].status).toBe("DONE");

    const queue = await admin.get("/api/leads/follow-ups");
    expect(queue.status).toBe(200);
    expect(queue.body.some((item: { lead?: { id?: string } }) => item.lead?.id === leadId)).toBe(false);
  });

  it("refuses made-up outcomes instead of handing them to the database", async () => {
    const res = await admin.post(`/api/leads/${leadId}/activity`, {
      outcome: "MAYBE_LATER_OR_WHATEVER",
    });
    expect(res.status).toBe(400);
    expect(res.body.allowed).toContain("NO_ANSWER");
  });

  it("does not expose another workspace's activity", async () => {
    const res = await other.get(`/api/leads/${leadId}/activity`);
    expect(res.status).toBe(404);
  });
});
