import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";

const STRIPE_API = "https://api.stripe.com/v1";
const STRIPE_CHANNEL = "STRIPE_CHECKOUT";
const CAD = "cad";
const SIGNATURE_TOLERANCE_SECONDS = 5 * 60;

export class StripePaymentError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
    this.name = "StripePaymentError";
    Object.setPrototypeOf(this, StripePaymentError.prototype);
  }
}

function stripeSecretKey() {
  return process.env.STRIPE_SECRET_KEY?.trim() || null;
}

function stripeWebhookSecret() {
  return process.env.STRIPE_WEBHOOK_SECRET?.trim() || null;
}

export function stripePaymentsConfigured() {
  return Boolean(stripeSecretKey() && stripeWebhookSecret());
}

function safeEqualHex(a: string, b: string) {
  if (!/^[a-f0-9]+$/i.test(a) || !/^[a-f0-9]+$/i.test(b)) return false;
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");
  return left.length === right.length && timingSafeEqual(left, right);
}

export function verifyStripeSignature(input: {
  rawBody: string;
  signatureHeader: string | null | undefined;
  secret?: string | null;
  nowMs?: number;
}) {
  const secret = input.secret ?? stripeWebhookSecret();
  if (!secret || !input.signatureHeader) return false;

  const parts = input.signatureHeader.split(",").map((part) => part.trim());
  const timestampPart = parts.find((part) => part.startsWith("t="));
  const timestamp = Number(timestampPart?.slice(2));
  if (!Number.isFinite(timestamp)) return false;

  const nowSeconds = Math.floor((input.nowMs ?? Date.now()) / 1000);
  if (Math.abs(nowSeconds - timestamp) > SIGNATURE_TOLERANCE_SECONDS) return false;

  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${input.rawBody}`)
    .digest("hex");

  return parts
    .filter((part) => part.startsWith("v1="))
    .map((part) => part.slice(3))
    .some((candidate) => safeEqualHex(expected, candidate));
}

interface CheckoutSessionResponse {
  id: string;
  url?: string | null;
  expires_at?: number;
  error?: { message?: string };
}

export async function createStripeCheckout(input: {
  tenantId: string;
  invoiceId: string;
  successUrl: string;
  cancelUrl: string;
}) {
  const secret = stripeSecretKey();
  if (!secret) throw new StripePaymentError("Online card payments are not configured", 503);

  const invoice = await prisma.invoice.findFirst({
    where: { id: input.invoiceId, tenantId: input.tenantId },
    include: { payments: { select: { amount: true } } },
  });
  if (!invoice) throw new StripePaymentError("Invoice not found", 404);
  if (invoice.status === "VOID") throw new StripePaymentError("Voided invoices cannot be paid", 409);

  const paidCents = invoice.payments.reduce((sum, payment) => sum + Math.round(payment.amount * 100), 0);
  const totalCents = Math.round(invoice.total * 100);
  const owingCents = Math.max(0, totalCents - paidCents);
  if (owingCents <= 0 || invoice.status === "PAID") {
    throw new StripePaymentError("Invoice is already settled", 409);
  }

  const form = new URLSearchParams();
  form.set("mode", "payment");
  form.set("success_url", input.successUrl);
  form.set("cancel_url", input.cancelUrl);
  form.set("client_reference_id", invoice.id);
  form.set("line_items[0][price_data][currency]", CAD);
  form.set("line_items[0][price_data][product_data][name]", `Invoice ${invoice.number}`);
  form.set("line_items[0][price_data][product_data][description]", invoice.clientName);
  form.set("line_items[0][price_data][unit_amount]", String(owingCents));
  form.set("line_items[0][quantity]", "1");
  form.set("metadata[tenantId]", input.tenantId);
  form.set("metadata[invoiceId]", invoice.id);
  form.set("metadata[owingCents]", String(owingCents));
  form.set("payment_intent_data[metadata][tenantId]", input.tenantId);
  form.set("payment_intent_data[metadata][invoiceId]", invoice.id);
  if (invoice.email) form.set("customer_email", invoice.email);

  // Stripe keeps idempotency keys for at least 24 hours. The Checkout Session expires
  // just before that, so repeated clicks for the same invoice balance resolve to one
  // chargeable session instead of opening several independently payable windows.
  form.set("expires_at", String(Math.floor(Date.now() / 1000) + 23 * 60 * 60 + 45 * 60));

  const response = await fetch(`${STRIPE_API}/checkout/sessions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Idempotency-Key": `handyman-invoice-${invoice.id}-${owingCents}`,
    },
    body: form,
    cache: "no-store",
  });
  const payload = (await response.json()) as CheckoutSessionResponse;
  if (!response.ok || !payload.id || !payload.url) {
    throw new StripePaymentError(payload.error?.message || "Stripe Checkout could not be created", 502);
  }

  return {
    id: payload.id,
    url: payload.url,
    expiresAt: payload.expires_at ?? null,
    owingCents,
    invoiceNumber: invoice.number,
  };
}

interface StripeCheckoutEvent {
  id: string;
  type: string;
  data?: {
    object?: {
      id?: string;
      payment_status?: string;
      amount_total?: number | null;
      currency?: string | null;
      payment_intent?: string | null;
      metadata?: Record<string, string | undefined> | null;
    };
  };
}

type ApplyResult =
  | { kind: "ignored"; reason: string }
  | { kind: "duplicate"; tenantId: string; invoiceId: string }
  | {
      kind: "paid";
      tenantId: string;
      invoiceId: string;
      invoiceNumber: string;
      paymentId: string;
      amount: number;
      sessionId: string | null;
      eventId: string;
    }
  | {
      kind: "mismatch";
      tenantId: string;
      invoiceId: string;
      invoiceNumber?: string;
      reason: string;
      eventId: string;
    };

function uniqueConstraintError(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "P2002");
}

export async function applyStripeCheckoutEvent(event: StripeCheckoutEvent): Promise<ApplyResult> {
  if (!event.id || !["checkout.session.completed", "checkout.session.async_payment_succeeded"].includes(event.type)) {
    return { kind: "ignored", reason: "event type is not a completed Checkout payment" };
  }

  const session = event.data?.object;
  if (!session || session.payment_status !== "paid") {
    return { kind: "ignored", reason: "Checkout Session is not paid" };
  }

  const tenantId = session.metadata?.tenantId?.trim() || "";
  const invoiceId = session.metadata?.invoiceId?.trim() || "";
  const metadataOwing = Number(session.metadata?.owingCents);
  const amountTotal = Number(session.amount_total);
  const currency = String(session.currency || "").toLowerCase();

  if (!tenantId || !invoiceId || !Number.isInteger(amountTotal) || amountTotal <= 0 || !Number.isInteger(metadataOwing)) {
    return { kind: "ignored", reason: "required Checkout metadata is missing" };
  }
  if (currency !== CAD || metadataOwing !== amountTotal) {
    return { kind: "mismatch", tenantId, invoiceId, reason: "Checkout metadata/currency mismatch", eventId: event.id };
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const seen = await tx.inboundReceipt.findFirst({
        where: { tenantId, channel: STRIPE_CHANNEL, externalId: event.id },
        select: { id: true },
      });
      if (seen) return { kind: "duplicate", tenantId, invoiceId } as const;

      const invoice = await tx.invoice.findFirst({
        where: { id: invoiceId, tenantId },
        include: { payments: { select: { amount: true } } },
      });
      if (!invoice) {
        return { kind: "mismatch", tenantId, invoiceId, reason: "Invoice not found for Checkout payment", eventId: event.id } as const;
      }
      if (invoice.status === "VOID") {
        return {
          kind: "mismatch",
          tenantId,
          invoiceId,
          invoiceNumber: invoice.number,
          reason: "Checkout payment arrived for a void invoice",
          eventId: event.id,
        } as const;
      }

      const paidCents = invoice.payments.reduce((sum, payment) => sum + Math.round(payment.amount * 100), 0);
      const owingCents = Math.max(0, Math.round(invoice.total * 100) - paidCents);
      if (owingCents !== amountTotal) {
        return {
          kind: "mismatch",
          tenantId,
          invoiceId,
          invoiceNumber: invoice.number,
          reason: `Stripe paid ${amountTotal} cents but CRM currently shows ${owingCents} cents owing`,
          eventId: event.id,
        } as const;
      }

      const payment = await tx.payment.create({
        data: {
          tenantId,
          projectId: invoice.projectId,
          invoiceId: invoice.id,
          amount: amountTotal / 100,
          method: "CARD",
          notes: `Stripe Checkout ${session.id || "unknown"}${session.payment_intent ? ` · ${session.payment_intent}` : ""}`,
        },
      });
      await tx.invoice.update({
        where: { id: invoice.id },
        data: { status: "PAID", paidAt: new Date() },
      });
      await tx.inboundReceipt.create({
        data: { tenantId, channel: STRIPE_CHANNEL, externalId: event.id },
      });

      return {
        kind: "paid",
        tenantId,
        invoiceId,
        invoiceNumber: invoice.number,
        paymentId: payment.id,
        amount: amountTotal / 100,
        sessionId: session.id || null,
        eventId: event.id,
      } as const;
    });
  } catch (error) {
    // If two deliveries race, the receipt uniqueness constraint is the final
    // exactly-once gate. The transaction containing the losing Payment rolls back.
    if (uniqueConstraintError(error)) return { kind: "duplicate", tenantId, invoiceId };
    throw error;
  }
}
