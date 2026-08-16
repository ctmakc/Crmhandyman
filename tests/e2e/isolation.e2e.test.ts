import { beforeAll, describe, expect, inject, it } from "vitest";
import {
  Client,
  anonymous,
  cents,
  fakeJpeg,
  signIn,
  signedIn,
  type Workspace,
} from "./harness/client";

/**
 * Scenario B — two workspaces on one server.
 *
 * The whole product rests on one promise: a contractor's leads, prices, photos and
 * books are invisible to every other contractor on the same box. This file re-runs the
 * attack matrix from AUDIT-2026-08-11 and extends it over the surfaces wave 5б added —
 * the journal, landing intake, job photos and the health probe.
 *
 * Attacks are shaped the way a real one is: the attacker keeps their own session and
 * their own workspace in the address, and reaches for the victim's id in the path or
 * the body. Anything else would be stopped by the middleware and prove nothing.
 *
 * The four cross-tenant writes at the bottom were open holes when this file was
 * written. They are closed; the tests stay as the guard that keeps them closed.
 */

type Fixture = {
  admin: Client;
  worker: Client;
  workspace: Workspace;
  projectId: string;
  leadId: string;
  taskId: string;
  invoiceId: string;
  estimateId: string;
  paymentId: string;
  photoId: string;
  intakeKeyId: string;
  intakeKey: string;
  clientId: string;
};

const YEAR = new Date().getFullYear();

/** Everything one workspace needs to own so the other can be caught reaching for it. */
async function furnish(baseUrl: string, workspace: Workspace): Promise<Fixture> {
  const admin = await signedIn(baseUrl, workspace.admin);
  const worker = await signedIn(baseUrl, workspace.worker);

  const lead = await admin.post("/api/leads", {
    name: `Client of ${workspace.slug}`,
    phone: "613-555-0200",
    email: `client@${workspace.slug}.test`,
    address: "9 Somerset St",
    city: "Ottawa",
    jobType: "Basement finishing",
  });
  const project = await admin.post(`/api/leads/${lead.body.id}/convert`, {
    title: `Confidential job of ${workspace.slug}`,
  });
  const estimate = await admin.post(`/api/projects/${project.body.id}/estimate`, {
    lineItems: [{ description: "Secret price", qty: 1, unit: "lot", unitPrice: 5000 }],
    taxRate: 0.13,
  });
  await admin.put(`/api/projects/${project.body.id}/estimate`, {
    id: estimate.body.id,
    status: "ACCEPTED",
  });
  const invoice = await admin.post("/api/invoices", {
    projectId: project.body.id,
    estimateId: estimate.body.id,
  });
  const payment = await admin.put(`/api/invoices/${invoice.body.id}`, {
    action: "pay",
    amount: 100,
    method: "CASH",
  });
  const invoiceDetail = await admin.get(`/api/invoices/${invoice.body.id}`);
  const task = await admin.post("/api/tasks", {
    title: `Task of ${workspace.slug}`,
    projectId: project.body.id,
  });

  const form = new FormData();
  form.set("file", new Blob([new Uint8Array(fakeJpeg(2048))], { type: "image/jpeg" }), "site.jpg");
  form.set("kind", "BEFORE");
  form.set("caption", `Site of ${workspace.slug}`);
  const photo = await admin.upload(`/api/projects/${project.body.id}/photos`, form);

  const key = await admin.post("/api/settings/intake-keys", {
    label: `Landing of ${workspace.slug}`,
    source: "FACEBOOK",
  });

  const clients = await admin.get("/api/clients");
  const clientId = Array.isArray(clients.body) && clients.body.length ? clients.body[0].id : "";

  expect(payment.status, "fixture payment").toBe(200);
  expect(photo.status, "fixture photo").toBe(201);
  expect(key.status, "fixture intake key").toBe(201);

  return {
    admin,
    worker,
    workspace,
    projectId: project.body.id,
    leadId: lead.body.id,
    taskId: task.body.id,
    invoiceId: invoice.body.id,
    estimateId: estimate.body.id,
    paymentId: invoiceDetail.body.payments[0].id,
    photoId: photo.body.id,
    intakeKeyId: key.body.id,
    intakeKey: key.body.key,
    clientId,
  };
}

describe.sequential("Scenario B — one workspace cannot reach another", () => {
  let baseUrl = "";
  let a: Fixture;
  let b: Fixture;

  beforeAll(async () => {
    baseUrl = inject("baseUrl");
    a = await furnish(baseUrl, inject("alpha"));
    b = await furnish(baseUrl, inject("beta"));
  }, 120_000);

  describe("the address must match the session", () => {
    it("a session on someone else's workspace slug is refused", async () => {
      const res = await b.admin.get("/api/leads", { tenant: a.workspace.slug });
      expect(res.status).toBe(403);
    });

    it("an anonymous caller gets nothing but the login door", async () => {
      const guest = anonymous(baseUrl);
      for (const path of ["/api/leads", "/api/invoices", "/api/audit", "/api/finance/summary"]) {
        const res = await guest.get(path, { tenant: a.workspace.slug });
        expect(res.status, path).toBe(401);
      }
      const page = await guest.get("/finance", { tenant: a.workspace.slug });
      expect(page.status).toBe(307);
      expect(page.headers.get("location")).toContain("/login");
    });

    it("credentials do not carry across workspaces", async () => {
      // Same password, someone else's front door. Users are unique per workspace, so
      // this must fail on the lookup rather than on the hash.
      await expect(
        signIn(baseUrl, { ...b.workspace.admin, slug: a.workspace.slug }),
      ).rejects.toThrow(/sign-in failed/);
    });

    it("the public slug lookup no longer hands out a workspace", async () => {
      const res = await anonymous(baseUrl).get(`/api/tenant/resolve?slug=${a.workspace.slug}`, {
        tenant: null,
      });
      expect(res.status).toBe(404);
    });
  });

  describe("a revoked session is signed out, not handed an empty workspace", () => {
    /**
     * A fired worker's cookie stays syntactically valid until it expires, and the routes
     * converted to requireUser() used to read its empty identity as tenantId="" and answer
     * an empty 200 instead of a clean 401. The jwt callback re-checks the row on every
     * request, so one delete is enough to turn the next call this worker makes into a
     * revoked session — the exact case the guard now rejects.
     */
    it("a deleted user gets 401 on a converted route, not an empty 200", async () => {
      const stamp = Date.now().toString(36);
      const email = `revoked.${stamp}@e2e.local`;
      const password = `revoked-${stamp}-password`;

      const created = await a.admin.post("/api/settings/users", {
        name: "Revoked Ray",
        email,
        password,
        role: "WORKER",
      });
      expect(created.status).toBe(201);

      // While still on the crew the worker reads their own workspace normally.
      const doomed = await signIn(baseUrl, { slug: a.workspace.slug, email, password });
      expect((await doomed.get("/api/leads")).status).toBe(200);

      const fired = await a.admin.del(`/api/settings/users?id=${created.body.id}`);
      expect(fired.status).toBe(200);

      // The stale cookie is now a revoked session: a clean 401, and never a list.
      const after = await doomed.get("/api/leads");
      expect(after.status).toBe(401);
      expect(Array.isArray(after.body)).toBe(false);
    });
  });

  describe("the audit matrix, re-run", () => {
    it("lists show only the caller's own rows", async () => {
      const cases: Array<[string, string]> = [
        ["/api/leads", a.leadId],
        ["/api/projects", a.projectId],
        ["/api/tasks", a.taskId],
        ["/api/invoices", a.invoiceId],
        ["/api/clients", a.clientId],
      ];
      for (const [path, foreignId] of cases) {
        const res = await b.admin.get(path);
        expect(res.status, path).toBe(200);
        const rows = (Array.isArray(res.body) ? res.body : res.body.rows ?? []) as Array<{
          id: string;
        }>;
        expect(rows.map((r) => r.id), path).not.toContain(foreignId);
      }
    });

    it("a foreign job, lead, invoice or estimate is simply not there", async () => {
      const probes: Array<[string, string]> = [
        ["GET", `/api/projects/${a.projectId}`],
        ["GET", `/api/leads/${a.leadId}`],
        ["GET", `/api/invoices/${a.invoiceId}`],
        ["GET", `/api/projects/${a.projectId}/estimate`],
        ["GET", `/api/projects/${a.projectId}/history`],
        ["GET", `/api/invoices/${a.invoiceId}/pdf`],
        ["GET", `/api/projects/${a.projectId}/estimate/pdf?estimateId=${a.estimateId}`],
        // The estimate id alone must not carry either, even under the attacker's own job.
        ["GET", `/api/projects/${b.projectId}/estimate/pdf?estimateId=${a.estimateId}`],
      ];
      for (const [, path] of probes) {
        const res = await b.admin.get(path);
        expect(res.status, path).toBe(404);
      }
    });

    it("a foreign task cannot be edited or deleted", async () => {
      const edited = await b.admin.put(`/api/tasks/${a.taskId}`, { title: "hijacked" });
      expect(edited.status).toBe(404);
      const removed = await b.admin.del(`/api/tasks/${a.taskId}`);
      expect(removed.status).toBe(404);

      const still = await a.admin.get("/api/tasks");
      const mine = (still.body as Array<{ id: string; title: string }>).find(
        (t) => t.id === a.taskId,
      );
      expect(mine?.title).toBe(`Task of ${a.workspace.slug}`);
    });

    it("a foreign estimate cannot be read or accepted", async () => {
      const flipped = await b.admin.put(`/api/projects/${a.projectId}/estimate`, {
        id: a.estimateId,
        status: "REJECTED",
      });
      expect(flipped.status).toBe(404);

      // Also with the attacker's own project in the path — the id alone must not carry.
      const sideways = await b.admin.put(`/api/projects/${b.projectId}/estimate`, {
        id: a.estimateId,
        status: "REJECTED",
      });
      expect(sideways.status).toBe(404);

      const untouched = await a.admin.get(`/api/projects/${a.projectId}/estimate`);
      expect(untouched.body[0].status).toBe("ACCEPTED");
    });

    it("a foreign payment cannot be deleted", async () => {
      const res = await b.admin.del(`/api/finance/payments?id=${a.paymentId}`);
      expect(res.status).toBe(404);

      const invoice = await a.admin.get(`/api/invoices/${a.invoiceId}`);
      expect(cents(invoice.body.amountPaid)).toBe(cents(100));
    });

    it("a foreign crew member cannot be deleted", async () => {
      const foreignAdminId = a.admin.user?.id as string;
      const res = await b.admin.del(`/api/settings/users?id=${foreignAdminId}`);
      expect(res.status).toBe(404);

      const alive = await a.admin.get("/api/settings/users");
      expect((alive.body as Array<{ id: string }>).map((u) => u.id)).toContain(foreignAdminId);
    });

    it("the platform panel stays shut", async () => {
      const res = await b.admin.get("/api/admin/tenants");
      expect(res.status).toBe(401);
      const removed = await b.admin.del(`/api/admin/tenants?id=${a.admin.user?.tenantId}`);
      expect(removed.status).toBe(401);
    });

    it("signup opens a trial no matter what the body asks for", async () => {
      // Both fixtures registered with `plan: "paid"` in the body — see registerWorkspace.
      expect(a.workspace.plan).toBe("DEMO");
      expect(b.workspace.plan).toBe("DEMO");

      const upgrade = await b.admin.post("/api/tenant/upgrade", {
        plan: "PAID",
        businessName: "Renamed by owner",
      });
      expect([200, 403]).toContain(upgrade.status);
      if (upgrade.status === 200) expect(upgrade.body.plan).not.toBe("PAID");
    });

    it("the CSV export carries only the caller's own paper", async () => {
      const res = await b.admin.get(`/api/export/invoices?year=${YEAR}`);
      expect(res.status).toBe(200);
      const csv = String(res.body);
      expect(csv).not.toContain(`Client of ${a.workspace.slug}`);
      expect(csv).toContain(`Client of ${b.workspace.slug}`);
    });
  });

  describe("surfaces added in this wave", () => {
    it("the journal is admin-only, own-workspace and append-only", async () => {
      const guest = await anonymous(baseUrl).get("/api/audit", { tenant: a.workspace.slug });
      expect(guest.status).toBe(401);

      const crew = await a.worker.get("/api/audit");
      expect(crew.status).toBe(403);

      const mine = await a.admin.get("/api/audit?take=200");
      expect(mine.status).toBe(200);
      expect(mine.body.entries.length).toBeGreaterThan(0);
      for (const entry of mine.body.entries as Array<{ summary: string; tenantId: string }>) {
        expect(entry.summary).not.toContain(b.workspace.slug);
      }

      const theirs = await b.admin.get(`/api/audit?entityId=${a.invoiceId}`);
      expect(theirs.status).toBe(200);
      expect(theirs.body.entries).toHaveLength(0);

      const searched = await b.admin.get(`/api/audit?q=Client of ${a.workspace.slug}`);
      expect(searched.body.entries).toHaveLength(0);

      for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
        const res = await a.admin.request("/api/audit", { method, body: { summary: "forged" } });
        expect(res.status, method).toBe(405);
      }
    });

    it("intake keys are admin-only and each landing files into its own workspace", async () => {
      const guest = await anonymous(baseUrl).get("/api/settings/intake-keys", {
        tenant: a.workspace.slug,
      });
      expect(guest.status).toBe(401);

      const crewRead = await a.worker.get("/api/settings/intake-keys");
      expect(crewRead.status).toBe(403);
      const crewWrite = await a.worker.post("/api/settings/intake-keys", { label: "mine now" });
      expect(crewWrite.status).toBe(403);

      const list = await b.admin.get("/api/settings/intake-keys");
      expect((list.body as Array<{ id: string }>).map((k) => k.id)).not.toContain(a.intakeKeyId);

      const removed = await b.admin.del(`/api/settings/intake-keys?id=${a.intakeKeyId}`);
      expect(removed.status).toBe(404);

      // The key still works, which is what "not found" has to mean here.
      const filed = await anonymous(baseUrl).post(
        `/api/intake/${a.intakeKey}`,
        { name: "Landing Visitor", phone: "613-555-0301", service: "Kitchen renovation" },
        { tenant: null },
      );
      expect(filed.status).toBe(201);

      const inA = await a.admin.get("/api/leads");
      expect((inA.body as Array<{ name: string }>).some((l) => l.name === "Landing Visitor")).toBe(
        true,
      );
      const inB = await b.admin.get("/api/leads");
      expect((inB.body as Array<{ name: string }>).some((l) => l.name === "Landing Visitor")).toBe(
        false,
      );
    });

    it("an unknown or revoked intake key teaches a prober nothing", async () => {
      const guest = anonymous(baseUrl);
      const invented = await guest.post(
        "/api/intake/not-a-real-key-at-all",
        { name: "Nobody", phone: "613-555-0302" },
        { tenant: null },
      );
      expect(invented.status).toBe(404);
      expect(JSON.stringify(invented.body)).not.toMatch(/tenant|workspace|slug/i);

      const disposable = await b.admin.post("/api/settings/intake-keys", { label: "Throwaway" });
      await b.admin.del(`/api/settings/intake-keys?id=${disposable.body.id}`);
      const revoked = await guest.post(
        `/api/intake/${disposable.body.key}`,
        { name: "Nobody", phone: "613-555-0303" },
        { tenant: null },
      );
      expect(revoked.status).toBe(404);
    });

    it("job photos stay behind the tenant door", async () => {
      const bytes = await b.admin.get(`/api/photos/${a.photoId}`);
      expect(bytes.status).toBe(404);

      const removed = await b.admin.del(`/api/photos/${a.photoId}`);
      expect(removed.status).toBe(404);

      const listed = await b.admin.get(`/api/projects/${a.projectId}/photos`);
      expect(listed.status).toBe(404);

      const form = new FormData();
      form.set("file", new Blob([new Uint8Array(fakeJpeg())], { type: "image/jpeg" }), "x.jpg");
      const pushed = await b.admin.upload(`/api/projects/${a.projectId}/photos`, form);
      expect(pushed.status).toBe(404);

      const guest = await anonymous(baseUrl).get(`/api/photos/${a.photoId}`, {
        tenant: a.workspace.slug,
      });
      expect(guest.status).toBe(401);

      // Still readable by its owner: the checks above must not have destroyed anything.
      const owner = await a.admin.get(`/api/photos/${a.photoId}`);
      expect(owner.status).toBe(200);
      expect(owner.headers.get("content-type")).toBe("image/jpeg");
    });

    it("a crew member cannot delete a photo they did not take", async () => {
      const res = await a.worker.del(`/api/photos/${a.photoId}`);
      expect(res.status).toBe(403);

      const still = await a.admin.get(`/api/photos/${a.photoId}`);
      expect(still.status).toBe(200);
    });

    it("the health probe answers everyone and names nobody", async () => {
      const res = await anonymous(baseUrl).get("/api/health", { tenant: null });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("ok");
      const serialised = JSON.stringify(res.body);
      expect(serialised).not.toContain(a.workspace.slug);
      expect(serialised).not.toMatch(/file:|\/home\/|\.db/);
    });
  });

  /**
   * The team vertical adds two new objects to a workspace — an invite (and its token) and a
   * member who joined through an open link and is still awaiting approval. Both are the
   * owner's to see and act on, and both must be invisible and untouchable from the other
   * workspace on the same box. A → owns; B → reaches for them and is refused.
   */
  describe("the team vertical stays inside one workspace", () => {
    let aInviteId = "";
    let aInviteToken = "";
    let aPendingId = "";

    beforeAll(async () => {
      const invite = await a.admin.post("/api/invites", { role: "WORKER" });
      expect(invite.status).toBe(201);
      aInviteId = invite.body.id;
      aInviteToken = invite.body.token;

      const joined = await anonymous(baseUrl).post(
        `/api/join/${aInviteToken}`,
        { name: "Iso Pending", email: `pending.${Date.now().toString(36)}@iso.test`, password: "a-long-enough-password" },
        { tenant: null },
      );
      expect(joined.status).toBe(201);
      expect(joined.body.approved).toBe(false);

      const roster = await a.admin.get("/api/settings/users");
      aPendingId = (roster.body as Array<{ id: string; approved: boolean }>).find((u) => !u.approved)!.id;
    });

    it("A's invites are invisible and untouchable from B", async () => {
      const list = await b.admin.get("/api/invites");
      expect(list.status).toBe(200);
      expect((list.body as Array<{ id: string }>).map((i) => i.id)).not.toContain(aInviteId);

      const revoked = await b.admin.del(`/api/invites/${aInviteId}`);
      expect(revoked.status).toBe(404);

      // Still live — "not found from B" must mean B's reach was refused, not that the link
      // was quietly killed.
      expect((await anonymous(baseUrl).get(`/api/join/${aInviteToken}`, { tenant: null })).status).toBe(200);
    });

    it("A's pending member cannot be seen, approved or rejected from B", async () => {
      const roster = await b.admin.get("/api/settings/users");
      expect((roster.body as Array<{ id: string }>).map((u) => u.id)).not.toContain(aPendingId);

      const approved = await b.admin.request("/api/settings/users", { method: "PATCH", body: { id: aPendingId } });
      expect(approved.status).toBe(404);

      const rejected = await b.admin.del(`/api/settings/users?id=${aPendingId}`);
      expect(rejected.status).toBe(404);

      // B changed nothing: the member is still pending on A's side.
      const still = await a.admin.get("/api/settings/users");
      expect(
        (still.body as Array<{ id: string; approved: boolean }>).find((u) => u.id === aPendingId)?.approved,
      ).toBe(false);
    });
  });

  /**
   * An invite is a grant, and the grant is the owner's to write — never the joiner's to
   * widen. The role comes off the invite row and the approval comes off its shape (named =
   * vouched, open = waiting); the accept handler reads both from the server side and the
   * body cannot move either. So a joiner who posts `role: ADMIN` or `approved: true` gets
   * exactly what the link granted, and an open-link joiner — who lands at the door with a
   * real, signable account — has no way to let themselves in.
   */
  describe("an invite grants exactly what it says — no more", () => {
    const LONG = "a-long-enough-password";

    it("a WORKER invite cannot be talked into ADMIN by the joiner", async () => {
      const email = `escalate.${Date.now().toString(36)}@iso.test`;
      const invite = await a.admin.post("/api/invites", { email, role: "WORKER" });
      expect(invite.status).toBe(201);

      // The body asks for the owner's desk. Role and approval are the server's to decide
      // off the invite, so both are ignored: this joiner becomes a WORKER, approved only
      // because the owner named the address (a named invite), and never an ADMIN.
      const joined = await anonymous(baseUrl).post(
        `/api/join/${invite.body.token}`,
        { name: "Would-Be Admin", role: "ADMIN", approved: true, password: LONG },
        { tenant: null },
      );
      expect(joined.status).toBe(201);
      expect(joined.body.role).toBe("WORKER");

      const roster = await a.admin.get("/api/settings/users");
      const row = (roster.body as Array<{ email: string; role: string }>).find((u) => u.email === email);
      expect(row?.role).toBe("WORKER");
    });

    it("an open-link joiner cannot self-approve — not at the door, not from a session", async () => {
      const open = await a.admin.post("/api/invites", { role: "WORKER" });
      expect(open.status).toBe(201);
      expect(open.body.email).toBeNull();

      const email = `selfapprove.${Date.now().toString(36)}@iso.test`;
      // `approved: true` and `role: ADMIN` at the door change neither: an open link lands
      // approved=false and WORKER regardless of what the body asks for.
      const joined = await anonymous(baseUrl).post(
        `/api/join/${open.body.token}`,
        { name: "Self Approver", email, role: "ADMIN", approved: true, password: LONG },
        { tenant: null },
      );
      expect(joined.status).toBe(201);
      expect(joined.body.approved).toBe(false);
      expect(joined.body.role).toBe("WORKER");

      // Their real id, the way the owner sees it in the roster.
      const roster = await a.admin.get("/api/settings/users");
      const ownId = (roster.body as Array<{ id: string; email: string }>).find((u) => u.email === email)!.id;

      // The account is real and can sign in, but the desk is shut and so is every door that
      // would open it. Approving their own id is refused, and so is cutting themselves a
      // fresh, auto-approving named invite — both are the owner's alone.
      const joiner = await signIn(baseUrl, { slug: a.workspace.slug, email, password: LONG });
      const selfApprove = await joiner.request("/api/settings/users", { method: "PATCH", body: { id: ownId } });
      expect(selfApprove.status).toBe(403);
      const selfInvite = await joiner.post("/api/invites", { email, role: "ADMIN" });
      expect(selfInvite.status).toBe(403);

      // Nothing moved: the owner still sees them waiting, and the desk still refuses them.
      const after = await a.admin.get("/api/settings/users");
      expect(
        (after.body as Array<{ id: string; approved: boolean }>).find((u) => u.id === ownId)?.approved,
      ).toBe(false);
      expect((await joiner.get("/api/leads")).status).toBe(403);
    });
  });

  describe("roles inside one workspace", () => {
    it("the books, the paper and the export are the owner's alone", async () => {
      const closed = [
        "/api/finance/summary",
        "/api/invoices",
        `/api/invoices/${a.invoiceId}`,
        `/api/invoices/${a.invoiceId}/pdf`,
        `/api/export/invoices?year=${YEAR}`,
        `/api/export/payments?year=${YEAR}`,
        "/api/audit",
      ];
      for (const path of closed) {
        const res = await a.worker.get(path);
        expect(res.status, path).toBe(403);
      }
    });

    it("the customer roster carries contacts to the crew but the balance to the owner", async () => {
      // The list stays open — a tech needs an address and a repeat name in the field —
      // but the balance owed used to ride on every row. Money is the owner's alone; the
      // payload speaks dollars (inDollars), so the field is `owing`, not `owingCents`.
      const crew = await a.worker.get("/api/clients");
      expect(crew.status).toBe(200);
      for (const row of crew.body as Array<Record<string, unknown>>) {
        expect(row.owing, "worker sees no balance").toBe(0);
        expect(row.name).toBeTruthy(); // contacts still there
      }
      const owner = await a.admin.get("/api/clients");
      expect((owner.body as Array<Record<string, unknown>>).some((r) => typeof r.owing === "number")).toBe(true);
      // Hand-adding a client is the office's act.
      expect((await a.worker.post("/api/clients", { name: "Walk-in" })).status).toBe(403);
    });

    it("a tech's client dossier carries the address but none of the money", async () => {
      const dossier = await a.worker.get(`/api/clients/${a.clientId}`);
      expect(dossier.status).toBe(200);
      // The address and phone are why a tech opens it; the ledger is not. Dollars out,
      // so totals read `owing`/`collected`/`costs`/`lifetime`.
      expect(dossier.body.invoices).toEqual([]);
      expect(dossier.body.contracts).toEqual([]);
      for (const field of ["owing", "collected", "costs", "lifetime"]) {
        expect(dossier.body.totals?.[field], field).toBe(0);
      }
      const owner = await a.admin.get(`/api/clients/${a.clientId}`);
      expect(owner.body.invoices.length).toBeGreaterThanOrEqual(0);
    });

    it("a crew member can move his own task but not another's", async () => {
      // Mine: the assignee is the worker himself, so the edit lands.
      const mine = await a.admin.post("/api/tasks", {
        title: "worker's own",
        assignedToId: a.worker.user?.id,
        projectId: a.projectId,
      });
      expect(mine.status).toBe(201);
      const ownEdit = await a.worker.put(`/api/tasks/${mine.body.id}`, { status: "DONE" });
      expect(ownEdit.status).toBe(200);

      // Someone else's: assigned to the admin. A worker who reads its id off the shared
      // job card must not retitle, reassign, complete or delete it.
      const theirs = await a.admin.post("/api/tasks", {
        title: "not the worker's",
        assignedToId: a.admin.user?.id,
        projectId: a.projectId,
      });
      expect(theirs.status).toBe(201);
      expect((await a.worker.put(`/api/tasks/${theirs.body.id}`, { title: "HIJACK", status: "DONE" })).status).toBe(404);
      expect((await a.worker.del(`/api/tasks/${theirs.body.id}`)).status).toBe(404);
      // The admin's task is untouched.
      const check = await a.admin.get("/api/tasks");
      const row = (check.body as Array<Record<string, unknown>>).find((t) => t.id === theirs.body.id);
      expect(row?.title).toBe("not the worker's");
    });

    it("the crew's job card carries the work and none of the money", async () => {
      // The rail hides /finance and /invoices, and the job card handed the same numbers
      // over anyway: a tech opening his own work order read the quoted price, every
      // invoice on it and the margin the owner is making.
      const res = await a.worker.get(`/api/projects/${a.projectId}`);
      expect(res.status).toBe(200);
      expect(res.body.viewerRole).toBe("WORKER");
      expect(res.body.title).toContain(a.workspace.slug);
      for (const field of ["estimates", "invoices", "expenses"]) {
        expect(res.body[field], field).toEqual([]);
      }
      /**
       * Payments on THIS job are the exception, and they earned it: the crew collects at
       * the door, and a card that showed him nothing back read as a lost payment and had
       * him asking for the same money twice. Four facts per line — when, how much, by
       * what, his note — and no thread back into the book.
       */
      for (const p of res.body.payments as Array<Record<string, unknown>>) {
        expect(Object.keys(p).sort()).toEqual(["amount", "date", "id", "method", "notes"]);
      }
      // Name the money fields instead of scanning the serialised body for the digits of
      // a price: cuids are random, and one of them containing "5000" failed this run
      // while nothing had leaked.
      for (const field of ["quotedPrice", "margin", "amountPaid", "collected", "costs"]) {
        expect(res.body[field], field).toBeUndefined();
      }

      const owner = await a.admin.get(`/api/projects/${a.projectId}`);
      expect(owner.body.viewerRole).toBe("ADMIN");
      expect(owner.body.estimates.length).toBeGreaterThan(0);
      expect(owner.body.invoices.length).toBeGreaterThan(0);
    });

    it("pricing a job is the owner's desk", async () => {
      for (const path of [
        `/api/projects/${a.projectId}/estimate`,
        `/api/projects/${a.projectId}/estimate/pdf?estimateId=${a.estimateId}`,
      ]) {
        expect((await a.worker.get(path)).status, path).toBe(403);
      }
      const written = await a.worker.post(`/api/projects/${a.projectId}/estimate`, {
        lineItems: [{ description: "Undercut", qty: 1, unit: "lot", unitPrice: 1 }],
        taxRate: 0.13,
      });
      expect(written.status).toBe(403);
    });

    it("a crew member cannot take himself off a work order", async () => {
      // The job card posts the whole project back on every save, so «Start job» from
      // the field was also posting assignedToId — and one tap on the empty option took
      // the tech off his own job and out of the day plan.
      const before = await a.admin.get(`/api/projects/${a.projectId}`);
      const owner = before.body.assignedToId ?? null;

      const res = await a.worker.put(`/api/projects/${a.projectId}`, {
        status: "IN_PROGRESS",
        assignedToId: null,
      });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("IN_PROGRESS");

      const after = await a.admin.get(`/api/projects/${a.projectId}`);
      expect(after.body.assignedToId ?? null).toBe(owner);
    });

    it("anyone signed in may change their own password and no one else's", async () => {
      const wrong = await a.worker.put("/api/account/password", {
        currentPassword: "not-the-one",
        newPassword: "a-perfectly-long-passphrase",
      });
      expect(wrong.status).toBe(403);

      const short = await a.worker.put("/api/account/password", {
        currentPassword: a.workspace.worker.password,
        newPassword: "short",
      });
      expect(short.status).toBe(400);
    });

    it("field work stays open to the crew", async () => {
      for (const path of ["/api/today", "/api/tasks", "/api/projects", "/api/clients"]) {
        const res = await a.worker.get(path);
        expect(res.status, path).toBe(200);
      }
    });

    it("the crew takes money at the door but cannot erase it", async () => {
      const taken = await a.worker.post("/api/finance/payments", {
        projectId: a.projectId,
        amount: 40,
        method: "CASH",
        notes: "collected on site",
      });
      expect(taken.status).toBe(201);

      const erased = await a.worker.del(`/api/finance/payments?id=${taken.body.id}`);
      expect(erased.status).toBe(403);

      const byOwner = await a.admin.del(`/api/finance/payments?id=${taken.body.id}`);
      expect(byOwner.status).toBe(200);
    });

    it("owner-only screens bounce the crew back to the board", async () => {
      for (const page of ["/finance", "/invoices", "/settings/log", "/settings/intake"]) {
        const res = await a.worker.get(page);
        expect(res.status, page).toBe(307);
        expect(res.headers.get("location"), page).toContain("/today");
      }
    });
  });

  /**
   * Writes that used to cross the tenant line through a foreign key taken from the
   * request body — the id in the path was checked, the id in the body was not. Every
   * route below now resolves those ids through src/lib/scope.ts.
   */
  describe("cross-tenant writes through unchecked body ids", () => {
    /**
     * Was E2E-I1 — a stranger could book a payment against your job.
     * POST /api/finance/payments takes body.projectId as given. The row is stamped with
     * the attacker's tenant, yet the victim's job card reads payments through the
     * project relation, so their collected total, their margin and their job history
     * all move on money that never arrived.
     */
    it("a payment cannot be booked against a foreign job", async () => {
      const res = await b.admin.post("/api/finance/payments", {
        projectId: a.projectId,
        amount: 9999,
        method: "CASH",
        notes: "planted",
      });
      expect([400, 403, 404]).toContain(res.status);

      const victim = await a.admin.get(`/api/projects/${a.projectId}`);
      const planted = (victim.body.payments as Array<{ amount: number }>).some(
        (p) => cents(p.amount) === cents(9999),
      );
      expect(planted).toBe(false);
    });

    /**
     * Was E2E-I2 — the same door for costs. An expense planted on a foreign job drags
     * that job's margin under water on the owner's own screen.
     */
    it("an expense cannot be booked against a foreign job", async () => {
      const res = await b.admin.post("/api/finance/expenses", {
        projectId: a.projectId,
        amount: 777,
        category: "MATERIALS",
        description: "planted",
      });
      expect([400, 403, 404]).toContain(res.status);

      const victim = await a.admin.get(`/api/projects/${a.projectId}`);
      const planted = (victim.body.expenses as Array<{ amount: number }>).some(
        (e) => cents(e.amount) === cents(777),
      );
      expect(planted).toBe(false);
    });

    /**
     * Was E2E-I3 — a task planted on a foreign job, and a title read back out.
     * POST /api/tasks accepts body.projectId unchecked. The task appears on the
     * victim's job card, and the attacker's own task list includes `project.title`,
     * which is how the victim's job name leaks back to the attacker.
     */
    it("a task cannot be attached to a foreign job", async () => {
      const res = await b.admin.post("/api/tasks", {
        title: "planted task",
        projectId: a.projectId,
      });
      expect([400, 403, 404]).toContain(res.status);

      const victim = await a.admin.get(`/api/projects/${a.projectId}`);
      const planted = (victim.body.tasks as Array<{ title: string }>).some(
        (t) => t.title === "planted task",
      );
      expect(planted).toBe(false);

      const attackerBoard = await b.admin.get("/api/tasks");
      const leaked = (attackerBoard.body as Array<{ project?: { title?: string } }>).some((t) =>
        t.project?.title?.includes(a.workspace.slug),
      );
      expect(leaked).toBe(false);
    });

    /**
     * Was E2E-I4 — work assigned to a stranger's employee.
     * `assignedToId` is taken from the body without checking the user belongs to the
     * caller's workspace (only PUT /api/tasks/[id] checks it). The lead list then
     * renders `assignedTo.name`, handing over the other contractor's staff names.
     */
    it("a lead cannot be assigned to a foreign user", async () => {
      const foreignUserId = a.admin.user?.id as string;
      const res = await b.admin.post("/api/leads", {
        name: "Assignment probe",
        phone: "613-555-0304",
        assignedToId: foreignUserId,
      });
      expect([400, 403, 404]).toContain(res.status);

      const list = await b.admin.get("/api/leads");
      const leaked = (list.body as Array<{ assignedTo?: { id: string } }>).some(
        (l) => l.assignedTo?.id === foreignUserId,
      );
      expect(leaked).toBe(false);
    });

    /**
     * `clientId` was the last id in a request body still taken as fact — the sweep that
     * closed `projectId` and `assignedToId` did not reach it. A whole job could be hung
     * off a stranger's customer: it showed up in the victim's dossier with its money
     * folded into that customer's lifetime value, and the victim could not delete it,
     * because deletion is scoped and the row carried the attacker's workspace.
     */
    it("a job cannot be hung off a foreign client", async () => {
      const res = await b.admin.post("/api/projects", {
        clientId: a.clientId,
        clientName: "Client probe",
        address: "1 Bank St, Ottawa",
        title: "planted job",
      });
      expect([400, 403, 404]).toContain(res.status);

      const victim = await a.admin.get(`/api/clients/${a.clientId}`);
      const planted = (victim.body.projects as Array<{ title: string }>).some(
        (p) => p.title === "planted job",
      );
      expect(planted).toBe(false);
    });

    /**
     * A maintenance plan pointed at a stranger's furnace read its make, model and serial
     * straight back out through the contract list — the client on the plan was checked
     * and the equipment on it was not.
     */
    it("a contract cannot point at a foreign unit", async () => {
      const mine = await b.admin.post("/api/clients", { name: "Contract probe client" });
      expect(mine.status).toBe(201);

      const theirIron = await a.admin.post(`/api/clients/${a.clientId}/equipment`, {
        kind: "FURNACE",
        brand: "Carrier",
        model: "59TP6A",
        serial: "ZZ-SERIAL-PROBE",
      });
      expect(theirIron.status).toBe(201);

      const res = await b.admin.post("/api/contracts", {
        clientId: mine.body.id,
        equipmentId: theirIron.body.id,
        name: "Probe plan",
        visitMonths: [4, 10],
        pricePerVisit: 199,
      });
      expect([400, 403, 404]).toContain(res.status);

      const list = await b.admin.get("/api/contracts");
      expect(JSON.stringify(list.body)).not.toContain("ZZ-SERIAL-PROBE");
    });
  });

  describe("the money the crew is not shown", () => {
    /**
     * The job card was taught to strip prices and collections for a WORKER; the LIST it
     * is opened from kept serving them, so one request handed a hired tech every quoted
     * price and every payment in the shop.
     */
    it("keeps prices and collections off the crew's job list", async () => {
      const list = await a.worker.get("/api/projects");
      expect(list.status).toBe(200);
      for (const job of list.body as Array<{ estimates?: unknown[]; payments?: unknown[] }>) {
        expect(job.estimates ?? []).toEqual([]);
        expect(job.payments ?? []).toEqual([]);
      }
    });

    /** A plan price is the money book, on the same line as the estimates and the P&L. */
    it("keeps the maintenance book off the crew's screen", async () => {
      expect((await a.worker.get("/api/contracts")).status).toBe(403);
      expect(
        (await a.worker.post("/api/contracts", { clientId: a.clientId, visitMonths: [4] })).status,
      ).toBe(403);
      expect((await a.worker.post("/api/contracts/book", { withinDays: 45 })).status).toBe(403);
    });

    /**
     * One figure survives the filter, because the tech collects at the door and used to
     * have to phone the office for the amount every single time.
     */
    it("still tells the crew what this job owes", async () => {
      const card = await a.worker.get(`/api/projects/${a.projectId}`);
      expect(card.status).toBe(200);
      expect(typeof card.body.dueAtDoor).toBe("number");
      // Dollars, once — a hundredfold error here is the most expensive bug in the shop.
      expect(card.body.dueAtDoor).toBeLessThan(1_000_000);
    });

    /**
     * Money taken at the door is filed against the JOB and carries no invoice, so a
     * balance computed from invoices alone never moved: the tech collected $40, opened
     * the same card and read the same $100 owing, with «nothing recorded on this job»
     * underneath it. He asks for the money a second time and the client is right to be
     * angry. The balance now counts what he already took, and he is shown his own line.
     */
    it("counts the money the crew already took at the door", async () => {
      const job = await a.admin.post("/api/projects", {
        clientName: "Door Payment Probe",
        address: "9 Sussex Dr, Ottawa",
        title: "Furnace service",
      });
      expect(job.status).toBe(201);

      const invoice = await a.admin.post("/api/invoices", {
        projectId: job.body.id,
        taxRate: 0,
        lineItems: [{ description: "Service call", qty: 1, unit: "ea", unitPrice: 100 }],
      });
      expect(invoice.status).toBe(201);
      expect(
        (await a.admin.put(`/api/invoices/${invoice.body.id}`, { status: "SENT" })).status,
      ).toBe(200);

      const before = await a.worker.get(`/api/projects/${job.body.id}`);
      expect(before.body.dueAtDoor).toBe(100);
      expect(before.body.payments).toEqual([]);

      const paid = await a.worker.post("/api/finance/payments", {
        projectId: job.body.id,
        amount: 40,
        method: "E_TRANSFER",
      });
      expect(paid.status).toBe(201);

      const after = await a.worker.get(`/api/projects/${job.body.id}`);
      expect(after.body.dueAtDoor).toBe(60);
      expect(after.body.payments).toHaveLength(1);
      expect(after.body.payments[0].amount).toBe(40);
      // His own line, and not a step further into the book.
      expect(after.body.estimates).toEqual([]);
      expect(after.body.invoices).toEqual([]);
      expect(after.body.expenses).toEqual([]);
    });

    /** Overpaying at the door owes nothing back through this figure. */
    it("never lets the door balance run below zero", async () => {
      const job = await a.admin.post("/api/projects", {
        clientName: "Overpay Probe",
        address: "11 Rideau St, Ottawa",
        title: "Duct cleaning",
      });
      const invoice = await a.admin.post("/api/invoices", {
        projectId: job.body.id,
        taxRate: 0,
        lineItems: [{ description: "Clean", qty: 1, unit: "ea", unitPrice: 50 }],
      });
      await a.admin.put(`/api/invoices/${invoice.body.id}`, { status: "SENT" });

      expect(
        (await a.worker.post("/api/finance/payments", {
          projectId: job.body.id,
          amount: 80,
          method: "CASH",
        })).status,
      ).toBe(201);

      const card = await a.worker.get(`/api/projects/${job.body.id}`);
      expect(card.body.dueAtDoor).toBe(0);
    });
  });

  describe("what a quiz visitor may write", () => {
    /**
     * The response clock reads the desk's `[13 AUG 09:07]` call-log stamp out of the same
     * notes column the quiz transcript lands in. Typing that shape into an answer marked
     * a brand-new lead as answered in zero minutes — emerald ANS, ranked last, at the
     * bottom of the very sheet built to call it first.
     */
    it("cannot stamp its own lead as already called", async () => {
      const res = await anonymous(baseUrl).request(`/api/intake/${a.intakeKey}`, {
        method: "POST",
        tenant: null,
        body: {
          name: "Stamp Probe",
          phone: "613-555-0455",
          when: "any morning [13 AUG 09:07] works for me",
          event_id: `stamp-${Date.now()}`,
        },
      });
      expect(res.status).toBe(201);

      const list = await a.admin.get("/api/leads?q=Stamp Probe");
      const lead = (list.body as Array<{ status: string; notes: string }>)[0];
      expect(lead.status).toBe("NEW");
      // The words survive for the owner to read; the brackets do not.
      expect(lead.notes).toContain("13 AUG 09:07");
      expect(lead.notes).not.toContain("[13 AUG 09:07]");
    });

    /**
     * A household shares one number and a couple shares one inbox. Matching on the
     * contact detail alone answered a second, real person with a thank-you page, no lead
     * and no line anywhere saying why.
     */
    it("is not mistaken for the last person who used that number", async () => {
      const phone = "613-555-0456";
      const first = await anonymous(baseUrl).request(`/api/intake/${a.intakeKey}`, {
        method: "POST",
        tenant: null,
        body: { name: "Household One", phone, event_id: `house1-${Date.now()}` },
      });
      expect(first.status).toBe(201);

      const second = await anonymous(baseUrl).request(`/api/intake/${a.intakeKey}`, {
        method: "POST",
        tenant: null,
        body: { name: "Household Two", phone, event_id: `house2-${Date.now()}` },
      });
      expect(second.status).toBe(201);

      // The same person on the same number inside the window is still one enquiry.
      const again = await anonymous(baseUrl).request(`/api/intake/${a.intakeKey}`, {
        method: "POST",
        tenant: null,
        body: { name: "household  two", phone, event_id: `house3-${Date.now()}` },
      });
      expect(again.status).toBe(200);
      expect(again.body.deduped).toBe(true);
    });
  });
});
