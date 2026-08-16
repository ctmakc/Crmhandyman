import crypto from "node:crypto";

/**
 * THE INVITE, minus the database.
 *
 * An owner grows a crew two ways and both come down to one token: a NAMED invite carries
 * the person's email (they join approved), an OPEN link carries none (they join and wait).
 * The token is the whole capability — random, url-safe, unguessable — so the join page is
 * public and checks the token instead of a session. This file mints the token, builds the
 * link the owner copies, and answers the one question every reader of an invite asks:
 * is it still good?
 */

/**
 * A token nobody can guess. 24 bytes of randomness, base64url so it drops straight into a
 * path with no escaping — the same shape the intake key and the Google unusable-password
 * already use elsewhere in the product.
 */
export function newInviteToken(): string {
  return crypto.randomBytes(24).toString("base64url");
}

/**
 * The workspace's own public address. Every workspace is a subdomain of one shared root
 * (NEXTAUTH_COOKIE_DOMAIN, e.g. ".agintent.com"), so a slug becomes https://<slug>.<root>.
 *
 * Unset (dev, test, a single-host deploy) → fall back to NEXTAUTH_URL, the host the app is
 * actually answering on, so the link a test or a local owner copies still resolves. The
 * result never ends in a slash; `joinUrl` adds the path.
 */
export function workspaceBaseUrl(slug: string): string {
  const root = (process.env.NEXTAUTH_COOKIE_DOMAIN ?? "").trim().replace(/^\./, "");
  if (root) return `https://${slug}.${root}`;
  const url = (process.env.NEXTAUTH_URL ?? "").trim().replace(/\/+$/, "");
  return url || "";
}

/** The full link the owner shares: https://<slug>.agintent.com/join/<token>. */
export function joinUrl(slug: string, token: string): string {
  return `${workspaceBaseUrl(slug)}/join/${token}`;
}

/** Just the fields that decide whether a link still works — the row carries more. */
export type InviteState = {
  revokedAt: Date | null;
  expiresAt: Date | null;
  maxUses: number | null;
  uses: number;
};

/**
 * Is this invite still good to follow? Revoked kills it outright; an expiry in the past
 * kills it; a use count that has reached its cap kills it. `maxUses` null is unlimited and
 * `expiresAt` null never expires, so an open-ended link only ever dies by revocation.
 *
 * `now` is a parameter so the same rule is testable without waiting for a clock, and so a
 * single request reads one consistent instant.
 */
export function inviteUsable(inv: InviteState, now: Date = new Date()): boolean {
  if (inv.revokedAt) return false;
  if (inv.expiresAt && inv.expiresAt.getTime() <= now.getTime()) return false;
  if (inv.maxUses !== null && inv.uses >= inv.maxUses) return false;
  return true;
}

/**
 * Why a link is dead, for the one message the join page shows a visitor who arrives too
 * late. Kept deliberately vague — "revoked" and "used up" both read as «ask for a new
 * link», and a probing stranger learns nothing about the workspace either way.
 */
export function inviteDeadReason(inv: InviteState, now: Date = new Date()): string | null {
  if (inv.revokedAt) return "This invite link was turned off. Ask for a new one.";
  if (inv.expiresAt && inv.expiresAt.getTime() <= now.getTime())
    return "This invite link has expired. Ask for a new one.";
  if (inv.maxUses !== null && inv.uses >= inv.maxUses)
    return "This invite link has been used up. Ask for a new one.";
  return null;
}
