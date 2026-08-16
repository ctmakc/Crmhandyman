/**
 * One reading of a channel's inbound address, so the desk that claims an inbox and the
 * webhook that routes mail to it can never disagree about what "the same address" means.
 *
 * The email webhook decides which workspace a message belongs to by comparing the
 * recipient against each integration's stored address, lowercased and trimmed
 * (configuredAddress in src/app/api/webhooks/email/route.ts). If the settings form
 * stored "Leads-Bob@Ex.com " and routing looked for "leads-bob@ex.com", a workspace
 * would silently receive nothing — and, worse, a uniqueness check that normalised
 * differently than routing would let two workspaces both "own" one inbox on paper while
 * routing handed every lead to one of them. So this is the single ruler both sides read.
 *
 * The form has stored the address two ways over the product's life: as a bare string,
 * and as JSON carrying `address` (or the older `email`). Both are accepted; the webhook
 * accepts both too, and this must keep matching it byte for byte.
 */
export function normalizeChannelAddress(config: unknown): string | null {
  let value: unknown = config;

  // A stored row arrives as a JSON string; the settings PUT hands us the parsed object
  // directly. Parse a string when it looks like JSON, and fall back to treating it as
  // the address itself — exactly the webhook's own two-step.
  if (typeof config === "string") {
    try {
      value = JSON.parse(config);
    } catch {
      value = config;
    }
  }

  if (typeof value === "string") return value.trim().toLowerCase() || null;

  if (value && typeof value === "object") {
    const obj = value as { address?: unknown; email?: unknown };
    const raw =
      typeof obj.address === "string"
        ? obj.address
        : typeof obj.email === "string"
          ? obj.email
          : undefined;
    return raw ? raw.trim().toLowerCase() || null : null;
  }

  return null;
}
