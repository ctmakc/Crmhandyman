import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { notifyNewLead } from "@/lib/notify";
import { startLeadAutomation } from "@/lib/lead-automation";
import { defangStamps } from "@/lib/lead-notes";
import { parseInboundLeadEmail } from "@/lib/marketplace-email";
import crypto from "crypto";
import { declaredTooLarge } from "@/lib/request-body";
import { throttle } from "../guard";

function verifyMailgunSignature(timestamp: string, token: string, signature: string): boolean {
  const key = process.env.MAILGUN_WEBHOOK_SIGNING_KEY;
  if (!key) return false;

  const hmac = crypto.createHmac("sha256", key);
  hmac.update(timestamp.concat(token));
  const digest = Buffer.from(hmac.digest("hex"));
  const given = Buffer.from(signature || "");

  return digest.length === given.length && crypto.timingSafeEqual(digest, given);
}

function configuredAddress(config: string | null): string | null {
  if (!config) return null;
  let value: unknown = config;
  try {
    value = JSON.parse(config);
  } catch {
    /* stored as a bare string */
  }
  if (typeof value === "string") return value.trim().toLowerCase() || null;
  if (value && typeof value === "object") {
    const address = (value as { address?: string; email?: string }).address ??
      (value as { email?: string }).email;
    return address ? address.trim().toLowerCase() : null;
  }
  return null;
}

function extractEmailFromText(text: string): string | undefined {
  const match = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  return match?.[0];
}

function messageId(formData: FormData): string | undefined {
  for (const key of ["Message-Id", "Message-ID", "message-id", "messageId"]) {
    const value = formData.get(key)?.toString().trim();
    if (value) return value;
  }
  return undefined;
}

const MAX_BODY_BYTES = 30 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const limited = await throttle(req, "email");
  if (limited) return limited;

  if (declaredTooLarge(req, MAX_BODY_BYTES)) {
    return NextResponse.json({ error: "Body too large" }, { status: 413 });
  }

  const formData = await req.formData();

  const timestamp = formData.get("timestamp")?.toString() || "";
  const token = formData.get("token")?.toString() || "";
  const signature = formData.get("signature")?.toString() || "";

  if (!verifyMailgunSignature(timestamp, token, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const from = formData.get("From")?.toString() || formData.get("sender")?.toString() || "";
  const subject = formData.get("Subject")?.toString() || formData.get("subject")?.toString() || "";
  const bodyText =
    formData.get("body-plain")?.toString() || formData.get("stripped-text")?.toString() || "";

  const recipient = (
    formData.get("recipient")?.toString() ||
    formData.get("To")?.toString() ||
    ""
  ).toLowerCase();
  const recipientAddress = extractEmailFromText(recipient)?.toLowerCase();

  const candidates = await prisma.channelIntegration.findMany({
    where: { channel: "EMAIL", isActive: true },
  });
  const emailIntegration = recipientAddress
    ? candidates.find((c) => configuredAddress(c.config) === recipientAddress)
    : undefined;

  if (!emailIntegration) {
    console.warn(`Inbound lead for an unconfigured address: ${recipientAddress ?? "unknown"}`);
    return NextResponse.json({ ok: true, routed: false });
  }

  const tenantId = emailIntegration.tenantId;
  const parsed = parseInboundLeadEmail({
    from,
    subject,
    body: bodyText,
    messageId: messageId(formData),
  });

  // Provider notifications are commonly retried by the mail platform. Contact-address
  // dedup was the wrong primitive here: it collapsed a customer's second legitimate move
  // into their first one. RFC Message-ID (or a stable notification hash when it is absent)
  // identifies the notification rather than the person.
  const replay = await prisma.lead.findFirst({
    where: { tenantId, sourceLeadId: parsed.sourceLeadId },
    select: { id: true },
  });
  if (replay) return NextResponse.json({ ok: true, deduped: true });

  const providerFacts = [
    `Inbound email source: ${parsed.source}`,
    `Subject: ${subject}`,
    `Sender: ${from}`,
    parsed.providerLeadId ? `Provider lead ID: ${parsed.providerLeadId}` : null,
  ].filter(Boolean);
  const raw = bodyText.trim().slice(0, 2_000);
  const notes = defangStamps(
    `${providerFacts.join("\n")}${raw ? `\n\nRaw notification:\n${raw}` : ""}`
  );

  const created = await prisma.lead.create({
    data: {
      tenantId,
      name: parsed.name,
      email: parsed.email,
      phone: parsed.phone,
      address: parsed.address,
      city: parsed.city,
      source: parsed.source,
      sourceLeadId: parsed.sourceLeadId,
      jobType: parsed.jobType,
      notes,
      status: "NEW",
    },
  });

  await notifyNewLead(tenantId, created.id);
  void startLeadAutomation(tenantId, created.id);

  return NextResponse.json({ ok: true, leadId: created.id, source: parsed.source });
}
