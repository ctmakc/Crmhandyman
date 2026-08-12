import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyFbWebhookSignature } from "@/lib/integrations/facebook";

// Instagram webhook verification (same Meta platform)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.META_WEBHOOK_VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 });
  }
  return NextResponse.json({ error: "Verification failed" }, { status: 403 });
}

// Instagram message webhook
export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  // Instagram rides the same Meta app as the Facebook hook, and was the one of the two
  // that never checked the signature — anyone could post invented enquiries into it.
  if (process.env.META_APP_SECRET) {
    const valid = verifyFbWebhookSignature(
      rawBody,
      req.headers.get("x-hub-signature-256") || "",
      process.env.META_APP_SECRET
    );
    if (!valid) return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
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
    // The entry id is the Instagram business account the message reached — the same
    // value the settings form stores as `pageId`. Without it there is no way to know
    // whose workspace this belongs in, so the message is left alone.
    const accountId = entry.id;
    if (!accountId) continue;

    for (const event of entry.messaging || []) {
      if (!event.message?.text) continue;

      const text = event.message.text.toLowerCase();
      const senderId = event.sender?.id;
      if (!senderId) continue;

      // Simple keyword detection for service interest
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

      // Resolve tenant by the account that received the message, never «the first
      // active one» — that put one shop's enquiries into another shop's inbox.
      const integration = await prisma.channelIntegration.findFirst({
        where: { channel: "INSTAGRAM", isActive: true, pageId: accountId },
      });
      if (!integration) continue;

      // Check for duplicate
      const existing = await prisma.lead.findFirst({
        where: { sourceLeadId: `ig_${senderId}`, tenantId: integration.tenantId },
      });
      if (existing) continue;

      await prisma.lead.create({
        data: {
          tenantId: integration.tenantId,
          name: `Instagram User ${senderId.slice(-6)}`,
          source: "INSTAGRAM",
          sourceLeadId: `ig_${senderId}`,
          notes: `Instagram message: "${event.message.text}"`,
          status: "NEW",
        },
      });
    }
  }

  return NextResponse.json({ ok: true });
}
