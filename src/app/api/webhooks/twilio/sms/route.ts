import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { record } from "@/lib/audit";
import { notifyNewLead } from "@/lib/notify";
import { defangStamps } from "@/lib/lead-notes";
import { readTextCapped } from "@/lib/request-body";
import {
  normalizeSmsPhone,
  smsConsentCommand,
  twilioConfig,
  verifyTwilioSignature,
} from "@/lib/sms";
import { throttle } from "../../guard";

const MAX_BODY_BYTES = 64 * 1024;

function firstForwarded(value: string | null): string | null {
  return value?.split(",")[0]?.trim() || null;
}

/**
 * Twilio signs the public URL configured on the phone number. Behind Caddy, Next may see
 * the internal socket URL, so reconstruct the public origin from the proxy headers. A
 * forged host still cannot forge the HMAC; this only makes the legitimate signature and
 * the request agree about the URL they are signing.
 */
function publicRequestUrl(req: NextRequest): string {
  const internal = new URL(req.url);
  const proto = firstForwarded(req.headers.get("x-forwarded-proto")) || internal.protocol.replace(":", "");
  const host = firstForwarded(req.headers.get("x-forwarded-host")) || req.headers.get("host") || internal.host;
  return `${proto}://${host}${internal.pathname}${internal.search}`;
}

function twiml() {
  return new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
    status: 200,
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
}

export async function POST(req: NextRequest) {
  const limited = await throttle(req, "twilio-sms");
  if (limited) return limited;

  const raw = await readTextCapped(req, MAX_BODY_BYTES);
  if (raw === null) return NextResponse.json({ error: "Body too large" }, { status: 413 });

  const params = new URLSearchParams(raw);
  const to = normalizeSmsPhone(params.get("To"));
  const from = normalizeSmsPhone(params.get("From"));
  const message = (params.get("Body") || "").trim();
  const providerMessageId = params.get("MessageSid") || params.get("SmsMessageSid") || "";

  if (!to || !from) return NextResponse.json({ error: "Missing SMS addresses" }, { status: 400 });

  // The receiving number is globally unique in ChannelIntegration.normalizedAddress, so
  // this lookup resolves one workspace without trusting anything the sender typed in Body.
  const integration = await prisma.channelIntegration.findFirst({
    where: { channel: "SMS", normalizedAddress: to, isActive: true },
  });
  const config = twilioConfig(integration);
  if (!integration || !config) return NextResponse.json({ error: "Unknown SMS destination" }, { status: 404 });

  const signature = req.headers.get("x-twilio-signature");
  if (!verifyTwilioSignature(publicRequestUrl(req), params, signature, config.authToken)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  // Twilio retries deliveries. The provider id is already written into the append-only
  // meta JSON; a retry returns empty TwiML rather than creating a second message/lead.
  if (providerMessageId) {
    const duplicate = await prisma.auditLog.findFirst({
      where: { tenantId: integration.tenantId, meta: { contains: providerMessageId } },
      select: { id: true },
    });
    if (duplicate) return twiml();
  }

  const candidates = await prisma.lead.findMany({
    where: { tenantId: integration.tenantId, phone: { not: null } },
    select: { id: true, name: true, phone: true, status: true },
    orderBy: { createdAt: "desc" },
    take: 1000,
  });
  let lead = candidates.find((candidate) => normalizeSmsPhone(candidate.phone) === from) ?? null;

  const optOutType = (params.get("OptOutType") || "").trim().toUpperCase();
  const consent =
    optOutType === "STOP" || optOutType === "START"
      ? (optOutType as "STOP" | "START")
      : smsConsentCommand(message);

  // A random inbound number becomes a lead so a paid-for business number never has a
  // customer conversation that exists only in Twilio. Pure STOP/START from an unknown
  // sender is not promoted to the sales desk; Twilio itself keeps that number suppressed.
  if (!lead && !consent) {
    const created = await prisma.lead.create({
      data: {
        tenantId: integration.tenantId,
        name: `SMS ${from}`,
        phone: from,
        source: "MANUAL",
        jobType: "Inbound SMS",
        notes: defangStamps(`Inbound SMS\nMessage: ${message || "(no text)"}`),
        status: "NEW",
      },
      select: { id: true, name: true, phone: true, status: true },
    });
    lead = created;
    await notifyNewLead(integration.tenantId, created.id);
  }

  if (!lead) {
    await record({
      tenantId: integration.tenantId,
      actor: { id: "system:twilio", name: "Twilio" },
      action: consent === "STOP" ? "sms.unmatched_opt_out" : "sms.unmatched_opt_in",
      entity: "ChannelIntegration",
      entityId: integration.id,
      summary: `${from} sent ${consent || "an SMS command"}`,
      meta: {
        direction: "INBOUND",
        provider: "TWILIO",
        providerMessageId: providerMessageId || null,
        from,
        to,
        message,
        consent,
      },
    });
    return twiml();
  }

  const action =
    consent === "STOP"
      ? "lead.activity.sms_opt_out"
      : consent === "START"
        ? "lead.activity.sms_opt_in"
        : "lead.activity.sms_received";
  const summary =
    consent === "STOP"
      ? `${lead.name} opted out of SMS`
      : consent === "START"
        ? `${lead.name} opted back in to SMS`
        : `SMS received from ${lead.name}`;

  if (!consent && lead.status === "NEW") {
    await prisma.lead.updateMany({
      where: { id: lead.id, tenantId: integration.tenantId, status: "NEW" },
      data: { status: "CONTACTED" },
    });
  }

  await record({
    tenantId: integration.tenantId,
    actor: { id: "system:twilio", name: "Twilio" },
    action,
    entity: "Lead",
    entityId: lead.id,
    summary,
    meta: {
      direction: "INBOUND",
      provider: "TWILIO",
      providerMessageId: providerMessageId || null,
      from,
      to,
      message,
      consent,
    },
  });

  return twiml();
}
