import { beforeAll, describe, expect, inject, it } from "vitest";
import { Client, anonymous, registerWorkspace, signIn, type Workspace } from "./harness/client";

/**
 * THE TEAM VERTICAL, end to end.
 *
 * An owner grows a crew two ways, and this file drives both against the real server the way
 * a person does: a NAMED invite whose holder joins ready to work, and an OPEN link whose
 * holder joins and waits at the door. The one thing worth proving beyond «it creates a
 * row» is the gate — an open-link joiner has a real, signable account and STILL cannot open
 * the desk until the owner approves them, and the approval takes hold on their next request
 * rather than their next sign-in.
 *
 * A fresh workspace is registered for the file so its crew counts are its own.
 */

const LONG_PASSWORD = "a-perfectly-long-passphrase";

async function usersOf(admin: Client) {
  const res = await admin.get("/api/settings/users");
  return res.body as Array<{ id: string; name: string; email: string; role: string; approved: boolean }>;
}

describe.sequential("the team vertical", () => {
  let baseUrl = "";
  let ws: Workspace;
  let admin: Client;
  let worker: Client;

  beforeAll(async () => {
    baseUrl = inject("baseUrl");
    ws = await registerWorkspace(baseUrl, "Team");
    admin = await signIn(baseUrl, ws.admin);
    worker = await signIn(baseUrl, ws.worker);
  }, 120_000);

  describe("only the owner runs invites", () => {
    it("a worker is refused every invite and approval door", async () => {
      expect((await worker.get("/api/invites")).status).toBe(403);
      expect((await worker.post("/api/invites", { role: "WORKER" })).status).toBe(403);
      expect(
        (await worker.request("/api/settings/users", { method: "PATCH", body: { id: worker.user?.id } })).status
      ).toBe(403);

      // Even a real, existing invite id is untouchable to a worker.
      const made = await admin.post("/api/invites", { role: "WORKER" });
      expect(made.status).toBe(201);
      expect((await worker.del(`/api/invites/${made.body.id}`)).status).toBe(403);
      // Clean up so it does not clutter later list assertions.
      await admin.del(`/api/invites/${made.body.id}`);
    });

    it("an anonymous caller gets the door, not the invite list", async () => {
      const guest = anonymous(baseUrl);
      expect((await guest.get("/api/invites", { tenant: ws.slug })).status).toBe(401);
      expect((await guest.post("/api/invites", { role: "WORKER" }, { tenant: ws.slug })).status).toBe(401);
    });
  });

  describe("a named invite lands straight on the crew", () => {
    it("creates a link, joins through it, and works at once", async () => {
      const email = "nina.named@team.test";
      const created = await admin.post("/api/invites", { email, role: "WORKER" });
      expect(created.status).toBe(201);
      expect(created.body.token).toBeTruthy();
      expect(created.body.url).toContain(`/join/${created.body.token}`);
      const token = created.body.token as string;

      // The public join page reads the invite: a named one locks the address.
      const info = await anonymous(baseUrl).get(`/api/join/${token}`, { tenant: null });
      expect(info.status).toBe(200);
      expect(info.body.businessName).toBe(ws.businessName);
      expect(info.body.role).toBe("WORKER");
      expect(info.body.emailLocked).toBe(true);
      expect(info.body.email).toBe(email);

      // Accept it with a name and a password.
      const joined = await anonymous(baseUrl).post(
        `/api/join/${token}`,
        { name: "Nina Named", password: LONG_PASSWORD },
        { tenant: null }
      );
      expect(joined.status).toBe(201);
      expect(joined.body.approved).toBe(true);
      expect(joined.body.slug).toBe(ws.slug);
      expect(joined.body.email).toBe(email);

      // Named = approved, so the new login opens the desk immediately.
      const nina = await signIn(baseUrl, { slug: ws.slug, email, password: LONG_PASSWORD });
      expect((await nina.get("/api/leads")).status).toBe(200);

      // She is on the crew, approved, and there is exactly one account on that email — which
      // is the precondition the existing Google auto-link leans on.
      const roster = await usersOf(admin);
      const mine = roster.filter((u) => u.email === email);
      expect(mine).toHaveLength(1);
      expect(mine[0].approved).toBe(true);
      expect(mine[0].role).toBe("WORKER");
    });

    it("locks the address to the invite — a posted email is ignored", async () => {
      const email = "locked@team.test";
      const created = await admin.post("/api/invites", { email, role: "WORKER" });
      const joined = await anonymous(baseUrl).post(
        `/api/join/${created.body.token}`,
        { name: "Locked Larry", email: "attacker@evil.test", password: LONG_PASSWORD },
        { tenant: null }
      );
      expect(joined.status).toBe(201);
      expect(joined.body.email).toBe(email);

      const roster = await usersOf(admin);
      expect(roster.some((u) => u.email === "attacker@evil.test")).toBe(false);
      expect(roster.some((u) => u.email === email)).toBe(true);
    });

    it("refuses a named invite for an address that already has a login", async () => {
      const dup = await admin.post("/api/invites", { email: ws.admin.email, role: "WORKER" });
      expect(dup.status).toBe(409);
    });
  });

  describe("an open link waits for the owner", () => {
    it("joins unapproved, is parked, and the desk opens on the next request after approval", async () => {
      const created = await admin.post("/api/invites", { role: "WORKER" });
      expect(created.status).toBe(201);
      expect(created.body.email).toBeNull();
      const token = created.body.token as string;

      const info = await anonymous(baseUrl).get(`/api/join/${token}`, { tenant: null });
      expect(info.body.emailLocked).toBe(false);
      expect(info.body.email).toBeUndefined();

      const email = "oscar.open@team.test";
      const joined = await anonymous(baseUrl).post(
        `/api/join/${token}`,
        { name: "Oscar Open", email, password: LONG_PASSWORD },
        { tenant: null }
      );
      expect(joined.status).toBe(201);
      expect(joined.body.approved).toBe(false);

      // He shows up in the roster as not-yet-approved.
      let roster = await usersOf(admin);
      const pending = roster.find((u) => u.email === email);
      expect(pending?.approved).toBe(false);
      const oscarId = pending!.id;

      // He can sign in — the account is real — but the desk is shut. An API call is 403 and
      // a page is parked on /awaiting, not bounced to /login as if the password were wrong.
      const oscar = await signIn(baseUrl, { slug: ws.slug, email, password: LONG_PASSWORD });
      expect((await oscar.get("/api/leads")).status).toBe(403);
      const page = await oscar.get("/today");
      expect(page.status).toBe(307);
      expect(page.headers.get("location")).toContain("/awaiting");

      // The owner lets him in.
      const approved = await admin.request("/api/settings/users", { method: "PATCH", body: { id: oscarId } });
      expect(approved.status).toBe(200);
      expect(approved.body.approved).toBe(true);

      // His NEXT request picks it up — no fresh sign-in. Refreshing the session re-reads the
      // flag; the session now carries a real identity, and the desk answers.
      const refreshed = await oscar.get("/api/auth/session", { tenant: null });
      expect(refreshed.body?.user?.id).toBeTruthy();
      expect(refreshed.body?.user?.unapproved).toBeFalsy();
      expect((await oscar.get("/api/leads")).status).toBe(200);

      roster = await usersOf(admin);
      expect(roster.find((u) => u.email === email)?.approved).toBe(true);
    });

    it("stops an open link once it hits its cap", async () => {
      const created = await admin.post("/api/invites", { role: "WORKER", maxUses: 1 });
      const token = created.body.token as string;

      const first = await anonymous(baseUrl).post(
        `/api/join/${token}`,
        { name: "Cap One", email: "cap.one@team.test", password: LONG_PASSWORD },
        { tenant: null }
      );
      expect(first.status).toBe(201);

      const second = await anonymous(baseUrl).post(
        `/api/join/${token}`,
        { name: "Cap Two", email: "cap.two@team.test", password: LONG_PASSWORD },
        { tenant: null }
      );
      expect(second.status).toBe(410);

      // And the page itself now reports the link as spent.
      expect((await anonymous(baseUrl).get(`/api/join/${token}`, { tenant: null })).status).toBe(410);
      const roster = await usersOf(admin);
      expect(roster.some((u) => u.email === "cap.two@team.test")).toBe(false);
    });

    it("revoking a link closes it for good", async () => {
      const created = await admin.post("/api/invites", { role: "WORKER" });
      const id = created.body.id as string;
      const token = created.body.token as string;

      expect((await admin.del(`/api/invites/${id}`)).status).toBe(200);
      // Idempotent: a second revoke is not an error.
      expect((await admin.del(`/api/invites/${id}`)).status).toBe(200);

      expect((await anonymous(baseUrl).get(`/api/join/${token}`, { tenant: null })).status).toBe(410);
      const attempt = await anonymous(baseUrl).post(
        `/api/join/${token}`,
        { name: "Too Late", email: "too.late@team.test", password: LONG_PASSWORD },
        { tenant: null }
      );
      expect(attempt.status).toBe(410);

      // A revoked link drops out of the owner's live list.
      const list = await admin.get("/api/invites");
      expect((list.body as Array<{ id: string }>).map((i) => i.id)).not.toContain(id);
    });
  });

  describe("a made-up token teaches a prober nothing", () => {
    it("answers 404 without naming a workspace", async () => {
      const res = await anonymous(baseUrl).get("/api/join/not-a-real-token-at-all", { tenant: null });
      expect(res.status).toBe(404);
      expect(JSON.stringify(res.body)).not.toMatch(/slug|tenant|business/i);
    });
  });
});
