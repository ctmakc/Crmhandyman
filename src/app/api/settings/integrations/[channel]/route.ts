import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { writeAuditEvent } from "@/lib/audit";

const CHANNELS = new Set(["FACEBOOK", "INSTAGRAM", "GOOGLE", "EMAIL"]);

function isAdmin(session: unknown) {
  return (session as { user?: { role?: string } } | null)?.user?.role === "ADMIN";
}

export async function GET(_: NextRequest, props: { params: Promise<{ channel: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  if (!session || !isAdmin(session)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tenantId = (session.user as any).tenantId as string;
  const channel = params.channel.toUpperCase();
  if (!CHANNELS.has(channel)) return NextResponse.json({ error: "Unsupported channel" }, { status: 404 });

  const integration = await prisma.channelIntegration.findUnique({
    where: { tenantId_channel: { tenantId, channel } },
  });

  if (!integration) return NextResponse.json({ channel, isActive: false, hasAccessToken: false, hasWebhookSecret: false });
  return NextResponse.json({
    channel,
    pageId: integration.pageId,
    config: integration.config,
    isActive: integration.isActive,
    lastSyncAt: integration.lastSyncAt,
    hasAccessToken: Boolean(integration.accessToken),
    hasWebhookSecret: Boolean(integration.webhookSecret),
  });
}

export async function PUT(req: NextRequest, props: { params: Promise<{ channel: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  if (!session || !isAdmin(session)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tenantId = (session.user as any).tenantId as string;
  const body = await req.json();
  const channel = params.channel.toUpperCase();
  if (!CHANNELS.has(channel)) return NextResponse.json({ error: "Unsupported channel" }, { status: 404 });

  const integration = await prisma.channelIntegration.upsert({
    where: { tenantId_channel: { tenantId, channel } },
    update: {
      accessToken: body.accessToken === undefined ? undefined : String(body.accessToken).trim() || null,
      pageId: body.pageId === undefined ? undefined : String(body.pageId).trim() || null,
      webhookSecret: body.webhookSecret === undefined ? undefined : String(body.webhookSecret).trim() || null,
      config: body.config === undefined ? undefined : JSON.stringify(body.config),
      isActive: body.isActive === undefined ? undefined : Boolean(body.isActive),
    },
    create: {
      tenantId,
      channel,
      accessToken: body.accessToken ? String(body.accessToken).trim() : null,
      pageId: body.pageId ? String(body.pageId).trim() : null,
      webhookSecret: body.webhookSecret ? String(body.webhookSecret).trim() : null,
      config: body.config === undefined ? null : JSON.stringify(body.config),
      isActive: body.isActive === undefined ? true : Boolean(body.isActive),
    },
  });

  await writeAuditEvent({
    tenantId,
    actorEmail: session.user?.email,
    action: "integration.updated",
    entityType: "integration",
    entityId: integration.id,
    summary: `${channel} integration updated`,
    metadata: { channel, isActive: integration.isActive, pageId: integration.pageId },
  });

  return NextResponse.json({
    channel,
    pageId: integration.pageId,
    config: integration.config,
    isActive: integration.isActive,
    lastSyncAt: integration.lastSyncAt,
    hasAccessToken: Boolean(integration.accessToken),
    hasWebhookSecret: Boolean(integration.webhookSecret),
  });
}
