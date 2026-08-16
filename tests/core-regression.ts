import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { chaseStage, daysOverdue, displayStatus, owingOf } from "../src/lib/invoice-state";
import { signIntakePayload, verifyIntakeSignature } from "../src/lib/intake-signature";
import { verifyFbWebhookSignature } from "../src/lib/integrations/facebook";

function invoiceRegression() {
  const now = new Date(2026, 2, 15, 12, 0, 0);
  const invoice = {
    status: "PARTIAL",
    total: 1000,
    amountPaid: 250,
    dueDate: new Date(2026, 2, 1, 9, 0, 0),
  };

  assert.equal(owingOf(invoice), 750);
  assert.equal(displayStatus(invoice, now), "OVERDUE");
  assert.equal(daysOverdue(invoice, now), 14);
  assert.equal(chaseStage(invoice, now)?.level, 2);
  assert.equal(displayStatus({ ...invoice, amountPaid: 1000 }, now), "PARTIAL");
  assert.equal(displayStatus({ ...invoice, status: "PAID" }, now), "PAID");
}

function intakeSignatureRegression() {
  const secret = "test-secret-do-not-use";
  const now = Date.UTC(2026, 7, 15, 23, 30, 0);
  const timestamp = String(now);
  const rawBody = JSON.stringify({ externalId: "lead-123456", name: "Jamie", phone: "+16135550123" });
  const signature = signIntakePayload(rawBody, timestamp, secret);

  assert.equal(verifyIntakeSignature({ rawBody, timestamp, signature, secret, now }), true);
  assert.equal(verifyIntakeSignature({ rawBody: `${rawBody}x`, timestamp, signature, secret, now }), false);
  assert.equal(verifyIntakeSignature({ rawBody, timestamp, signature: `sha256=${signature}`, secret, now }), true);
  assert.equal(
    verifyIntakeSignature({ rawBody, timestamp: String(now - 6 * 60 * 1000), signature, secret, now }),
    false
  );
}

function metaSignatureRegression() {
  const secret = "meta-test-secret";
  const body = JSON.stringify({ object: "page", entry: [{ id: "123" }] });
  const signature = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;

  assert.equal(verifyFbWebhookSignature(body, signature, secret), true);
  assert.equal(verifyFbWebhookSignature(`${body}x`, signature, secret), false);
  assert.equal(verifyFbWebhookSignature(body, signature.replace(/.$/, "0"), secret), false);
  assert.equal(verifyFbWebhookSignature(body, "", secret), false);
  assert.equal(verifyFbWebhookSignature(body, signature, ""), false);
}

invoiceRegression();
intakeSignatureRegression();
metaSignatureRegression();
console.log("core regression checks passed");
