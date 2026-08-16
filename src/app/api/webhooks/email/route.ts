import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { consumeRateLimit, rateLimitHeaders, requestIp } from "@/lib/rate-limit";
import { createInboundLead } from "@/lib/inbound-leads";
import { writeAuditEvent } from "@/lib/audit";

function verifyMailgunSignature(timestamp: string, token: string, signature: string, key: string): boolean {
  if (!/^\d+$/.test(timestamp) || !token || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  const sentAtMs = Number(timestamp) * 1000;
  if (!Number.isFinite(sentAtMs) || Math.abs(Date.now() - sentAtMs) > 15 * 60 * 1000) return false;

  const expected = createHmac("sha256", key).update(timestamp.concat(token)).digest();
  const provided = Buffer.from(signature, "hex");
  return expected.length === provided.length && timingSafeEqual(expected, provided);
}

function detectSource(from: string, subject: string) {
  const combined = `${from} ${subject}`.toLowerCase();
  if (combined.includes("homestars")) return "HOMESTARS" as const;
  if (combined.includes("kijiji")) return "KIJIJI" as const;
  if (combined.includes("google")) return "GOOGLE" as const;
  return "EMAIL" as const;
}

function extractEmailFromText(text: string): string | undefined {
  return text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/)?.[0]?.toLowerCase();
}

function extractPhoneFromText(text: string): string | undefined {
  return text.match(/(\+?1[-.\s]?)?(\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/)?.[0];
}

function configContainsRecipient(config: string | null, recipient: string) {
  if (!config || !recipient) return false;
  const needle = recipient.toLowerCase();
  try {
    const parsed = JSON.parse(config) as unknown;
    const values: string[] = [];
    const walk = (value: unknown) => {
      if (typeof value === "string") values.push(value);
      else if (Array.isArray(value)) value.forEach(walk);
      else if (value && typeof value === "object") Object.values(value as Record<string, unknown>).forEach(walk);
    };
    walk(parsed);
    return values.some((value) => value.toLowerCase().includes(needle) || needle.includes(value.toLowerCase()));
  } catch {
    return config.toLowerCase().includes(needle) || needle.includes(config.toLowerCase());
  }
}

export async function POST(req: NextRequest) {
  const key = process.env.MAILGUN_WEBHOOK_SIGNING_KEY;
  if (!key) return NextResponse.json({ error: "Mailgun webhook verification is not configured" }, { status: 503 });

  const formData = await req.formData();
  const timestamp = formData.get("timestamp")?.toString() || "";
  const token = formData.get("token")?.toString() || "";
  const signature = formData.get("signature")?.toString() || "";
  if (!verifyMailgunSignature(timestamp, token, signature, key)) {
    return NextResponse.json({ error: "Invalid or stale signature" }, { status: 401 });
  }

  let limit;
  try {
    limit = await consumeRateLimit({
      scope: "webhook:mailgun",
      identifier: requestIp(req),
      limit: 120,
      windowMs: 60_000,
    });
  } catch (error) {
    console.error("MAILGUN_RATE_LIMIT_FAILED", error);
    return NextResponse.json({ error: "Ingress controls unavailable" }, { status: 503 });
  }
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: rateLimitHeaders(limit) });
  }

  const from = formData.get("From")?.toString() || formData.get("sender")?.toString() || "";
  const subject = formData.get("Subject")?.toString() || formData.get("subject")?.toString() || "";
  const bodyText = formData.get("body-plain")?.toString() || formData.get("stripped-text")?.toString() || "";
  const recipient =
    formData.get("recipient")?.toString() ||
    formData.get("To")?.toString() ||
    formData.get("to")?.toString() ||
    "";

  const integrations = await prisma.channelIntegration.findMany({
    where: { channel: "EMAIL", isActive: true },
    select: { tenantId: true, config: true },
  });
  const matches = integrations.filter((integration) => configContainsRecipient(integration.config, recipient));
  if (matches.length !== 1) {
    console.error("MAILGUN_TENANT_ROUTE_AMBIGUOUS", { recipient, matches: matches.length });
    return NextResponse.json({ ok: true }, { headers: rateLimitHeaders(limit) });
  }

  const nameMatch = from.match(/^(.+?)\s*<.+>$/) || from.match(/^(.+?)@/);
  const name = nameMatch?.[1]?.trim().slice(0, 160) || "Email Lead";
  const email = extractEmailFromText(from);
  const phone = extractPhoneFromText(bodyText);
  const source = detectSource(from, subject);
  const messageId =
    formData.get("Message-Id")?.toString() ||
    formData.get("message-id")?.toString() ||
    formData.get("Message-ID")?.toString() ||
    token;

  const result = await createInboundLead({
    tenantId: matches[0].tenantId,
    channel: `MAILGUN_${source}`,
    externalId: messageId,
    name,
    email,
    phone,
    source,
    notes: `Subject: ${subject.slice(0, 300)}\n\n${bodyText.slice(0, 3500)}`,
  });

  if (!result.duplicate) {
    await writeAuditEvent({
      tenantId: matches[0].tenantId,
      actorEmail: "mailgun-webhook",
      action: "lead.created.external",
      entityType: "lead",
      entityId: result.lead.id,
      summary: `${source} email lead received`,
      metadata: { messageId, recipient },
    });
  }

  return NextResponse.json({ ok: true }, { headers: rateLimitHeaders(limit) });
}
