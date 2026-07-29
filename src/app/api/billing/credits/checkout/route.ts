import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getCreditPack } from "@/lib/credit-packs";
import { prisma } from "@/lib/prisma";
import { consumeRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { getAppSessionUser } from "@/lib/session";

function text(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export async function POST(req: NextRequest) {
  const user = await getAppSessionUser();
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  let rateLimit;
  try {
    rateLimit = await consumeRateLimit({
      scope: "stripe-credit-checkout",
      identifier: user.tenantId,
      limit: 10,
      windowMs: 60 * 60 * 1000,
    });
  } catch (error) {
    console.error("Stripe checkout rate limiter failed", error);
    return NextResponse.json(
      { error: "Checkout protection is temporarily unavailable." },
      { status: 503 }
    );
  }
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many checkout sessions. Please try again later." },
      { status: 429, headers: rateLimitHeaders(rateLimit) }
    );
  }

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) {
    return NextResponse.json({ error: "Stripe checkout is not configured." }, { status: 503 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const packId = text(body.packId, 60);
  const pack = getCreditPack(packId);
  if (!pack) {
    return NextResponse.json({ error: "Unknown or unavailable credit pack." }, { status: 422 });
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: user.tenantId },
    select: { id: true, slug: true, businessName: true, ownerEmail: true },
  });
  if (!tenant) return NextResponse.json({ error: "Workspace not found." }, { status: 404 });

  const checkoutRequestId = randomUUID();
  const baseUrl = (process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXTAUTH_URL || "http://localhost:3000")
    .replace(/\/$/, "");
  const form = new URLSearchParams();
  form.set("mode", "payment");
  form.set("success_url", `${baseUrl}/network?credits=success&session_id={CHECKOUT_SESSION_ID}`);
  form.set("cancel_url", `${baseUrl}/network?credits=cancelled`);
  form.set("client_reference_id", tenant.id);
  form.set("line_items[0][price]", pack.priceId);
  form.set("line_items[0][quantity]", "1");
  form.set("metadata[tenantId]", tenant.id);
  form.set("metadata[tenantSlug]", tenant.slug);
  form.set("metadata[creditPackId]", pack.id);
  form.set("metadata[credits]", String(pack.credits));
  form.set("metadata[amountCents]", String(pack.amountCents));
  form.set("metadata[currency]", pack.currency);
  form.set("metadata[checkoutRequestId]", checkoutRequestId);
  form.set("payment_intent_data[metadata][tenantId]", tenant.id);
  form.set("payment_intent_data[metadata][creditPackId]", pack.id);
  form.set("payment_intent_data[metadata][credits]", String(pack.credits));
  form.set("payment_intent_data[metadata][amountCents]", String(pack.amountCents));
  form.set("payment_intent_data[metadata][currency]", pack.currency);
  form.set("payment_intent_data[metadata][checkoutRequestId]", checkoutRequestId);
  form.set("payment_intent_data[description]", `${pack.credits} HandymanPro network credits for ${tenant.businessName}`);

  const customerEmail = user.email || tenant.ownerEmail;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) {
    form.set("customer_email", customerEmail);
  }

  try {
    const stripeResponse = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${stripeSecretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "Idempotency-Key": `credit-checkout:${tenant.id}:${checkoutRequestId}`,
      },
      body: form.toString(),
      cache: "no-store",
    });
    const result = (await stripeResponse.json()) as {
      id?: string;
      url?: string;
      error?: { message?: string; type?: string };
    };

    if (!stripeResponse.ok || !result.id || !result.url) {
      console.error("Stripe checkout session creation failed", result.error || result);
      return NextResponse.json(
        { error: result.error?.message || "Unable to create Stripe checkout session." },
        { status: 502 }
      );
    }

    return NextResponse.json({
      checkoutSessionId: result.id,
      url: result.url,
      pack: {
        id: pack.id,
        label: pack.label,
        credits: pack.credits,
        amountCents: pack.amountCents,
        currency: pack.currency,
      },
    });
  } catch (error) {
    console.error("Stripe checkout request failed", error);
    return NextResponse.json({ error: "Stripe checkout is temporarily unavailable." }, { status: 502 });
  }
}
