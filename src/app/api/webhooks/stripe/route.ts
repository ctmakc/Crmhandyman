import { NextRequest, NextResponse } from "next/server";
import { adjustCredits } from "@/lib/credit-adjustments";
import { getCreditPack } from "@/lib/credit-packs";
import { escapeHtml, sendOutboundEmail } from "@/lib/email";
import { prisma } from "@/lib/prisma";
import { verifyStripeWebhookSignature } from "@/lib/stripe-webhook.js";

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

  if (!event.id || !event.type || !SUPPORTED_EVENTS.has(event.type)) {
    return NextResponse.json({ received: true, processed: false });
  }

  const session = event.data?.object;
  if (!session?.id || session.object !== "checkout.session") {
    return NextResponse.json({ error: "Stripe event does not contain a Checkout Session." }, { status: 400 });
  }
  if (session.payment_status !== "paid") {
    return NextResponse.json({ received: true, processed: false, reason: "PAYMENT_NOT_PAID" });
  }

  const tenantId = session.metadata?.tenantId?.trim() || "";
  const packId = session.metadata?.creditPackId?.trim() || "";
  const metadataCredits = Number(session.metadata?.credits);
  const pack = getCreditPack(packId);

  if (!tenantId || !pack || !Number.isInteger(metadataCredits) || metadataCredits !== pack.credits) {
    console.error("Stripe credit checkout metadata failed validation", {
      eventId: event.id,
      sessionId: session.id,
      tenantId,
      packId,
      metadataCredits,
    });
    return NextResponse.json({ error: "Invalid credit purchase metadata." }, { status: 400 });
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, businessName: true, ownerEmail: true },
  });
  if (!tenant) {
    return NextResponse.json({ error: "Credit purchase workspace not found." }, { status: 400 });
  }

  try {
    const result = await prisma.$transaction((tx) =>
      adjustCredits(tx, {
        tenantId: tenant.id,
        amount: pack.credits,
        type: "CREDIT_PURCHASE",
        idempotencyKey: `stripe:checkout:${session.id}`,
        description: `${pack.label} purchased through Stripe Checkout`,
        referenceType: "STRIPE_CHECKOUT",
        referenceId: session.id,
      })
    );

    if (!result.replayed) {
      try {
        await sendOutboundEmail({
          to: tenant.ownerEmail,
          subject: `${pack.credits} HandymanPro credits added`,
          text: [
            `Payment received for ${pack.label}.`,
            `Credits added: ${pack.credits}`,
            `New wallet balance: ${result.wallet.balance}`,
            `Stripe Checkout Session: ${session.id}`,
          ].join("\n"),
          html: `
            <p>Payment received for <strong>${escapeHtml(pack.label)}</strong>.</p>
            <p><strong>Credits added:</strong> ${pack.credits}<br>
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
    });
  } catch (error) {
    console.error("Unable to apply Stripe credit purchase", {
      eventId: event.id,
      sessionId: session.id,
      error,
    });
    return NextResponse.json({ error: "Unable to apply credit purchase." }, { status: 500 });
  }
}
