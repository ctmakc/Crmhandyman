import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPaymentLinkToken } from "@/lib/payment-links";
import { createStripeCheckout, StripePaymentError } from "@/lib/stripe-payments";
import { writeAuditEvent } from "@/lib/audit";

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const invoiceId = String(form.get("invoiceId") || "").trim();
  const token = String(form.get("token") || "").trim();
  if (!invoiceId || !token) return NextResponse.json({ error: "Missing invoice payment link" }, { status: 400 });

  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: { id: true, tenantId: true, number: true },
  });
  if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  if (!verifyPaymentLinkToken({ tenantId: invoice.tenantId, invoiceId: invoice.id, token })) {
    return NextResponse.json({ error: "Invalid or expired payment link" }, { status: 403 });
  }

  const paymentPage = new URL(`/pay/${encodeURIComponent(invoice.id)}`, req.nextUrl.origin);
  paymentPage.searchParams.set("token", token);
  const successUrl = new URL(paymentPage);
  successUrl.searchParams.set("paid", "1");

  try {
    const checkout = await createStripeCheckout({
      tenantId: invoice.tenantId,
      invoiceId: invoice.id,
      successUrl: successUrl.toString(),
      cancelUrl: paymentPage.toString(),
    });
    await writeAuditEvent({
      tenantId: invoice.tenantId,
      action: "invoice.stripe_checkout_created",
      entityType: "invoice",
      entityId: invoice.id,
      summary: `Stripe Checkout created for ${invoice.number}`,
      metadata: { sessionId: checkout.id, owingCents: checkout.owingCents, expiresAt: checkout.expiresAt },
    });
    return NextResponse.redirect(checkout.url, 303);
  } catch (error) {
    if (error instanceof StripePaymentError) {
      const url = new URL(paymentPage);
      url.searchParams.set("error", error.message);
      return NextResponse.redirect(url, 303);
    }
    throw error;
  }
}
