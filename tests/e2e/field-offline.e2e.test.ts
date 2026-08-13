import { beforeAll, describe, expect, inject, it } from "vitest";
import { Client, signedIn, type Workspace } from "./harness/client";
import { dayStamp } from "@/lib/dates";

/**
 * Scenario D — the field with no signal.
 *
 * The phone's outbox (src/lib/offline-queue.ts) replays taps into `POST /api/today`
 * whenever the network comes back. Three properties have to hold there or the queue is
 * a liability rather than a feature:
 *
 *   · REPLAY IS FREE. The elevator drops the connection mid-request, the tap is still
 *     queued, and it goes again. The second arrival must change nothing.
 *   · THE SERVER WINS. The dispatcher cancelled the job while the tech was in a
 *     basement; his «Finish» is refused and comes back as a conflict he can read.
 *   · THE TENANT FENCE HOLDS. A job id off a stranger's phone is a claim, not a fact.
 */

const DAY = 24 * 60 * 60 * 1000;

/**
 * The shop's calendar day, never the UTC one. Written with `toISOString()` these tests
 * booked tomorrow's work every evening after eight — the same defect the product itself
 * was caught with (GO-LIVE Б4), reproduced in the harness that is supposed to catch it.
 */
const localDay = (at: Date = new Date()) => dayStamp(at);

type Fixture = { admin: Client; worker: Client; workspace: Workspace; jobId: string };

async function furnish(baseUrl: string, workspace: Workspace, title: string): Promise<Fixture> {
  const admin = await signedIn(baseUrl, workspace.admin);
  const worker = await signedIn(baseUrl, workspace.worker);

  const today = localDay();
  const job = await admin.post("/api/projects", {
    clientName: `Field client of ${workspace.slug}`,
    phone: "613-555-0330",
    address: "44 Bank St",
    title,
    jobType: "Furnace service",
    scheduledDate: today,
    assignedToId: (worker.user as { id: string }).id,
  });
  expect(job.status).toBe(201);

  return { admin, worker, workspace, jobId: job.body.id };
}

/** The board straight from the server, the way the phone stores it. */
async function statusOf(client: Client, jobId: string): Promise<string | null> {
  const board = await client.get("/api/today");
  const row = (board.body as Array<{ id: string; status: string }>).find((j) => j.id === jobId);
  return row?.status ?? null;
}

function tap(jobId: string, from: string, to: string, id = `act-${Math.random().toString(36).slice(2)}`) {
  return { id, jobId, from, to };
}

describe("the field outbox against the real server", () => {
  let a: Fixture;
  let b: Fixture;
  let baseUrl: string;

  beforeAll(async () => {
    baseUrl = inject("baseUrl");
    a = await furnish(baseUrl, inject("alpha"), "Basement furnace — offline run");
    b = await furnish(baseUrl, inject("beta"), "Someone else's job");
  }, 120_000);

  it("puts today's stop on the tech's board", async () => {
    expect(await statusOf(a.worker, a.jobId)).toBe("SCHEDULED");
  });

  it("applies a queued start and hands the fresh board back with it", async () => {
    const res = await a.worker.post("/api/today", {
      actions: [tap(a.jobId, "SCHEDULED", "IN_PROGRESS")],
    });

    expect(res.status).toBe(200);
    expect(res.body.results[0]).toMatchObject({ outcome: "applied", status: "IN_PROGRESS" });
    // The board rides back with the batch: one round trip in a dead zone, not two.
    const row = res.body.jobs.find((j: { id: string }) => j.id === a.jobId);
    expect(row.status).toBe("IN_PROGRESS");
  });

  /**
   * The property the whole queue rests on. Setting a status is idempotent by nature,
   * and the route proves it twice over: the same action id replayed, and a DIFFERENT
   * action id carrying the same intent — which is what a phone that lost its storage
   * and re-queued would send.
   */
  it("swallows a replay of the same tap", async () => {
    const action = tap(a.jobId, "SCHEDULED", "IN_PROGRESS", "act-replay");

    const first = await a.worker.post("/api/today", { actions: [action] });
    const second = await a.worker.post("/api/today", { actions: [action] });
    const third = await a.worker.post("/api/today", {
      actions: [tap(a.jobId, "SCHEDULED", "IN_PROGRESS", "act-replay-other-id")],
    });

    for (const res of [first, second, third]) {
      expect(res.body.results[0].outcome).toBe("applied");
      expect(res.body.results[0].status).toBe("IN_PROGRESS");
    }
    expect(await statusOf(a.worker, a.jobId)).toBe("IN_PROGRESS");
  });

  it("answers every tap in a batch on its own terms", async () => {
    const second = await a.admin.post("/api/projects", {
      clientName: "Second stop",
      address: "8 Elgin St",
      title: "Second stop of the day",
      scheduledDate: localDay(),
      assignedToId: (a.worker.user as { id: string }).id,
    });

    const res = await a.worker.post("/api/today", {
      actions: [
        tap(a.jobId, "SCHEDULED", "IN_PROGRESS"), // already there — a replay
        tap(second.body.id, "SCHEDULED", "IN_PROGRESS"),
        tap("no-such-job", "SCHEDULED", "COMPLETED"),
      ],
    });

    const outcomes = res.body.results.map((r: { outcome: string }) => r.outcome);
    expect(outcomes).toEqual(["applied", "applied", "gone"]);
  });

  it("refuses a tap the dispatcher has already overtaken, and says where the job is", async () => {
    const job = await a.admin.post("/api/projects", {
      clientName: "Cancelled underneath him",
      address: "12 Rideau St",
      title: "Job the office killed",
      scheduledDate: localDay(),
      assignedToId: (a.worker.user as { id: string }).id,
    });

    // The tech is in a basement; the office cancels the job above his head.
    await a.admin.put(`/api/projects/${job.body.id}`, { status: "CANCELLED" });

    // He walks out and the phone flushes the tap he took twenty minutes ago.
    const res = await a.worker.post("/api/today", {
      actions: [tap(job.body.id, "SCHEDULED", "COMPLETED")],
    });

    expect(res.body.results[0]).toMatchObject({ outcome: "conflict", status: "CANCELLED" });

    const after = await a.admin.get(`/api/projects/${job.body.id}`);
    expect(after.body.status).toBe("CANCELLED");
  });

  it("refuses a status the field is not allowed to set", async () => {
    const res = await a.worker.post("/api/today", {
      actions: [tap(a.jobId, "IN_PROGRESS", "CANCELLED")],
    });
    expect(res.body.results[0].outcome).toBe("invalid");
    expect(await statusOf(a.worker, a.jobId)).toBe("IN_PROGRESS");
  });

  it("refuses a malformed batch", async () => {
    expect((await a.worker.post("/api/today", {})).status).toBe(400);
    expect((await a.worker.post("/api/today", { actions: "start everything" })).status).toBe(400);
    expect(
      (await a.worker.post("/api/today", { actions: new Array(51).fill(tap(a.jobId, "SCHEDULED", "COMPLETED")) }))
        .status
    ).toBe(413);
  });

  it("will not move another workspace's job", async () => {
    const before = await b.admin.get(`/api/projects/${b.jobId}`);

    const res = await a.worker.post("/api/today", {
      actions: [tap(b.jobId, "SCHEDULED", "COMPLETED")],
    });

    expect(res.body.results[0].outcome).toBe("gone");
    const after = await b.admin.get(`/api/projects/${b.jobId}`);
    expect(after.body.status).toBe(before.body.status);
  });

  it("keeps a signed-out phone out entirely", async () => {
    const { anonymous } = await import("./harness/client");
    const res = await anonymous(baseUrl).post(
      "/api/today",
      { actions: [tap(a.jobId, "SCHEDULED", "COMPLETED")] },
      { tenant: a.workspace.slug }
    );
    expect([401, 403]).toContain(res.status);
  });

  it("finishes yesterday's carried-over job", async () => {
    const yesterday = localDay(new Date(Date.now() - DAY));
    const job = await a.admin.post("/api/projects", {
      clientName: "Carried over",
      address: "3 Sparks St",
      title: "Yesterday's unfinished stop",
      scheduledDate: yesterday,
      assignedToId: (a.worker.user as { id: string }).id,
    });

    const res = await a.worker.post("/api/today", {
      actions: [tap(job.body.id, "SCHEDULED", "COMPLETED")],
    });
    expect(res.body.results[0].outcome).toBe("applied");

    // Closed out, so it drops off the board it was carried onto.
    expect(await statusOf(a.worker, job.body.id)).toBeNull();
  });
});
