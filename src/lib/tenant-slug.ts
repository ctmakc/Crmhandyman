/**
 * One rule for reading the workspace out of an address, shared by the middleware and the
 * login form. They disagreed before: the middleware read the subdomain while the login
 * page always asked for "demo", so on a real subdomain every sign-in was checked against
 * the wrong tenant and failed.
 */

/**
 * The product's own front door, e.g. "crm.agintent.com". Without this the first-label
 * rule below would read that address as workspace «crm» — the home host is itself a
 * subdomain, so login and registration could never live on one. Read at call time, not
 * module load, so the middleware picks up the deployment's value and tests can vary it.
 *
 * In the client bundle Next.js compiles this to `undefined` (only NEXT_PUBLIC_ vars are
 * inlined), so the browser-side login form falls back to the plain rule; on the home
 * host it is expected to name the workspace explicitly via ?slug= instead.
 */
function homeHost(): string {
  return (process.env.CRM_HOME_HOST ?? "").trim().toLowerCase().split(":")[0];
}

/**
 * First labels that are infrastructure, not workspaces. The login form runs in the
 * browser where CRM_HOME_HOST compiles to undefined, so the env check alone cannot
 * save it: on crm.agintent.com the client-side parser would read workspace «crm» and
 * every sign-in would probe a ghost tenant. Registration refuses to mint these slugs
 * (src/app/api/register/route.ts), which is what keeps the list safe to hardcode.
 */
export const RESERVED_LABELS = new Set(["www", "crm", "app", "login", "mail", "api", "admin", "status"]);

export function slugFromHost(host: string, override?: string | null): string {
  if (override) return override;

  const hostname = (host || "").split(":")[0];

  // Hosts are case-insensitive on the wire; the port is whatever proxy or dev server
  // happens to be in front and says nothing about the workspace.
  const home = homeHost();
  if (home && hostname.toLowerCase() === home) return "demo";

  const parts = hostname.toLowerCase().split(".");

  // <slug>.domain.com — anything shorter is localhost or a bare apex.
  if (parts.length >= 3 && !RESERVED_LABELS.has(parts[0])) return parts[0];

  return "demo";
}
