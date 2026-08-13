import { beforeAll, describe, expect, inject, it } from "vitest";
import { Client, signedIn, type Workspace } from "./harness/client";
import { dayLoad, spanDays } from "@/lib/schedule";

/**
 * Scenario C — the day, over HTTP.
 *
 * The dispatcher's three questions, asked of the real routes: who is this job on, what
 * else is that man holding while it runs, and how long does the work hold him. Load used
 * to be «jobs ÷ heads», a number that never named anybody; this file pins the behaviour
 * that replaced it.
 *
 * The warning is deliberately a report. A mover runs two short jobs back to back and the
 * dispatcher knows it — every assertion below checks that the save WENT THROUGH and the
 * collision came back with it.
 */

const DAY_MINUTES = 24 * 60;

/** A weekday well clear of today, so the fixture never collides with seeded demo work. */
function futureDay(offsetDays: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 30 + offsetDays);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

describe.sequential("Scenario C — crews, collisions and multi-day work", () => {
  let workspace: Workspace;
  let admin: Client;
  let worker: Client;
  let sam = "";
  let dave = "";
  const made: string[] = [];

  const MOVE_DAY = futureDay(0);
  const RENO_DAY = futureDay(2);

  async function openJob(body: Record<string, unknown>) {
    const res = await admin.post("/api/projects", {
      clientName: "Schedule Fixture",
      address: "1 Test Line, Ottawa",
      ...body,
    });
    expect(res.status).toBe(201);
    made.push(res.body.id);
    return res.body as { id: string; conflicts: Array<{ id: string; title: string }> };
  }

  beforeAll(async () => {
    const baseUrl = inject("baseUrl");
    workspace = inject("alpha");
    admin = await signedIn(baseUrl, workspace.admin);
    worker = await signedIn(baseUrl, workspace.worker);

    const hire = async (name: string) => {
      const res = await admin.post("/api/settings/users", {
        name,
        email: `${name.toLowerCase().replace(/\s+/g, ".")}.${Date.now()}@e2e.local`,
        password: "crew-password-not-a-real-one",
        role: "WORKER",
      });
      expect(res.status).toBe(201);
      return res.body.id as string;
    };

    sam = await hire("Sam Carter");
    dave = await hire("Dave Singh");
  });

  it("hands a job to a member of this crew and refuses a stranger's employee", async () => {
    const job = await openJob({
      title: "Two-bedroom move",
      scheduledDate: `${MOVE_DAY}T09:00`,
      durationMinutes: 180,
      assignedToId: sam,
    });
    expect(job.conflicts).toEqual([]);

    const foreign = inject("beta");
    const theirs = await signedIn(inject("baseUrl"), foreign.admin);
    const strangerId = theirs.user?.id as string;

    const rejected = await admin.post("/api/projects", {
      clientName: "Schedule Fixture",
      address: "2 Test Line, Ottawa",
      title: "Handed to a stranger",
      scheduledDate: MOVE_DAY,
      assignedToId: strangerId,
    });
    expect(rejected.status).toBe(400);
  });

  it("warns when one man is put on two jobs at the same time, and saves anyway", async () => {
    const second = await openJob({
      title: "Piano into storage",
      scheduledDate: `${MOVE_DAY}T10:00`,
      durationMinutes: 120,
      assignedToId: sam,
    });

    // The save went through — the answer is a report, not a refusal.
    expect(second.conflicts).toHaveLength(1);
    expect(second.conflicts[0].title).toBe("Two-bedroom move");

    const stored = await admin.get(`/api/projects/${second.id}`);
    expect(stored.body.assignedToId).toBe(sam);
  });

  it("says nothing about two short jobs run back to back", async () => {
    const backToBack = await openJob({
      title: "Studio move, afternoon",
      // The morning job ends at 12:00; touching is not colliding.
      scheduledDate: `${MOVE_DAY}T12:00`,
      durationMinutes: 120,
      assignedToId: sam,
    });
    expect(backToBack.conflicts).toEqual([]);
  });

  it("keeps the collision inside the workspace that has it", async () => {
    const foreign = inject("beta");
    const theirs = await signedIn(inject("baseUrl"), foreign.admin);
    const week = await theirs.get(`/api/projects?window=day&date=${MOVE_DAY}`);
    expect(week.status).toBe(200);
    expect((week.body as Array<{ id: string }>).map((j) => j.id)).not.toContain(made[0]);
  });

  it("counts the day's load off the real assignment, naming who is double-booked", async () => {
    const res = await admin.get(`/api/projects?window=day&date=${MOVE_DAY}`);
    expect(res.status).toBe(200);

    const mine = (res.body as Array<{
      id: string;
      assignedToId: string | null;
      assignedTo: { id: string; name: string } | null;
    }>).filter((j) => made.includes(j.id));

    // Jobs carry the id; the rail prints the name — the same map the screen builds.
    const names = new Map(
      mine.filter((j) => j.assignedTo).map((j) => [j.assignedToId as string, j.assignedTo!.name])
    );
    const load = dayLoad(mine as never, MOVE_DAY, names);

    expect(load.total).toBe(3);
    // Three jobs, one man, and exactly one pair of them overlaps.
    expect(load.crew).toHaveLength(1);
    expect(load.crew[0].count).toBe(3);
    expect(load.clashes.map((p) => p.name)).toEqual(["Sam Carter"]);
  });

  it("runs a renovation across days and keeps it on the week it is running in", async () => {
    const reno = await openJob({
      title: "Kitchen gut and rebuild",
      scheduledDate: RENO_DAY,
      durationMinutes: 4 * DAY_MINUTES,
      assignedToId: dave,
    });
    expect(reno.conflicts).toEqual([]);

    // Asked for the day AFTER it starts: a job filtered by start date alone vanishes here.
    // The stamp is built on the local calendar — `toISOString` would hand back the day
    // before, because local midnight in Toronto is still yesterday in UTC.
    const midRun = futureDay(4);

    const res = await admin.get(`/api/projects?window=day&date=${midRun}`);
    const running = (res.body as Array<{ id: string; durationMinutes: number | null }>).find(
      (j) => j.id === reno.id
    );
    expect(running).toBeDefined();
    expect(spanDays({ id: reno.id, scheduledDate: RENO_DAY, durationMinutes: 4 * DAY_MINUTES })).toBe(4);
  });

  it("keeps the run and the crew out of the field hand's reach", async () => {
    const target = made[made.length - 1];

    // A worker posting the whole job back must not be able to re-crew it or shorten it.
    const meddled = await worker.put(`/api/projects/${target}`, {
      status: "IN_PROGRESS",
      assignedToId: null,
      durationMinutes: 30,
    });
    expect(meddled.status).toBe(200);

    const after = await admin.get(`/api/projects/${target}`);
    expect(after.body.assignedToId).toBe(dave);
    expect(after.body.durationMinutes).toBe(4 * DAY_MINUTES);
    expect(after.body.status).toBe("IN_PROGRESS");
  });

  it("carries an unfinished stop forward without carrying a running renovation", async () => {
    const yesterday = new Date();
    yesterday.setHours(0, 0, 0, 0);
    yesterday.setDate(yesterday.getDate() - 1);
    const pad = (n: number) => String(n).padStart(2, "0");
    const stamp = `${yesterday.getFullYear()}-${pad(yesterday.getMonth() + 1)}-${pad(yesterday.getDate())}`;

    const missed = await openJob({
      title: "Missed furnace call",
      scheduledDate: stamp,
      assignedToId: sam,
    });
    const running = await openJob({
      title: "Basement, day two of five",
      scheduledDate: stamp,
      durationMinutes: 5 * DAY_MINUTES,
      assignedToId: sam,
    });

    const today = await admin.get("/api/today");
    const ids = (today.body as Array<{ id: string }>).map((j) => j.id);
    // Both are on today's board — one because it was missed, one because it is running.
    expect(ids).toContain(missed.id);
    expect(ids).toContain(running.id);
    // Each appears exactly once: a multi-day job is one stop, not one per day it spans.
    expect(ids.filter((id) => id === running.id)).toHaveLength(1);
  });
});
