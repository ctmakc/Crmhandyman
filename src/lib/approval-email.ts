/**
 * The email a workspace owner gets the moment an operator approves them.
 *
 * The waiting room (/pending) promises "you get an email when approved". This is that
 * email's words and its sign-in link, kept pure — no transport, no database — the way
 * `reminderCopy` sits apart from `sendReminder`, so the one thing worth checking (the link
 * points at the owner's own workspace, on the right host) can be tested without a mail
 * server. The script that runs approvals (scripts/approve-tenant.ts) hands the copy to the
 * shared SMTP transport in `@/lib/mailer`.
 */

/**
 * Where an approved owner signs in: their workspace lives at <slug>.<root>. The root is
 * the same one every subdomain shares (NEXTAUTH_COOKIE_DOMAIN, e.g. ".itopsi.com"), read
 * from the environment so the approval email points at wherever the product actually runs
 * and never drifts from the real domain after a move. Unset → itopsi.com.
 */
export const APP_BASE_DOMAIN =
  (process.env.NEXTAUTH_COOKIE_DOMAIN ?? "").trim().replace(/^\./, "") || "itopsi.com";

export interface ApprovalTarget {
  slug: string;
  businessName: string;
  ownerEmail: string;
}

export interface ApprovalCopy {
  /** The workspace's front door — what the owner clicks to sign in. */
  signInUrl: string;
  subject: string;
  /** Paragraphs, joined with blank lines for text and wrapped in <p> for html. */
  body: string[];
}

export function approvalEmailCopy(t: ApprovalTarget, baseDomain: string = APP_BASE_DOMAIN): ApprovalCopy {
  const signInUrl = `https://${t.slug}.${baseDomain}`;
  return {
    signInUrl,
    subject: `Your HandyCRM workspace ${t.slug} is ready`,
    body: [
      `Your HandyCRM workspace ${t.slug} is ready.`,
      `Sign in at ${signInUrl}`,
      `— HandyCRM`,
    ],
  };
}
