import test from "node:test";
import assert from "node:assert/strict";
import { validateStripeCreditSession } from "../src/lib/stripe-credit-reconciliation.js";

const pack = {
  id: "starter",
  credits: 25,
  amountCents: 4900,
  currency: "CAD",
};

function session(overrides = {}) {
  return {
    client_reference_id: "tenant_123",
    amount_total: 4900,
    currency: "cad",
    metadata: {
      tenantId: "tenant_123",
      creditPackId: "starter",
      credits: "25",
      amountCents: "4900",
      currency: "CAD",
      checkoutRequestId: "request_123",
    },
    ...overrides,
  };
}

test("accepts a fully reconciled paid Checkout Session", () => {
  assert.deepEqual(validateStripeCreditSession(session(), pack), {
    valid: true,
    tenantId: "tenant_123",
    checkoutRequestId: "request_123",
  });
});

test("rejects tenant reference substitution", () => {
  assert.deepEqual(
    validateStripeCreditSession(session({ client_reference_id: "tenant_other" }), pack),
    { valid: false, reason: "TENANT_REFERENCE_MISMATCH" }
  );
});

test("rejects a different paid amount", () => {
  assert.deepEqual(validateStripeCreditSession(session({ amount_total: 1900 }), pack), {
    valid: false,
    reason: "PAID_AMOUNT_MISMATCH",
  });
});

test("rejects a different paid currency", () => {
  assert.deepEqual(validateStripeCreditSession(session({ currency: "usd" }), pack), {
    valid: false,
    reason: "PAID_CURRENCY_MISMATCH",
  });
});

test("rejects modified credit metadata", () => {
  const altered = session({
    metadata: { ...session().metadata, credits: "250" },
  });
  assert.deepEqual(validateStripeCreditSession(altered, pack), {
    valid: false,
    reason: "CREDIT_COUNT_MISMATCH",
  });
});

test("rejects modified pack metadata", () => {
  const altered = session({
    metadata: { ...session().metadata, creditPackId: "enterprise" },
  });
  assert.deepEqual(validateStripeCreditSession(altered, pack), {
    valid: false,
    reason: "PACK_MISMATCH",
  });
});
