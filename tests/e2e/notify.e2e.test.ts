import { beforeAll, describe, expect, inject, it } from "vitest";
import { Client, anonymous, eventually, signedIn } from "./harness/client";

/**
 * Scenario C — the desk hears about a lead.
 *
 * Driven over HTTP for the same reason as the rest of the suite: the promise being
 * tested is «the lead is saved and somebody is told», and both halves live behind the
 * guard, the middleware and the intake route.
 *
 * SMTP is not configured on this server and the bot token below belongs to nobody, so
 * every alert here fails to deliver. That is the case worth pinning: a failed alert must
 * leave the lead intact and must be written down as failed. Silence about a broken bot
 * is worse than the broken bot.
 */

/** Well-formed enough for the settings screen, owned by no one. */
const DEAD_TOKEN = "8123456789:AAFdead-token-that-belongs-to-nobody-at-all";

const pad = (n: number) => String(n).padStart(2, "0");

describe.sequential("Scenario C — new-lead alerts", () => {
  let baseUrl = "";
  let admin: Client;
  let worker: Client;
  let slug = "";
  let intakeKey = "";

  beforeAll(async () => {
    baseUrl = inject("baseUrl");
    const workspace = inject("alpha");
    slug = workspace.slug;
    admin = await signedIn(baseUrl, workspace.admin);
    worker = await signedIn(baseUrl, workspace.worker);

    const key = await admin.post("/api/settings/intake-keys", {
      label: "Alert landing",
      source: "FACEBOOK",
    });
    expect(key.status, "fixture intake key").toBe(201);
    intakeKey = key.body.key;
  }, 120_000);

  it("is the owner's shelf — the row holds a credential", async () => {
    const guest = await anonymous(baseUrl).get("/api/settings/notifications", { tenant: slug });
    expect(guest.status).toBe(401);

    const crewRead = await worker.get("/api/settings/notifications");
    expect(crewRead.status).toBe(403);

    const crewWrite = await worker.put("/api/settings/notifications", { isActive: true });
    expect(crewWrite.status).toBe(403);
  });

  it("takes a bot token and never hands it back", async () => {
    const saved = await admin.put("/api/settings/notifications", {
      isActive: true,
      telegramToken: DEAD_TOKEN,
      telegramChatId: "123456789",
      quietFrom: "",
      quietTo: "",
      timezone: "UTC",
    });
    expect(saved.status).toBe(200);
    expect(JSON.stringify(saved.body)).not.toContain(DEAD_TOKEN);
    expect(saved.body.telegramTokenHint).toMatch(/^••••/);

    const read = await admin.get("/api/settings/notifications");
    expect(JSON.stringify(read.body)).not.toContain(DEAD_TOKEN);
    expect(read.body.telegramChatId).toBe("123456789");

    // The shared integrations route used to serve whole rows, tokens included, to any
    // signed-in member; the alert row was spelled «Notify» to stay out of its reach.
    // That route is admin-only now and answers with a hint rather than a secret, so
    // both doors are checked: the crew is refused, and the owner reads no token either.
    const sideDoor = await worker.get("/api/settings/integrations/notify");
    expect(sideDoor.status).toBe(403);
    expect(JSON.stringify(sideDoor.body)).not.toContain(DEAD_TOKEN);

    const ownerSideDoor = await admin.get("/api/settings/integrations/notify");
    expect(JSON.stringify(ownerSideDoor.body)).not.toContain(DEAD_TOKEN);
    expect(ownerSideDoor.body.accessToken ?? null).toBeNull();
  });

  it("rejects a half-pasted token instead of storing a channel that cannot work", async () => {
    const bad = await admin.put("/api/settings/notifications", { telegramToken: "8123456789" });
    expect(bad.status).toBe(400);

    const lonely = await admin.put("/api/settings/notifications", { quietFrom: "21:00", quietTo: "" });
    expect(lonely.status).toBe(400);
  });

  it("saves the lead and writes down that the alert did not go out", async () => {
    const lead = await anonymous(baseUrl).request(`/api/intake/${intakeKey}`, {
      method: "POST",
      tenant: null,
      body: {
        name: "Alerted Caller",
        phone: "613-555-0311",
        service: "Kitchen renovation",
        event_id: `alert-${Date.now()}`,
      },
    });
    // The lead is the product. A dead bot token cannot cost the landing page its 201.
    expect(lead.status).toBe(201);

    const leads = await admin.get("/api/leads?q=Alerted Caller");
    expect(leads.body.length).toBe(1);

    // Delivery is deliberately not awaited by the intake route, so the line lands a
    // moment after the 201. Polling for it is the assertion; reading once would be a
    // race the product is designed to win.
    const line = await eventually(async () => {
      const log = await admin.get("/api/audit?entity=Lead&take=200");
      return log.body.entries.find(
        (e: { action: string; summary: string }) =>
          e.action === "lead.notify" && e.summary.includes("Alerted Caller")
      );
    }, "the journal to carry the attempt");
    expect(line, "the journal has to carry the attempt").toBeTruthy();
    expect(line.summary).toContain("NOT delivered");
    expect(line.actorName).toBe("System");
  });

  it("holds an alert that lands inside quiet hours and says when it goes out", async () => {
    const now = new Date();
    const window = {
      quietFrom: `${pad((now.getUTCHours() + 23) % 24)}:${pad(now.getUTCMinutes())}`,
      quietTo: `${pad((now.getUTCHours() + 1) % 24)}:${pad(now.getUTCMinutes())}`,
      timezone: "UTC",
    };
    const saved = await admin.put("/api/settings/notifications", window);
    expect(saved.status).toBe(200);

    const lead = await anonymous(baseUrl).request(`/api/intake/${intakeKey}`, {
      method: "POST",
      tenant: null,
      body: {
        name: "Midnight Caller",
        phone: "613-555-0312",
        event_id: `quiet-${Date.now()}`,
      },
    });
    expect(lead.status).toBe(201);

    const line = await eventually(async () => {
      const log = await admin.get("/api/audit?entity=Lead&take=200");
      return log.body.entries.find(
        (e: { action: string; summary: string }) =>
          e.action === "lead.notify" && e.summary.includes("Midnight Caller")
      );
    }, "a held alert to be recorded");
    expect(line, "a held alert is still an event worth recording").toBeTruthy();
    expect(line.summary).toContain("held for quiet hours");
    expect(line.summary).toContain(window.quietTo);
  });

  it("says nothing about a lead the desk typed in itself", async () => {
    const typed = await admin.post("/api/leads", {
      name: "Typed By Dispatcher",
      phone: "613-555-0313",
      source: "MANUAL",
    });
    expect(typed.status).toBe(201);

    // A negative needs a settling moment of its own, or it passes because nothing has
    // had time to happen yet. The two alerts above have already flushed by now.
    await new Promise((r) => setTimeout(r, 1_000));
    const log = await admin.get("/api/audit?entity=Lead&take=200");
    const line = log.body.entries.find((e: { summary: string }) =>
      e.summary.includes("Typed By Dispatcher")
    );
    expect(line, "the owner is looking at the screen he just typed into").toBeFalsy();
  });
});
