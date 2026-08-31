import crypto from "crypto";
import { afterEach, describe, expect, it } from "vitest";
import {
  facebookLeadUrl,
  metaGraphVersion,
  verifyFbWebhookSignature,
} from "@/lib/integrations/facebook";

const originalVersion = process.env.META_GRAPH_VERSION;

afterEach(() => {
  if (originalVersion === undefined) delete process.env.META_GRAPH_VERSION;
  else process.env.META_GRAPH_VERSION = originalVersion;
});

describe("Meta Graph integration", () => {
  it("defaults to the current v26.0 contract and requests supported attribution fields", () => {
    delete process.env.META_GRAPH_VERSION;
    expect(metaGraphVersion()).toBe("v26.0");
    const rawUrl = facebookLeadUrl("lead 123");
    expect(rawUrl).toContain("https://graph.facebook.com/v26.0/lead%20123?");
    const decodedUrl = decodeURIComponent(rawUrl);
    for (const field of [
      "campaign_id",
      "campaign_name",
      "adset_id",
      "adset_name",
      "ad_id",
      "ad_name",
      "form_id",
    ]) {
      expect(decodedUrl).toContain(field);
    }
    // Lead exposes form_id. Asking the Lead edge for form_name can make the entire
    // Graph request fail; resolving a form's name is a separate lookup and is optional.
    expect(decodedUrl).not.toContain("form_name");
    expect(rawUrl).not.toContain("access_token=");
  });

  it("accepts a valid operator override but rejects malformed versions", () => {
    process.env.META_GRAPH_VERSION = "v27.0";
    expect(metaGraphVersion()).toBe("v27.0");
    process.env.META_GRAPH_VERSION = "27.0?hack=1";
    expect(metaGraphVersion()).toBe("v26.0");
  });

  it("verifies the exact x-hub signature without throwing on malformed input", () => {
    const body = JSON.stringify({ object: "page" });
    const secret = "test-secret";
    const signature =
      "sha256=" + crypto.createHmac("sha256", secret).update(body).digest("hex");
    expect(verifyFbWebhookSignature(body, signature, secret)).toBe(true);
    expect(verifyFbWebhookSignature(body, signature.slice(0, -2), secret)).toBe(false);
    expect(verifyFbWebhookSignature(body, "garbage", secret)).toBe(false);
  });
});
