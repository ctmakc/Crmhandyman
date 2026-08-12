/**
 * One rule for reading the workspace out of an address, shared by the middleware and the
 * login form. They disagreed before: the middleware read the subdomain while the login
 * page always asked for "demo", so on a real subdomain every sign-in was checked against
 * the wrong tenant and failed.
 */
export function slugFromHost(host: string, override?: string | null): string {
  if (override) return override;

  const hostname = (host || "").split(":")[0];
  const parts = hostname.split(".");

  // <slug>.domain.com — anything shorter is localhost or a bare apex.
  if (parts.length >= 3 && parts[0] !== "www") return parts[0];

  return "demo";
}
