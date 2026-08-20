import { describe, it, expect } from "vitest";
import { approvalEmailCopy, APP_BASE_DOMAIN } from "@/lib/approval-email";

/**
 * The approval email. The one thing that must be right is the sign-in link: it has to point
 * at the owner's OWN workspace subdomain, on the real host. A blank link, or one that drops
 * the slug, sends a just-approved contractor to the wrong desk — or to nowhere — and the
 * whole point of the mail (here is your desk, walk in) is lost.
 */

const owner = { slug: "korvex", businessName: "Korvex Developments", ownerEmail: "vlad@korvex.ca" };

describe("approvalEmailCopy", () => {
  it("points the sign-in link at the owner's own subdomain on the real host", () => {
    const copy = approvalEmailCopy(owner);
    expect(copy.signInUrl).toBe(`https://korvex.${APP_BASE_DOMAIN}`);
    // The link the owner clicks appears verbatim in the body they read.
    expect(copy.body.join("\n")).toContain(copy.signInUrl);
  });

  it("names the workspace in the subject so it is findable in an inbox", () => {
    expect(approvalEmailCopy(owner).subject).toBe("Your HandyCRM workspace korvex is ready");
  });

  it("carries the slug into the link, never a fixed or empty host", () => {
    const other = approvalEmailCopy({ ...owner, slug: "northline" });
    expect(other.signInUrl).toBe(`https://northline.${APP_BASE_DOMAIN}`);
    // A different workspace gets a different door — the slug is not hard-coded away.
    expect(other.signInUrl).not.toBe(approvalEmailCopy(owner).signInUrl);
  });

  it("honours an override host without losing the slug", () => {
    expect(approvalEmailCopy(owner, "staging.example.com").signInUrl).toBe("https://korvex.staging.example.com");
  });
});
