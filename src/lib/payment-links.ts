import { createHmac, timingSafeEqual } from "node:crypto";

function signingSecret() {
  return process.env.PAYMENT_LINK_SIGNING_SECRET?.trim() || null;
}

export function paymentLinksConfigured() {
  return Boolean(signingSecret());
}

export function signPaymentLink(tenantId: string, invoiceId: string, secret = signingSecret()) {
  if (!secret) throw new Error("PAYMENT_LINK_SIGNING_SECRET is not configured");
  return createHmac("sha256", secret).update(`${tenantId}.${invoiceId}`).digest("base64url");
}

export function verifyPaymentLinkToken(input: {
  tenantId: string;
  invoiceId: string;
  token: string | null | undefined;
  secret?: string | null;
}) {
  const secret = input.secret ?? signingSecret();
  if (!secret || !input.token) return false;

  const expected = Buffer.from(signPaymentLink(input.tenantId, input.invoiceId, secret));
  const provided = Buffer.from(input.token);
  return expected.length === provided.length && timingSafeEqual(expected, provided);
}

export function buildPublicPaymentUrl(input: {
  origin: string;
  tenantId: string;
  invoiceId: string;
}) {
  if (!paymentLinksConfigured()) return null;
  const url = new URL(`/pay/${encodeURIComponent(input.invoiceId)}`, input.origin);
  url.searchParams.set("token", signPaymentLink(input.tenantId, input.invoiceId));
  return url.toString();
}
