import { beforeAll, describe, expect, inject, it } from "vitest";
import { signedIn, type Workspace } from "./harness/client";

describe.sequential("lead activity and follow-up", () => {
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
      name: "Beaver Follow-up Test",
      phone: "+16135550199",
      source: "MANUAL",
      jobType: "Moving",
    });
    expect(created.status).toBe(201);
    leadId = created.body.id;
  }, 120_000);

  it("records a no-answer attempt and creates a dated crew task", async () => {
    const admin = await signedIn(baseUrl, alpha.admin);
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
  });

  it("a later contact closes the previous callback promise", async () => {
    const admin = await signedIn(baseUrl, alpha.admin);
    const res = await admin.post(`/api/leads/${leadId}/activity`, {
      outcome: "CONNECTED",
      note: "Spoke with customer; collecting move details",
    });
    expect(res.status).toBe(200);

    const activity = await admin.get(`/api/leads/${leadId}/activity`);
    expect(activity.status).toBe(200);
    expect(activity.body.followUps).toHaveLength(1);
    expect(activity.body.followUps[0].status).toBe("DONE");
  });

  it("refuses made-up outcomes instead of handing them to the database", async () => {
    const admin = await signedIn(baseUrl, alpha.admin);
    const res = await admin.post(`/api/leads/${leadId}/activity`, {
      outcome: "MAYBE_LATER_OR_WHATEVER",
    });
    expect(res.status).toBe(400);
    expect(res.body.allowed).toContain("NO_ANSWER");
  });

  it("does not expose another workspace's activity or follow-ups", async () => {
    const other = await signedIn(baseUrl, beta.admin);
    const res = await other.get(`/api/leads/${leadId}/activity`);
    expect(res.status).toBe(404);
  });
});
