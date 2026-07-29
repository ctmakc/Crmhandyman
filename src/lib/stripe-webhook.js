import { createHmac, timingSafeEqual } from "node:crypto";

export function parseStripeSignatureHeader(header) {
  const values = new Map();
  for (const part of String(header || "").split(",")) {
    const separator = part.indexOf("=");
    if (separator <= 0) continue;
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (!key || !value) continue;
    const existing = values.get(key) || [];
    existing.push(value);
    values.set(key, existing);
  }
  return {
    timestamp: Number(values.get("t")?.[0]),
    signatures: values.get("v1") || [],
  };
}

export function createStripeTestSignature(payload, secret, timestamp = Math.floor(Date.now() / 1000)) {
  const signature = createHmac("sha256", secret)
    .update(`${timestamp}.${payload}`, "utf8")
    .digest("hex");
  return `t=${timestamp},v1=${signature}`;
}

export function verifyStripeWebhookSignature({
  payload,
  header,
  secret,
  toleranceSeconds = 300,
  nowSeconds = Math.floor(Date.now() / 1000),
}) {
  if (typeof payload !== "string" || !payload.length) {
    return { valid: false, reason: "EMPTY_PAYLOAD" };
  }
  if (typeof secret !== "string" || !secret.length) {
    return { valid: false, reason: "MISSING_SECRET" };
  }

  const parsed = parseStripeSignatureHeader(header);
  if (!Number.isFinite(parsed.timestamp) || parsed.signatures.length === 0) {
    return { valid: false, reason: "MALFORMED_HEADER" };
  }

  if (Math.abs(nowSeconds - parsed.timestamp) > toleranceSeconds) {
    return { valid: false, reason: "TIMESTAMP_OUTSIDE_TOLERANCE" };
  }

  const expected = Buffer.from(
    createHmac("sha256", secret)
      .update(`${parsed.timestamp}.${payload}`, "utf8")
      .digest("hex"),
    "utf8"
  );

  const valid = parsed.signatures.some((signature) => {
    const provided = Buffer.from(signature, "utf8");
    return provided.length === expected.length && timingSafeEqual(provided, expected);
  });

  return valid
    ? { valid: true, timestamp: parsed.timestamp }
    : { valid: false, reason: "SIGNATURE_MISMATCH" };
}
