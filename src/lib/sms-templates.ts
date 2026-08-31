export const SMS_TEMPLATE_IDS = [
  "ACKNOWLEDGEMENT",
  "MISSED_CALL",
  "REQUEST_DETAILS",
  "QUOTE_FOLLOW_UP",
  "BOOKING_CONFIRMATION",
] as const;

export type SmsTemplateId = (typeof SMS_TEMPLATE_IDS)[number];

export type SmsTemplate = {
  id: SmsTemplateId;
  label: string;
  message: string;
};

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || "there";
}

function shopName(name: string): string {
  return name.trim() || "our team";
}

/**
 * The first live customer is a mover, so these are moving-specific rather than generic
 * CRM filler. They stay in one shared module because the preview the dispatcher reads
 * and the body the server sends must be the same words.
 */
export function smsTemplates(input: { leadName: string; businessName: string }): SmsTemplate[] {
  const name = firstName(input.leadName);
  const business = shopName(input.businessName);
  const stop = " Reply STOP to opt out.";

  return [
    {
      id: "ACKNOWLEDGEMENT",
      label: "New lead · received",
      message: `Hi ${name}, thanks for contacting ${business}. We received your moving request and will follow up shortly.${stop}`,
    },
    {
      id: "MISSED_CALL",
      label: "Missed call",
      message: `Hi ${name}, this is ${business}. We just tried to reach you about your move. What time today works for a quick call?${stop}`,
    },
    {
      id: "REQUEST_DETAILS",
      label: "Ask for move details",
      message: `Hi ${name}, to price your move, please send the pickup and drop-off areas, move date, home size, and any large or special items. — ${business}.${stop}`,
    },
    {
      id: "QUOTE_FOLLOW_UP",
      label: "Quote follow-up",
      message: `Hi ${name}, checking in from ${business} about your moving quote. Would you like us to hold a date or answer any questions?${stop}`,
    },
    {
      id: "BOOKING_CONFIRMATION",
      label: "Booking confirmation",
      message: `Hi ${name}, your move with ${business} is booked. We will confirm the final timing and details before the move. Reply here if anything changes.${stop}`,
    },
  ];
}

export function smsTemplate(
  id: unknown,
  input: { leadName: string; businessName: string },
): SmsTemplate | null {
  if (typeof id !== "string") return null;
  return smsTemplates(input).find((template) => template.id === id) ?? null;
}
