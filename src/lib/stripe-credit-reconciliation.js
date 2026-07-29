export function validateStripeCreditSession(session, pack) {
  if (!session || !pack) return { valid: false, reason: "MISSING_SESSION_OR_PACK" };

  const tenantId = String(session.metadata?.tenantId || "").trim();
  const packId = String(session.metadata?.creditPackId || "").trim();
  const checkoutRequestId = String(session.metadata?.checkoutRequestId || "").trim();
  const metadataCurrency = String(session.metadata?.currency || "").trim().toUpperCase();
  const actualCurrency = String(session.currency || "").trim().toUpperCase();
  const metadataCredits = Number(session.metadata?.credits);
  const metadataAmountCents = Number(session.metadata?.amountCents);

  if (!tenantId) return { valid: false, reason: "MISSING_TENANT" };
  if (!checkoutRequestId) return { valid: false, reason: "MISSING_CHECKOUT_REQUEST" };
  if (session.client_reference_id !== tenantId) {
    return { valid: false, reason: "TENANT_REFERENCE_MISMATCH" };
  }
  if (packId !== pack.id) return { valid: false, reason: "PACK_MISMATCH" };
  if (!Number.isInteger(metadataCredits) || metadataCredits !== pack.credits) {
    return { valid: false, reason: "CREDIT_COUNT_MISMATCH" };
  }
  if (!Number.isInteger(metadataAmountCents) || metadataAmountCents !== pack.amountCents) {
    return { valid: false, reason: "METADATA_AMOUNT_MISMATCH" };
  }
  if (!Number.isInteger(session.amount_total) || session.amount_total !== pack.amountCents) {
    return { valid: false, reason: "PAID_AMOUNT_MISMATCH" };
  }
  if (metadataCurrency !== pack.currency) {
    return { valid: false, reason: "METADATA_CURRENCY_MISMATCH" };
  }
  if (actualCurrency !== pack.currency) {
    return { valid: false, reason: "PAID_CURRENCY_MISMATCH" };
  }

  return {
    valid: true,
    tenantId,
    checkoutRequestId,
  };
}
