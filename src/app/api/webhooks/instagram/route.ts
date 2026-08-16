import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyFbWebhookSignature } from "@/lib/integrations/facebook";
import { consumeRateLimit, rateLimitHeaders, requestIp } from "@/lib/rate-limit";
import { createInboundLead } from "@/lib/inbound-leads";
import { writeAuditEvent } from "@/lib/audit";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");
  const verifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN;

  if (verifyToken && mode === "subscribe" && token === verifyToken) {
    return new NextResponse(challenge, { status: 200 });
  }
  return NextResponse.json({ error: "Verification failed" }, { status: 403 });
}

export async function POST(req: NextRequest) {
  const secret = process.env.META_APP_SECRET;
  if (!secret) return NextResponse.json({ error: "Meta webhook verification is not configured" }, { status: 503 });

  const rawBody = await req.text();
  const signature = req.headers.get("x-hub-signature-256") || "";
  if (!verifyFbWebhookSignature(rawBody, signature, secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let limit;
  try {
    limit = await consumeRateLimit({
      scope: "webhook:instagram",
      identifier: requestIp(req),
      limit: 300,
      windowMs: 60_000,
    });
  } catch (error) {
    console.error("INSTAGRAM_RATE_LIMIT_FAILED", error);
    return NextResponse.json({ error: "Ingress controls unavailable" }, { status: 503 });
  }
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: rateLimitHeaders(limit) });
  }

  let body: {
    entry?: Array<{
      id?: string;
      messaging?: Array<{
        sender?: { id?: string };
        message?: { text?: string };
        timestamp?: number;
      }>;
    }>;
  };
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400, headers: rateLimitHeaders(limit) });
  }

  for (const entry of body.entry || []) {
    if (!entry.id) continue;
    const integration = await prisma.channelIntegration.findFirst({
      where: { channel: "INSTAGRAM", pageId: entry.id, isActive: true },
    });
    if (!integration) continue;

    for (const event of entry.messaging || []) {
      const originalText = event.message?.text?.trim();
      const senderId = event.sender?.id;
      if (!originalText || !senderId) continue;

      const text = originalText.toLowerCase();
      const isServiceInquiry =
        text.includes("repair") ||
        text.includes("fix") ||
        text.includes("install") ||
        text.includes("paint") ||
        text.includes("drywall") ||
        text.includes("handyman") ||
        text.includes("quote") ||
        text.includes("estimate") ||
        text.includes("help") ||
        text.includes("service");
      if (!isServiceInquiry) continue;

      const externalId = `ig_${senderId}`;
      const result = await createInboundLead({
        tenantId: integration.tenantId,
        channel: "INSTAGRAM",
        externalId,
        name: `Instagram User ${senderId.slice(-6)}`,
        source: "INSTAGRAM",
        notes: `Instagram message: "${originalText.slice(0, 1500)}"`,
      });

      if (!result.duplicate) {
        await writeAuditEvent({
          tenantId: integration.tenantId,
          actorEmail: "instagram-webhook",
          action: "lead.created.external",
          entityType: "lead",
          entityId: result.lead.id,
          summary: "Instagram service inquiry received",
          metadata: { instagramAccountId: entry.id, senderId },
        });
      }
    }
  }

  return NextResponse.json({ ok: true }, { headers: rateLimitHeaders(limit) });
}
