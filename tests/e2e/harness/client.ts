/**
 * A browser, minus the browser.
 *
 * Everything here talks to the running app over HTTP with a real NextAuth cookie jar,
 * because the bugs this suite exists to catch live between the middleware, the guard
 * and the handler — a call to the route function would skip all three.
 *
 * Two mechanics are easy to get wrong and are therefore centralised:
 *   · the session cookie set is host-wide, so each identity keeps its own jar;
 *   · middleware compares the workspace in the ADDRESS with the one in the session,
 *     so on localhost every request needs `?tenant=<slug>`. Attack cases pass the
 *     attacker's own slug while reaching for the victim's id — that is the shape a
 *     real cross-tenant attempt has.
 */

/**
 * The server answers with whatever JSON the route builds; describing every payload
 * again here would only duplicate the handlers and rot next to them. Assertions carry
 * the shape instead, so responses are read loosely on purpose.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Json = any;

export type ApiResponse<T = Json> = {
  status: number;
  body: T;
  headers: Headers;
};

export type Credentials = { slug: string; email: string; password: string };

export type Workspace = {
  slug: string;
  businessName: string;
  /** What signup actually granted, whatever the request body asked for. */
  plan: string;
  admin: Credentials;
  /** The sample worker seeded into every trial workspace; its password is shown once. */
  worker: Credentials;
};

type RequestOptions = {
  method?: string;
  body?: unknown;
  /** Override the workspace in the query string; `null` sends no `?tenant=` at all. */
  tenant?: string | null;
  headers?: Record<string, string>;
  /** Multipart uploads and the urlencoded login form bypass JSON encoding. */
  raw?: BodyInit;
};

/** A stable private address for a seed string — one visitor per identity. */
function ipFromSeed(seed: string): string {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `10.77.${(h >> 8) & 0xff}.${h & 0xff}`;
}

export class Client {
  private jar = new Map<string, string>();

  /**
   * Each identity gets its own stable address, sent as `x-forwarded-for`. The rate
   * limiter keeps its counters in the database now, so one shared address would spend
   * the whole suite's login budget on the first two files. The dev server passes a
   * client-supplied forwarded-for chain through untouched, and with one trusted hop the
   * throttle reads its last entry — this address.
   */
  realIp: string;

  constructor(
    readonly baseUrl: string,
    /** Workspace this identity belongs to; used as the default `?tenant=`. */
    readonly slug: string | null = null,
    /** Filled in after sign-in — handy for asserting on ids the server minted. */
    public user: Record<string, unknown> | null = null,
  ) {
    this.realIp = ipFromSeed(slug ?? "anonymous");
  }

  private cookieHeader() {
    return Array.from(this.jar.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
  }

  private absorb(res: Response) {
    for (const raw of res.headers.getSetCookie()) {
      const [pair] = raw.split(";");
      const eq = pair.indexOf("=");
      if (eq > 0) this.jar.set(pair.slice(0, eq), pair.slice(eq + 1));
    }
  }

  async request<T = Json>(path: string, options: RequestOptions = {}): Promise<ApiResponse<T>> {
    const url = new URL(path, this.baseUrl);
    const tenant = options.tenant === undefined ? this.slug : options.tenant;
    if (tenant) url.searchParams.set("tenant", tenant);

    const headers: Record<string, string> = { "x-forwarded-for": this.realIp, ...(options.headers ?? {}) };
    if (this.jar.size) headers.cookie = this.cookieHeader();

    let payload: BodyInit | undefined;
    if (options.raw !== undefined) {
      payload = options.raw;
    } else if (options.body !== undefined) {
      payload = JSON.stringify(options.body);
      headers["content-type"] = "application/json";
    }

    const res = await fetch(url, {
      method: options.method ?? (payload ? "POST" : "GET"),
      headers,
      body: payload,
      // A 302 from the middleware is the answer, not a step on the way to it.
      redirect: "manual",
    });
    this.absorb(res);

    const text = await res.text();
    let body: unknown = text;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        /* HTML page or a byte stream — keep the raw text */
      }
    }

    return { status: res.status, body: body as T, headers: res.headers };
  }

  get<T = Json>(path: string, options: RequestOptions = {}) {
    return this.request<T>(path, { ...options, method: "GET" });
  }
  post<T = Json>(path: string, body?: unknown, options: RequestOptions = {}) {
    return this.request<T>(path, { ...options, method: "POST", body });
  }
  put<T = Json>(path: string, body?: unknown, options: RequestOptions = {}) {
    return this.request<T>(path, { ...options, method: "PUT", body });
  }
  del<T = Json>(path: string, options: RequestOptions = {}) {
    return this.request<T>(path, { ...options, method: "DELETE" });
  }
  upload<T = Json>(path: string, form: FormData, options: RequestOptions = {}) {
    return this.request<T>(path, { ...options, method: "POST", raw: form });
  }
}

/**
 * An unauthenticated visitor — a fresh one every time. Two anonymous callers sharing
 * one address would also share an intake budget, and the suite files more enquiries
 * than any single visitor is allowed.
 */
let anonSeq = 0;
export function anonymous(baseUrl: string) {
  const client = new Client(baseUrl, null);
  client.realIp = ipFromSeed(`anon-${++anonSeq}-${Date.now()}`);
  return client;
}

/**
 * Poll until the server has caught up, or give up loudly.
 *
 * Some of what this suite asserts on happens deliberately AFTER the response: a lead
 * alert must never hold the thank-you page open, so its journal line lands a moment
 * behind the 201. Reading once and failing would be testing the clock. `probe` returns
 * a falsy value while it is not there yet; the last one is returned when it is.
 */
export async function eventually<T>(
  probe: () => Promise<T>,
  what: string,
  timeoutMs = 10_000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let last: T = undefined as T;
  for (;;) {
    last = await probe();
    if (last) return last;
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 150));
  }
}

/**
 * The credentials flow exactly as the login form drives it: fetch the CSRF token so the
 * double-submit cookie is in the jar, then post the form to the callback.
 */
export async function signIn(baseUrl: string, creds: Credentials): Promise<Client> {
  const client = new Client(baseUrl, creds.slug);
  // Admin and worker of one workspace are different people at different desks.
  client.realIp = ipFromSeed(`${creds.slug}\u0000${creds.email}`);

  const csrf = await client.get<{ csrfToken: string }>("/api/auth/csrf", { tenant: null });
  const form = new URLSearchParams({
    csrfToken: csrf.body.csrfToken,
    email: creds.email,
    password: creds.password,
    slug: creds.slug,
    json: "true",
  });

  await client.request("/api/auth/callback/credentials", {
    method: "POST",
    tenant: null,
    headers: { "content-type": "application/x-www-form-urlencoded" },
    raw: form.toString(),
  });

  const session = await client.get<{ user?: Record<string, unknown> }>("/api/auth/session", {
    tenant: null,
  });
  if (!session.body?.user) {
    throw new Error(`sign-in failed for ${creds.email} @ ${creds.slug}`);
  }
  client.user = session.body.user;
  return client;
}

/**
 * Sign-in is rate limited to ten attempts per address per quarter hour. Every client
 * carries its own `x-real-ip`, but identities are still reused inside a test file
 * instead of signing in again per describe block — the budget is real, just per-workspace.
 */
const sessions = new Map<string, Promise<Client>>();

export function signedIn(baseUrl: string, creds: Credentials): Promise<Client> {
  const key = `${creds.slug}|${creds.email}`;
  const existing = sessions.get(key);
  if (existing) return existing;
  const fresh = signIn(baseUrl, creds);
  sessions.set(key, fresh);
  return fresh;
}

/**
 * Open a workspace through the public signup form. Signup always yields a DEMO trial
 * with sample data, and the sample worker's one-time password comes back in the
 * response — that is how this suite gets a WORKER identity without touching the DB.
 */
export async function registerWorkspace(baseUrl: string, label: string): Promise<Workspace> {
  const stamp = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
  const businessName = `E2E ${label} ${stamp}`;
  const email = `${label.toLowerCase()}.${stamp}@e2e.local`;
  const password = `e2e-${stamp}-password`;

  const res = await fetch(new URL("/api/register", baseUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    // `plan` is deliberately hostile: signup must ignore it and open a trial anyway.
    body: JSON.stringify({ businessName, email, password, plan: "paid" }),
  });
  const body = (await res.json()) as {
    slug?: string;
    plan?: string;
    error?: string;
    sampleWorker?: { workerEmail: string; workerPassword: string };
  };

  if (res.status !== 201 || !body.slug || !body.sampleWorker) {
    throw new Error(`register failed (${res.status}): ${JSON.stringify(body)}`);
  }

  return {
    slug: body.slug,
    businessName,
    plan: body.plan ?? "",
    admin: { slug: body.slug, email, password },
    worker: {
      slug: body.slug,
      email: body.sampleWorker.workerEmail,
      password: body.sampleWorker.workerPassword,
    },
  };
}

/**
 * The API answers in dollars — that is its contract with a bookkeeper and with any
 * integration. Assertions convert through the same door the application uses, so a
 * test never invents its own arithmetic: `cents` for a single amount, `inCents` for a
 * whole payload on its way into a library that works in cents.
 */
export { toCents as cents, toDollars, inCents } from "@/lib/money";

/** Smallest byte string the upload sniffer accepts as a JPEG. */
export function fakeJpeg(size = 64): Buffer {
  const buf = Buffer.alloc(Math.max(size, 12), 0x20);
  buf[0] = 0xff;
  buf[1] = 0xd8;
  buf[2] = 0xff;
  buf[3] = 0xe0;
  return buf;
}
