/**
 * How a stored credential is shown to the person who stored it.
 *
 * A token on file has to be visible enough to tell two of them apart on a screen and
 * invisible enough that reading the page is not the same as stealing the account. Four
 * trailing characters do both. Every surface that mentions a credential — the alerts
 * screen, the intake-channel route — goes through this, so there is one answer to
 * "how much of a secret do we print".
 */
export function tokenHint(token: string | null | undefined): string {
  const value = (token ?? "").trim();
  if (!value) return "";
  return `••••${value.slice(-4)}`;
}
