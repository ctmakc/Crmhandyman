/**
 * THE OUTBOX — what the field screen does when the network is gone.
 *
 * A tech in a basement and a mover in a service elevator both lose the signal mid-shift.
 * The board they opened in the driveway has to stay readable, and the two taps that
 * matter — «Start» and «Finish» — have to survive the dead zone, the lock screen and a
 * reload. Everything here is deliberately boring storage plus one rule:
 *
 *   THE SERVER WINS. A queued tap carries the status the tech was looking at (`from`).
 *   The server applies it only if the job is still in that state, so a dispatcher who
 *   cancelled or rescheduled the same job while the phone was dark is never overwritten.
 *   The tap comes back as a REJECTION the human can read, never as a silent loss.
 *
 * WHAT IS ALLOWED IN THE QUEUE. Only a status transition, because setting a status is
 * idempotent by nature: «status = COMPLETED» applied twice leaves the same row, and the
 * elevator that drops the connection mid-request cannot double anything. Taking a
 * payment and uploading a photo are NOT idempotent — each replay writes another row, so
 * a lost response would book the same $500 twice. Those actions stay online-only.
 *
 * Storage is localStorage under one version prefix. Bumping the prefix, signing out and
 * switching workspace all wipe it: one contractor's board in another contractor's
 * browser is the same leak as a cross-tenant query, only on the client side.
 */

export type FieldStatus = "SCHEDULED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";

/** Bump to invalidate every phone's stored board and outbox at once. */
export const FIELD_STORE_VERSION = "v1";

const KEY = {
  identity: `hp.field.${FIELD_STORE_VERSION}.identity`,
  snapshot: `hp.field.${FIELD_STORE_VERSION}.today`,
  outbox: `hp.field.${FIELD_STORE_VERSION}.outbox`,
};

/** Every key this module has ever owned, so a purge leaves nothing behind. */
const PREFIX = "hp.field.";

export interface QueuedAction {
  /** Minted on the phone. The server echoes it, so a replayed batch is recognisable. */
  id: string;
  jobId: string;
  jobTitle: string;
  /** What the tech was looking at when he tapped — the fence the server checks. */
  from: FieldStatus;
  to: FieldStatus;
  queuedAt: number;
  attempts: number;
}

export type RejectionReason = "conflict" | "gone" | "invalid";

export interface Rejection {
  id: string;
  jobId: string;
  jobTitle: string;
  to: FieldStatus;
  reason: RejectionReason;
  /** Where the job actually is, as the server sees it. */
  serverStatus: FieldStatus | null;
  at: number;
}

export interface Outbox {
  actions: QueuedAction[];
  rejections: Rejection[];
}

export interface FieldJob {
  id: string;
  title: string;
  clientName: string;
  address: string;
  phone?: string | null;
  jobType?: string | null;
  status: FieldStatus;
  scheduledDate?: string | null;
  /** How long the work runs. A run still going is not a missed stop. */
  durationMinutes?: number | null;
  description?: string | null;
  assignedToId?: string | null;
  equipment?: Array<{
    kind: string;
    brand?: string | null;
    model?: string | null;
    serial?: string | null;
  }>;
}

export interface Snapshot {
  /** When the server last answered. What the «data from 09:12» line prints. */
  fetchedAt: number;
  jobs: FieldJob[];
}

/* ------------------------------------------------------------------------- *
 * Storage
 * ------------------------------------------------------------------------- */

/** The slice of the Storage contract this module uses — so a test can hand it a map. */
export interface KeyStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  key(index: number): string | null;
  readonly length: number;
}

export function memoryStore(): KeyStore {
  const map = new Map<string, string>();
  return {
    getItem: (k) => (map.has(k) ? (map.get(k) as string) : null),
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
    key: (i) => Array.from(map.keys())[i] ?? null,
    get length() {
      return map.size;
    },
  };
}

/** Server render and a browser with storage denied both get a store that forgets. */
const scratch = memoryStore();

export function defaultStore(): KeyStore {
  if (typeof window === "undefined") return scratch;
  try {
    const ls = window.localStorage;
    ls.getItem(KEY.identity);
    return ls;
  } catch {
    return scratch;
  }
}

function readJson<T>(store: KeyStore, key: string): T | null {
  const raw = store.getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    store.removeItem(key);
    return null;
  }
}

function writeJson(store: KeyStore, key: string, value: unknown): void {
  try {
    store.setItem(key, JSON.stringify(value));
  } catch {
    // A full or locked storage costs the offline board, never the tap in front of the
    // tech: the action is already in memory and the flush below still runs.
  }
}

/* ------------------------------------------------------------------------- *
 * Identity — the client-side tenant fence
 * ------------------------------------------------------------------------- */

/** Who this stored board belongs to. Workspace and person, both. */
export function identityOf(tenantId?: string | null, userId?: string | null): string {
  return `${tenantId ?? ""}/${userId ?? ""}`;
}

/**
 * Claim the storage for this session, wiping it if it belonged to anyone else.
 *
 * Signing out purges through the service worker; this is the second gate, for the day
 * that request never reaches the network — the owner hands the phone to a new tech, he
 * signs in, and the previous crew's board must not be sitting there.
 */
export function adoptIdentity(identity: string, store: KeyStore = defaultStore()): boolean {
  const held = store.getItem(KEY.identity);
  if (held === identity) return false;
  // Unclaimed storage is this session's own first load — the board it may have just
  // written belongs to nobody else, so claiming it costs the tech nothing.
  if (held !== null) purge(store);
  try {
    store.setItem(KEY.identity, identity);
  } catch {
    // Storage denied: the board simply never survives a reload on this phone.
  }
  return held !== null;
}

/** Wipe every trace of a board from this browser. */
export function purge(store: KeyStore = defaultStore()): void {
  const doomed: string[] = [];
  for (let i = 0; i < store.length; i++) {
    const k = store.key(i);
    if (k && k.startsWith(PREFIX)) doomed.push(k);
  }
  for (const k of doomed) store.removeItem(k);
  cache = null;
  notify();
}

/* ------------------------------------------------------------------------- *
 * The board
 * ------------------------------------------------------------------------- */

export function writeSnapshot(
  jobs: FieldJob[],
  store: KeyStore = defaultStore(),
  now: number = Date.now()
): Snapshot {
  const snapshot: Snapshot = { fetchedAt: now, jobs };
  writeJson(store, KEY.snapshot, snapshot);
  return snapshot;
}

export function readSnapshot(store: KeyStore = defaultStore()): Snapshot | null {
  const snapshot = readJson<Snapshot>(store, KEY.snapshot);
  if (!snapshot || !Array.isArray(snapshot.jobs) || typeof snapshot.fetchedAt !== "number") {
    return null;
  }
  return snapshot;
}

/* ------------------------------------------------------------------------- *
 * The outbox
 * ------------------------------------------------------------------------- */

/** In-memory mirror, so React reads the same object it just wrote. */
let cache: Outbox | null = null;

export function readOutbox(store: KeyStore = defaultStore()): Outbox {
  if (cache) return cache;
  const stored = readJson<Outbox>(store, KEY.outbox);
  cache = {
    actions: Array.isArray(stored?.actions) ? (stored as Outbox).actions : [],
    rejections: Array.isArray(stored?.rejections) ? (stored as Outbox).rejections : [],
  };
  return cache;
}

function writeOutbox(box: Outbox, store: KeyStore = defaultStore()): Outbox {
  cache = box;
  writeJson(store, KEY.outbox, box);
  notify();
  return box;
}

let counter = 0;
function actionId(): string {
  // Unique per phone, and stable across a retry: the server dedupes replays by status,
  // this only has to tell two taps apart in the same second.
  counter += 1;
  return `${Date.now().toString(36)}-${counter.toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

/**
 * Queue one status change.
 *
 * A job holds at most one pending tap. «Start» then «Finish» in a dead zone collapses to
 * a single SCHEDULED→COMPLETED transition: the intermediate state was never seen by
 * anyone, the fence still points at what the tech first saw, and the outbox reads as one
 * line instead of a stack the human has to reconcile.
 */
export function queueStatus(
  job: { id: string; title: string; status: FieldStatus },
  to: FieldStatus,
  store: KeyStore = defaultStore(),
  now: number = Date.now()
): QueuedAction {
  const box = readOutbox(store);
  const pending = box.actions.find((a) => a.jobId === job.id);

  const action: QueuedAction = pending
    ? { ...pending, to, attempts: 0 }
    : {
        id: actionId(),
        jobId: job.id,
        jobTitle: job.title,
        from: job.status,
        to,
        queuedAt: now,
        attempts: 0,
      };

  writeOutbox(
    {
      actions: [...box.actions.filter((a) => a.jobId !== job.id), action],
      // A fresh tap on a job answers its own rejection.
      rejections: box.rejections.filter((r) => r.jobId !== job.id),
    },
    store
  );
  return action;
}

export function dismissRejection(id: string, store: KeyStore = defaultStore()): Outbox {
  const box = readOutbox(store);
  return writeOutbox({ ...box, rejections: box.rejections.filter((r) => r.id !== id) }, store);
}

/** The pending tap for a job, if the human has one in flight. */
export function pendingFor(jobId: string, store: KeyStore = defaultStore()): QueuedAction | null {
  return readOutbox(store).actions.find((a) => a.jobId === jobId) ?? null;
}

/**
 * The board as the tech should see it: the server's rows with his own pending taps
 * already applied. Without this his tap disappears on the next refresh and he taps again.
 */
export function withPending(jobs: FieldJob[], box: Outbox): FieldJob[] {
  if (!box.actions.length) return jobs;
  const byJob = new Map(box.actions.map((a) => [a.jobId, a]));
  return jobs.map((job) => {
    const pending = byJob.get(job.id);
    return pending ? { ...job, status: pending.to } : job;
  });
}

/* ------------------------------------------------------------------------- *
 * Subscriptions — one bus for the bar and the board
 * ------------------------------------------------------------------------- */

type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

function notify(): void {
  for (const fn of Array.from(listeners)) fn();
}

/* ------------------------------------------------------------------------- *
 * Flushing
 * ------------------------------------------------------------------------- */

/**
 * Whether the server actually answered last time we tried.
 *
 * `navigator.onLine` only knows whether the phone has an interface up, so in a service
 * elevator it happily reports «online» with five bars of nothing. The truthful signal is
 * a request that came back, which is exactly what a flush is.
 */
let reachable = true;

export function isReachable(): boolean {
  return reachable;
}

function setReachable(value: boolean): void {
  if (reachable === value) return;
  reachable = value;
  notify();
}

export type ActionOutcome = "applied" | "conflict" | "gone" | "invalid";

export interface ActionResult {
  id: string;
  outcome: ActionOutcome;
  jobId: string;
  /** The job's status on the server after the attempt. */
  status: FieldStatus | null;
}

export interface FlushReport {
  /** No network, or the server never answered: the queue is untouched and still waiting. */
  offline: boolean;
  sent: number;
  applied: number;
  rejected: Rejection[];
  /** The fresh board the server returned with the batch, when it answered. */
  jobs: FieldJob[] | null;
}

const IDLE: FlushReport = { offline: false, sent: 0, applied: 0, rejected: [], jobs: null };

/**
 * Push the outbox at the server.
 *
 * Every outcome removes the action — applied or rejected, it is answered. What survives
 * a failed flush is only what the server never saw, which is what makes running this on
 * every reconnect safe.
 */
export async function flush(
  store: KeyStore = defaultStore(),
  fetchImpl: typeof fetch = fetch
): Promise<FlushReport> {
  const box = readOutbox(store);
  if (!box.actions.length) return IDLE;

  const batch = box.actions.map((a) => ({ id: a.id, jobId: a.jobId, from: a.from, to: a.to }));

  let payload: { results?: ActionResult[]; jobs?: FieldJob[] };
  try {
    const res = await fetchImpl("/api/today", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actions: batch }),
    });
    if (!res.ok) {
      // 401 while the session sorts itself out, 402 on an expired trial, 500 on a bad
      // day: none of them is the tech's fault and none of them loses his tap.
      bumpAttempts(box, store);
      setReachable(false);
      return { ...IDLE, offline: true, sent: batch.length };
    }
    payload = await res.json();
    setReachable(true);
  } catch {
    bumpAttempts(box, store);
    setReachable(false);
    return { ...IDLE, offline: true, sent: batch.length };
  }

  const results = Array.isArray(payload.results) ? payload.results : [];
  const seen = new Map(results.map((r) => [r.id, r]));
  const rejected: Rejection[] = [];
  const keep: QueuedAction[] = [];
  let applied = 0;

  for (const action of box.actions) {
    const result = seen.get(action.id);
    if (!result) {
      keep.push({ ...action, attempts: action.attempts + 1 });
      continue;
    }
    if (result.outcome === "applied") {
      applied += 1;
      continue;
    }
    rejected.push({
      id: action.id,
      jobId: action.jobId,
      jobTitle: action.jobTitle,
      to: action.to,
      reason: result.outcome,
      serverStatus: result.status ?? null,
      at: Date.now(),
    });
  }

  writeOutbox({ actions: keep, rejections: [...box.rejections, ...rejected] }, store);

  return {
    offline: false,
    sent: batch.length,
    applied,
    rejected,
    jobs: Array.isArray(payload.jobs) ? payload.jobs : null,
  };
}

function bumpAttempts(box: Outbox, store: KeyStore) {
  writeOutbox(
    { ...box, actions: box.actions.map((a) => ({ ...a, attempts: a.attempts + 1 })) },
    store
  );
}

/* ------------------------------------------------------------------------- *
 * The sync loop
 * ------------------------------------------------------------------------- */

let syncing: Promise<FlushReport> | null = null;

/** Flush now, and never twice at once — two overlapping batches would race each other. */
export function syncNow(store: KeyStore = defaultStore()): Promise<FlushReport> {
  if (syncing) return syncing;
  const run = flush(store).finally(() => {
    syncing = null;
  });
  syncing = run;
  return run;
}

/**
 * Reconnect and retry. `online` fires when the OS thinks there is a network, which is
 * optimistic in an elevator, so a slow beat keeps trying while anything is waiting.
 */
export function startSync(onReport?: (report: FlushReport) => void): () => void {
  if (typeof window === "undefined") return () => {};

  const run = () => {
    if (!readOutbox().actions.length) return;
    void syncNow().then((report) => onReport?.(report));
  };

  const beat = window.setInterval(run, 30_000);
  window.addEventListener("online", run);
  run();

  return () => {
    window.clearInterval(beat);
    window.removeEventListener("online", run);
  };
}

/* ------------------------------------------------------------------------- *
 * Human wording
 * ------------------------------------------------------------------------- */

/** How long a tap has been waiting, for the line the tech reads: «WAITING 12 MIN». */
export function waitedLabel(ms: number): string {
  if (ms < 60_000) return "just now";
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours < 24) return rest ? `${hours} h ${rest} min` : `${hours} h`;
  const days = Math.floor(hours / 24);
  return `${days} d`;
}

/** The clock on a cached board: «data from 09:12». */
export function clockLabel(at: number): string {
  return new Date(at).toLocaleTimeString("en-CA", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/** Why the server said no, in five words the tech can act on. */
export function rejectionReason(r: Rejection): string {
  if (r.reason === "gone") return "no longer on your board";
  if (r.reason === "invalid") return "the office would not take it";
  return `dispatch set ${(r.serverStatus ?? "another status").replace(/_/g, " ")}`;
}

/** The whole sentence — for the toast and for the job card. */
export function rejectionLine(r: Rejection): string {
  const verb = r.to === "COMPLETED" ? "Finish" : "Start";
  if (r.reason === "gone") return `${verb} did not stick — this job is off your board now`;
  return `${verb} did not stick — ${rejectionReason(r)}`;
}
