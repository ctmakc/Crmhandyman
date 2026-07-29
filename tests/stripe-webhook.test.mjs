import test from "node:test";
import assert from "node:assert/strict";
import {
  createStripeTestSignature,
  parseStripeSignatureHeader,
  verifyStripeWebhookSignature,
} from "../src/lib/stripe-webhook.js";

const secret = "whsec_test_secret";
const payload = JSON.stringify({
  id: "evt_test_credit_purchase",
  type: "checkout.session.completed",
});

test("accepts a valid Stripe v1 signature", () => {
  const now = 1_800_000_000;
  const header = createStripeTestSignature(payload, secret, now);
  assert.deepEqual(
    verifyStripeWebhookSignature({
      payload,
      header,
      secret,
      nowSeconds: now,
    }),
    { valid: true, timestamp: now }
  );
});

test("accepts any matching v1 signature during secret rotation", () => {
  const now = 1_800_000_000;
  const validHeader = createStripeTestSignature(payload, secret, now);
  const validSignature = parseStripeSignatureHeader(validHeader).signatures[0];
  const header = `t=${now},v1=${"0".repeat(64)},v1=${validSignature}`;
  const result = verifyStripeWebhookSignature({ payload, header, secret, nowSeconds: now });
  assert.equal(result.valid, true);
});

test("rejects modified payloads", () => {
  const now = 1_800_000_000;
  const header = createStripeTestSignature(payload, secret, now);
  const result = verifyStripeWebhookSignature({
    payload: `${payload} `,
    header,
    secret,
    nowSeconds: now,
  });
  assert.deepEqual(result, { valid: false, reason: "SIGNATURE_MISMATCH" });
});

test("rejects timestamps outside the tolerance", () => {
  const timestamp = 1_800_000_000;
  const header = createStripeTestSignature(payload, secret, timestamp);
  const result = verifyStripeWebhookSignature({
    payload,
    header,
    secret,
    toleranceSeconds: 300,
    nowSeconds: timestamp + 301,
  });
  assert.deepEqual(result, { valid: false, reason: "TIMESTAMP_OUTSIDE_TOLERANCE" });
});

test("rejects malformed signature headers", () => {
  const result = verifyStripeWebhookSignature({
    payload,
    header: "v1=abc",
    secret,
    nowSeconds: 1_800_000_000,
  });
  assert.deepEqual(result, { valid: false, reason: "MALFORMED_HEADER" });
});
