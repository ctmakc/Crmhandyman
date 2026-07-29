import { NextRequest, NextResponse } from "next/server";
import { recordAuditEvent } from "@/lib/audit";
import { adjustCredits } from "@/lib/credit-adjustments";
import { getCreditPack } from "@/lib/credit-packs";
import { escapeHtml, sendOutboundEmail } from "@/lib/email";
import { prisma } from "@/lib/prisma";
import { validateStripeCreditSession } from "@/lib/stripe-credit-reconciliation.js";
import { verifyStripeWebhookSignature } from "@/lib/stripe-webhook.js";
import { receiveWebhookEvent, updateWebhookReceipt } from "@/lib/webhook-receipts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_WEBHOOK_BYTES = 1024 * 1024;
const SUPPORTED_EVENTS = new Set([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
]);

type StripeCheckoutSession = {
  id?: string;
  object?: string;
  payment_status?: string;
  customer_email?: string | null;
  client_reference_id?: string | null;
  metadata?: Record<string, string> | null;
  amount_total?: number | null;
  currency?: string | null;
};

type StripeEvent = {
  id?: string;
  type?: string;
  livemode?: boolean;
  data?: { object?: StripeCheckoutSession };
};

export async function POST(req: NextRequest) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json({ error: "Stripe webhook is not configured." }, { status: 503 });
  }

  const contentLength = Number(req.headers.get("content-length") || 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_WEBHOOK_BYTES) {
    return NextResponse.json({ error: "Webhook payload is too large." }, { status: 413 });
  }

  const rawBody = await req.text();
  if (Buffer.byteLength(rawBody, "utf8") > MAX_WEBHOOK_BYTES) {
    return NextResponse.json({ error: "Webhook payload is too large." }, { status: 413 });
  }

  const signatureHeader = req.headers.get("stripe-signature") || "";
  const verification = verifyStripeWebhookSignature({
    payload: rawBody,
    header: signatureHeader,
    secret: webhookSecret,
    toleranceSeconds: 300,
  });
  if (!verification.valid) {
    console.warn("Rejected Stripe webhook", verification.reason);
    return NextResponse.json({ error: "Invalid Stripe webhook signature." }, { status: 400 });
  }

  let event: StripeEvent;
  try {
    event = JSON.parse(rawBody) as StripeEvent;
  } catch {
    return NextResponse.json({ error: "Invalid Stripe webhook JSON." }, { status: 400 });
  }

  if (!event.id || !event.type) {
    return NextResponse.json({ error: "Stripe event ID and type are required." }, { status: 400 });
  }

  const session = event.data?.object;
  let receipt;
  try {
    receipt = await receiveWebhookEvent({
      provider: "STRIPE",
      eventId: event.id,
      eventType: event.type,
      objectId: session?.id ?? null,
      payload: rawBody,
      livemode: event.livemode === true,
    });
  } catch (error) {
    console.error("Unable to persist Stripe webhook receipt", error);
    return NextResponse.json({ error: "Unable to persist webhook receipt." }, { status: 500 });
  }

  if (receipt.status === "PROCESSED") {
    return NextResponse.json({ received: true, processed: true, replayed: true });
  }

  if (!SUPPORTED_EVENTS.has(event.type)) {
    await updateWebhookReceipt(receipt.id, {
      status: "IGNORED",
      lastError: `Unsupported event type: ${event.type}`,
    });
    return NextResponse.json({ received: true, processed: false, ignored: true });
  }

  if (!session?.id || session.object !== "checkout.session") {
    await updateWebhookReceipt(receipt.id, {
      status: "FAILED",
      lastError: "Stripe event does not contain a Checkout Session.",
    });
    return NextResponse.json({ error: "Stripe event does not contain a Checkout Session." }, { status: 400 });
  }
  if (session.payment_status !== "paid") {
    await updateWebhookReceipt(receipt.id, {
      status: "IGNORED",
      lastError: `Payment status is ${session.payment_status || "unknown"}.`,
    });
    return NextResponse.json({ received: true, processed: false, reason: "PAYMENT_NOT_PAID" });
  }

  const packId = session.metadata?.creditPackId?.trim() || "";
  const pack = getCreditPack(packId);
  const reconciliation = validateStripeCreditSession(session, pack);
  if (!reconciliation.valid || !pack) {
    const reason = `Credit reconciliation failed: ${reconciliation.reason || "UNKNOWN"}`;
    await updateWebhookReceipt(receipt.id, { status: "FAILED", lastError: reason });
    console.error("Stripe credit checkout reconciliation failed", {
      eventId: event.id,
      sessionId: session.id,
      reason: reconciliation.reason,
      clientReferenceId: session.client_reference_id,
      metadata: session.metadata,
      amountTotal: session.amount_total,
      currency: session.currency,
    });
    return NextResponse.json({ error: "Invalid credit purchase reconciliation data." }, { status: 400 });
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: reconciliation.tenantId },
    select: { id: true, businessName: true, ownerEmail: true },
  });
  if (!tenant) {
    await updateWebhookReceipt(receipt.id, {
      status: "FAILED",
      lastError: "Credit purchase workspace not found.",
    });
    return NextResponse.json({ error: "Credit purchase workspace not found." }, { status: 400 });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const purchase = await adjustCredits(tx, {
        tenantId: tenant.id,
        amount: pack.credits,
        type: "CREDIT_PURCHASE",
        idempotencyKey: `stripe:checkout:${session.id}`,
        description: `${pack.label} purchased through Stripe Checkout`,
        referenceType: "STRIPE_CHECKOUT",
        referenceId: session.id,
      });

      if (!purchase.replayed) {
        await recordAuditEvent(
          {
            actor: { type: "WEBHOOK", id: event.id, email: null },
            tenantId: tenant.id,
            action: "STRIPE_CREDIT_PURCHASE_APPLIED",
            targetType: "CREDIT_WALLET",
            targetId: purchase.wallet.id,
            metadata: {
              eventId: event.id,
              sessionId: session.id,
              packId: pack.id,
              credits: pack.credits,
              amountCents: pack.amountCents,
              currency: pack.currency,
              transactionId: purchase.transaction.id,
              balanceAfter: purchase.wallet.balance,
              webhookAttempts: receipt.attempts,
            },
          },
          tx
        );
      }

      await updateWebhookReceipt(
        receipt.id,
        { status: "PROCESSED", lastError: null },
        tx
      );
      return purchase;
    });

    if (!result.replayed) {
      try {
        const formattedAmount = new Intl.NumberFormat("en-CA", {
          style: "currency",
          currency: pack.currency,
        }).format(pack.amountCents / 100);
        await sendOutboundEmail({
          to: tenant.ownerEmail,
          subject: `${pack.credits} HandymanPro credits added`,
          idempotencyKey: `stripe-credit-confirmation:${session.id}`,
          text: [
            `Payment received for ${pack.label}.`,
            `Payment amount: ${formattedAmount}`,
            `Credits added: ${pack.credits}`,
            `New wallet balance: ${result.wallet.balance}`,
            `Stripe Checkout Session: ${session.id}`,
          ].join("\n"),
          html: `
            <p>Payment received for <strong>${escapeHtml(pack.label)}</strong>.</p>
            <p><strong>Payment amount:</strong> ${escapeHtml(formattedAmount)}<br>
            <strong>Credits added:</strong> ${pack.credits}<br>
            <strong>New wallet balance:</strong> ${result.wallet.balance}<br>
            <strong>Stripe Checkout Session:</strong> ${escapeHtml(session.id)}</p>
          `,
        });
      } catch (emailError) {
        console.error("Credit purchase confirmation email failed", emailError);
      }
    }

    return NextResponse.json({
      received: true,
      processed: true,
      replayed: result.replayed,
      transactionId: result.transaction.id,
      balance: result.wallet.balance,
      webhookAttempts: receipt.attempts,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to apply credit purchase.";
    await updateWebhookReceipt(receipt.id, { status: "FAILED", lastError: message }).catch(
      (receiptError) => console.error("Unable to mark Stripe receipt failed", receiptError)
    );
    console.error("Unable to apply Stripe credit purchase", {
      eventId: event.id,
      sessionId: session.id,
      error,
    });
    return NextResponse.json({ error: "Unable to apply credit purchase." }, { status: 500 });
  }
}
