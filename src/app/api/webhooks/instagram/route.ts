import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyFbWebhookSignature } from "@/lib/integrations/facebook";
import { notifyNewLead } from "@/lib/notify";
import { startLeadAutomation } from "@/lib/lead-automation";
import { defangStamps } from "@/lib/lead-notes";
import { readTextCapped } from "@/lib/request-body";
import { throttle, throttleVerify, tokenMatches } from "../guard";

/** A messaging delivery is a few kilobytes of JSON; this is orders of magnitude over it. */
const MAX_BODY_BYTES = 256 * 1024;

export async function GET(req: NextRequest) {
  const limited = await throttleVerify(req, "instagram");
  if (limited) return limited;

  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && tokenMatches(searchParams.get("hub.verify_token"), process.env.META_WEBHOOK_VERIFY_TOKEN)) {
    return new NextResponse(challenge, { status: 200 });
  }
  return NextResponse.json({ error: "Verification failed" }, { status: 403 });
}

export async function POST(req: NextRequest) {
  const limited = await throttle(req, "instagram");
  if (limited) return limited;

  const secret = process.env.META_APP_SECRET;
  if (!secret) {
    console.warn("[webhook] META_APP_SECRET is unset — Instagram delivery refused");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const rawBody = await readTextCapped(req, MAX_BODY_BYTES);
  if (rawBody === null) return NextResponse.json({ error: "Body too large" }, { status: 413 });

  if (!verifyFbWebhookSignature(rawBody, req.headers.get("x-hub-signature-256") || "", secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
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
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  for (const entry of body.entry || []) {
    const accountId = entry.id;
    if (!accountId) continue;

    for (const event of entry.messaging || []) {
      if (!event.message?.text) continue;

      const text = event.message.text.toLowerCase();
      const senderId = event.sender?.id;
      if (!senderId) continue;

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

      const integration = await prisma.channelIntegration.findFirst({
        where: { channel: "INSTAGRAM", isActive: true, pageId: accountId },
      });
      if (!integration) continue;

      const existing = await prisma.lead.findFirst({
        where: { sourceLeadId: `ig_${senderId}`, tenantId: integration.tenantId },
      });
      if (existing) continue;

      const created = await prisma.lead.create({
        data: {
          tenantId: integration.tenantId,
          name: `Instagram User ${senderId.slice(-6)}`,
          source: "INSTAGRAM",
          sourceLeadId: `ig_${senderId}`,
          notes: defangStamps(`Instagram message: "${event.message.text}"`),
          status: "NEW",
        },
      });

      await notifyNewLead(integration.tenantId, created.id);
      // Usually no phone exists on an IG DM, so the automation engine safely no-ops;
      // if Meta begins supplying one later, the same lead path is already ready for it.
      void startLeadAutomation(integration.tenantId, created.id);
    }
  }

  return NextResponse.json({ ok: true });
}
