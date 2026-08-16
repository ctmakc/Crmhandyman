import { describe, it, expect, afterEach, vi } from "vitest";
import {
  inviteDeadReason,
  inviteUsable,
  joinUrl,
  newInviteToken,
  workspaceBaseUrl,
} from "@/lib/invite";

/**
 * The invite, minus the database. Three things this file guards, all of them the kind of
 * bug that only shows up in production: a token that is guessable, a link that is built
 * against the wrong host, and a validity rule that lets a dead link through (or kills a
 * live one).
 */

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("newInviteToken", () => {
  it("is url-safe — no +, /, = or anything a path would have to escape", () => {
    for (let i = 0; i < 200; i++) {
      expect(newInviteToken()).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });

  it("carries real entropy: 32 chars from 24 bytes, and no two alike", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      const t = newInviteToken();
      expect(t.length).toBeGreaterThanOrEqual(32);
      expect(seen.has(t)).toBe(false);
      seen.add(t);
    }
  });
});

describe("workspaceBaseUrl / joinUrl", () => {
  it("builds https://<slug>.<root> from the shared cookie domain", () => {
    vi.stubEnv("NEXTAUTH_COOKIE_DOMAIN", ".agintent.com");
    expect(workspaceBaseUrl("korvex")).toBe("https://korvex.agintent.com");
    expect(joinUrl("korvex", "TOKEN123")).toBe("https://korvex.agintent.com/join/TOKEN123");
  });

  it("tolerates a cookie domain written without the leading dot", () => {
    vi.stubEnv("NEXTAUTH_COOKIE_DOMAIN", "agintent.com");
    expect(workspaceBaseUrl("acme")).toBe("https://acme.agintent.com");
  });

  it("falls back to NEXTAUTH_URL when there is no shared root (dev, single host)", () => {
    vi.stubEnv("NEXTAUTH_COOKIE_DOMAIN", "");
    vi.stubEnv("NEXTAUTH_URL", "http://localhost:3023/");
    // The trailing slash is trimmed so the path is not doubled.
    expect(joinUrl("demo", "abc")).toBe("http://localhost:3023/join/abc");
  });
});

describe("inviteUsable", () => {
  const now = new Date("2026-08-16T12:00:00Z");
  const base = { revokedAt: null, expiresAt: null, maxUses: null, uses: 0 };

  it("an open-ended link with no cap is always good", () => {
    expect(inviteUsable(base, now)).toBe(true);
  });

  it("a revoked link is dead no matter what else is true", () => {
    expect(inviteUsable({ ...base, revokedAt: new Date("2026-08-01") }, now)).toBe(false);
  });

  it("expiry is a hard edge: the instant it passes, the link closes", () => {
    expect(inviteUsable({ ...base, expiresAt: new Date("2026-08-16T12:00:01Z") }, now)).toBe(true);
    expect(inviteUsable({ ...base, expiresAt: new Date("2026-08-16T12:00:00Z") }, now)).toBe(false);
    expect(inviteUsable({ ...base, expiresAt: new Date("2026-08-16T11:59:59Z") }, now)).toBe(false);
  });

  it("a capped link dies exactly when uses reaches the cap", () => {
    expect(inviteUsable({ ...base, maxUses: 3, uses: 2 }, now)).toBe(true);
    expect(inviteUsable({ ...base, maxUses: 3, uses: 3 }, now)).toBe(false);
    expect(inviteUsable({ ...base, maxUses: 3, uses: 4 }, now)).toBe(false);
    // maxUses: 0 is a link that admits nobody — still dead at uses 0.
    expect(inviteUsable({ ...base, maxUses: 0, uses: 0 }, now)).toBe(false);
  });

  it("names why a dead link is dead, and nothing for a live one", () => {
    expect(inviteDeadReason(base, now)).toBeNull();
    expect(inviteDeadReason({ ...base, revokedAt: new Date("2026-08-01") }, now)).toMatch(/turned off/i);
    expect(inviteDeadReason({ ...base, expiresAt: new Date("2026-08-15") }, now)).toMatch(/expired/i);
    expect(inviteDeadReason({ ...base, maxUses: 1, uses: 1 }, now)).toMatch(/used up/i);
  });
});
