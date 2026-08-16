import { NextRequest, NextResponse } from "next/server";
import { applyStripeCheckoutEvent, verifyStripeSignature } from "@/lib/stripe-payments";
import { writeAuditEvent } from "@/lib/audit";

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("stripe-signature");
  if (!verifyStripeSignature({ rawBody, signatureHeader: signature })) {
    return NextResponse.json({ error: "Invalid Stripe signature" }, { status: 400 });
  }

  let event: unknown;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const result = await applyStripeCheckoutEvent(event as Parameters<typeof applyStripeCheckoutEvent>[0]);

  if (result.kind === "paid") {
    await writeAuditEvent({
      tenantId: result.tenantId,
      action: "invoice.stripe_payment_settled",
      entityType: "invoice",
      entityId: result.invoiceId,
      summary: `Stripe card payment settled on ${result.invoiceNumber}`,
      metadata: {
        eventId: result.eventId,
        sessionId: result.sessionId,
        paymentId: result.paymentId,
        amount: result.amount,
      },
    });
  } else if (result.kind === "mismatch") {
    await writeAuditEvent({
      tenantId: result.tenantId,
      action: "invoice.stripe_payment_mismatch",
      entityType: "invoice",
      entityId: result.invoiceId,
      summary: result.invoiceNumber
        ? `Stripe payment requires review on ${result.invoiceNumber}`
        : "Stripe payment requires review",
      metadata: { eventId: result.eventId, reason: result.reason },
    });
  }

  // Signature-valid events get a 2xx after deterministic handling. In particular,
  // mismatch events are deliberately NOT booked into CRM and are surfaced in audit
  // for refund/reconciliation rather than being retried into an unsafe state.
  return NextResponse.json({ received: true, result: result.kind });
}
