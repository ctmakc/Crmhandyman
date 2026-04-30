import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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
  let body: {
    entry?: Array<{
      messaging?: Array<{
        sender?: { id?: string };
        message?: { text?: string };
        timestamp?: number;
      }>;
    }>;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  for (const entry of body.entry || []) {
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

      // Resolve tenant from Instagram integration
      const integration = await prisma.channelIntegration.findFirst({
        where: { channel: "INSTAGRAM", isActive: true },
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
