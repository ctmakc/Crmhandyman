import { describe, it, expect, beforeEach } from "vitest";
import {
  adoptIdentity,
  clockLabel,
  dismissRejection,
  flush,
  identityOf,
  memoryStore,
  pendingFor,
  purge,
  queueStatus,
  readOutbox,
  readSnapshot,
  rejectionLine,
  waitedLabel,
  withPending,
  writeSnapshot,
  type ActionResult,
  type FieldJob,
  type KeyStore,
} from "@/lib/offline-queue";

/**
 * The outbox on a phone with no signal.
 *
 * What these guard is the promise the field screen makes: a tap survives a reload, it
 * is answered exactly once, and a dispatcher who moved the same job while the tech was
 * underground beats him — visibly, never silently.
 */

let store: KeyStore;

const JOB = { id: "job-1", title: "Furnace swap — Kowalski", status: "SCHEDULED" as const };

function row(id: string, status: FieldJob["status"]): FieldJob {
  return { id, title: `Job ${id}`, clientName: "C", address: "A", status };
}

/** A server that answers a batch with the outcomes it is told to. */
function serverSaying(outcomes: Record<string, ActionResult["outcome"]>, jobs: FieldJob[] = []) {
  const calls: unknown[] = [];
  const fake = (async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    calls.push(body);
    const results: ActionResult[] = body.actions.map(
      (a: { id: string; jobId: string; to: FieldJob["status"] }) => ({
        id: a.id,
        jobId: a.jobId,
        outcome: outcomes[a.jobId] ?? "applied",
        status: outcomes[a.jobId] === "conflict" ? "CANCELLED" : a.to,
      })
    );
    return {
      ok: true,
      json: async () => ({ results, jobs }),
    } as Response;
  }) as unknown as typeof fetch;
  return { fake, calls };
}

const dead = (async () => {
  throw new TypeError("Failed to fetch");
}) as unknown as typeof fetch;

beforeEach(() => {
  store = memoryStore();
  purge(store);
});

describe("the board this phone holds", () => {
  it("keeps the rows and the minute they arrived", () => {
    writeSnapshot([row("a", "SCHEDULED")], store, 1_700_000_000_000);
    const snapshot = readSnapshot(store);
    expect(snapshot?.jobs).toHaveLength(1);
    expect(snapshot?.fetchedAt).toBe(1_700_000_000_000);
  });

  it("shows nothing rather than something unstamped when the store is corrupt", () => {
    store.setItem("hp.field.v1.today", "{not json");
    expect(readSnapshot(store)).toBeNull();
  });

  it("is wiped when another account claims this browser", () => {
    writeSnapshot([row("a", "SCHEDULED")], store);
    queueStatus(JOB, "IN_PROGRESS", store);

    // Unclaimed storage: this session's own first load, so its board is kept.
    expect(adoptIdentity(identityOf("tenant-A", "user-1"), store)).toBe(false);
    expect(readSnapshot(store)).not.toBeNull();

    // Same person, same workspace, a reload later: nothing is thrown away.
    expect(adoptIdentity(identityOf("tenant-A", "user-1"), store)).toBe(false);
    expect(readSnapshot(store)).not.toBeNull();

    // A different contractor signs in on the same phone.
    expect(adoptIdentity(identityOf("tenant-B", "user-9"), store)).toBe(true);
    expect(readSnapshot(store)).toBeNull();
    expect(readOutbox(store).actions).toHaveLength(0);
  });
});

describe("queueing a tap", () => {
  it("survives a reload — the queue is the storage, not the component", () => {
    queueStatus(JOB, "IN_PROGRESS", store);
    purgeMemoryMirror();
    const box = readOutbox(store);
    expect(box.actions).toHaveLength(1);
    expect(box.actions[0]).toMatchObject({ jobId: "job-1", from: "SCHEDULED", to: "IN_PROGRESS" });
  });

  it("collapses start-then-finish into one transition from what the tech first saw", () => {
    queueStatus(JOB, "IN_PROGRESS", store);
    queueStatus({ ...JOB, status: "IN_PROGRESS" }, "COMPLETED", store);

    const box = readOutbox(store);
    expect(box.actions).toHaveLength(1);
    expect(box.actions[0].from).toBe("SCHEDULED");
    expect(box.actions[0].to).toBe("COMPLETED");
  });

  it("shows the tech his own pending taps on top of the server's rows", () => {
    queueStatus(JOB, "IN_PROGRESS", store);
    const shown = withPending([row("job-1", "SCHEDULED"), row("job-2", "SCHEDULED")], readOutbox(store));
    expect(shown[0].status).toBe("IN_PROGRESS");
    expect(shown[1].status).toBe("SCHEDULED");
  });
});

describe("flushing", () => {
  it("holds everything when the network is gone, and counts the attempt", async () => {
    queueStatus(JOB, "IN_PROGRESS", store);
    const report = await flush(store, dead);

    expect(report.offline).toBe(true);
    expect(readOutbox(store).actions).toHaveLength(1);
    expect(readOutbox(store).actions[0].attempts).toBe(1);
  });

  it("sends what waited and clears it once the server answers", async () => {
    queueStatus(JOB, "IN_PROGRESS", store);
    const { fake, calls } = serverSaying({}, [row("job-1", "IN_PROGRESS")]);

    const report = await flush(store, fake);

    expect(report.applied).toBe(1);
    expect(report.jobs?.[0].status).toBe("IN_PROGRESS");
    expect(readOutbox(store).actions).toHaveLength(0);
    expect(calls).toHaveLength(1);
  });

  /**
   * The elevator case: the request left the phone, the answer never came back. The tap
   * is still queued, the flush runs again, and the server has already applied it. The
   * second batch must be a no-op, not a second event — see the route's compare-and-set.
   */
  it("is safe to replay the same batch", async () => {
    queueStatus(JOB, "IN_PROGRESS", store);
    await flush(store, dead);
    expect(readOutbox(store).actions).toHaveLength(1);

    const { fake, calls } = serverSaying({ "job-1": "applied" });
    await flush(store, fake);
    await flush(store, fake);

    expect(calls).toHaveLength(1); // nothing left to send the second time
    expect(readOutbox(store).actions).toHaveLength(0);
    expect(readOutbox(store).rejections).toHaveLength(0);
  });

  it("turns a conflict into a line the human reads, and drops the tap", async () => {
    queueStatus(JOB, "COMPLETED", store);
    const { fake } = serverSaying({ "job-1": "conflict" });

    const report = await flush(store, fake);

    expect(report.rejected).toHaveLength(1);
    expect(readOutbox(store).actions).toHaveLength(0);
    const [rejection] = readOutbox(store).rejections;
    expect(rejection.serverStatus).toBe("CANCELLED");
    expect(rejectionLine(rejection)).toBe("Finish rejected — dispatch set CANCELLED");

    dismissRejection(rejection.id, store);
    expect(readOutbox(store).rejections).toHaveLength(0);
  });

  it("says so when the job left the board", async () => {
    queueStatus(JOB, "IN_PROGRESS", store);
    const { fake } = serverSaying({ "job-1": "gone" });
    await flush(store, fake);

    const [rejection] = readOutbox(store).rejections;
    expect(rejectionLine(rejection)).toBe("Start rejected — the job is no longer on your board");
  });

  it("keeps a tap the server did not answer for", async () => {
    queueStatus(JOB, "IN_PROGRESS", store);
    const silent = (async () =>
      ({ ok: true, json: async () => ({ results: [], jobs: [] }) }) as Response) as unknown as typeof fetch;

    await flush(store, silent);
    expect(readOutbox(store).actions).toHaveLength(1);
  });

  it("holds the queue when the server refuses the whole batch", async () => {
    queueStatus(JOB, "IN_PROGRESS", store);
    const refused = (async () => ({ ok: false, status: 401 }) as Response) as unknown as typeof fetch;

    const report = await flush(store, refused);
    expect(report.offline).toBe(true);
    expect(readOutbox(store).actions).toHaveLength(1);
  });

  it("sends nothing when nothing waits", async () => {
    const { fake, calls } = serverSaying({});
    const report = await flush(store, fake);
    expect(report.sent).toBe(0);
    expect(calls).toHaveLength(0);
  });
});

describe("what the tech reads", () => {
  it("counts the wait in units a person uses", () => {
    expect(waitedLabel(20_000)).toBe("just now");
    expect(waitedLabel(12 * 60_000)).toBe("12 min");
    expect(waitedLabel(65 * 60_000)).toBe("1 h 5 min");
    expect(waitedLabel(120 * 60_000)).toBe("2 h");
    expect(waitedLabel(30 * 3600_000)).toBe("1 d");
  });

  it("stamps the board with the hour it arrived", () => {
    // Toronto is pinned in vitest.config.mts, so this is the clock the tech is holding.
    expect(clockLabel(new Date("2026-08-12T13:12:00Z").getTime())).toBe("09:12");
  });

  it("finds the pending tap for one job", () => {
    queueStatus(JOB, "IN_PROGRESS", store);
    expect(pendingFor("job-1", store)?.to).toBe("IN_PROGRESS");
    expect(pendingFor("job-2", store)).toBeNull();
  });
});

/**
 * The module keeps an in-memory mirror so React reads what it just wrote. Dropping it
 * without touching storage is how a page reload is simulated here.
 */
function purgeMemoryMirror() {
  const raw = store.getItem("hp.field.v1.outbox");
  purge(store);
  if (raw) store.setItem("hp.field.v1.outbox", raw);
}
