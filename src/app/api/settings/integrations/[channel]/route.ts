import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(_: NextRequest, { params }: { params: { channel: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tenantId = (session.user as any).tenantId as string;

  const channel = params.channel.toUpperCase();
  const integration = await prisma.channelIntegration.findUnique({
    where: { tenantId_channel: { tenantId, channel } },
  });

  return NextResponse.json(integration || { channel, isActive: false });
}

export async function PUT(req: NextRequest, { params }: { params: { channel: string } }) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user as { role?: string })?.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tenantId = (session.user as any).tenantId as string;

  const body = await req.json();
  const channel = params.channel.toUpperCase();

  const integration = await prisma.channelIntegration.upsert({
    where: { tenantId_channel: { tenantId, channel } },
    update: {
      accessToken: body.accessToken,
      pageId: body.pageId,
      webhookSecret: body.webhookSecret,
      config: body.config ? JSON.stringify(body.config) : undefined,
      isActive: body.isActive ?? true,
    },
    create: {
      tenantId,
      channel,
      accessToken: body.accessToken,
      pageId: body.pageId,
      webhookSecret: body.webhookSecret,
      config: body.config ? JSON.stringify(body.config) : undefined,
      isActive: body.isActive ?? true,
    },
  });

  return NextResponse.json(integration);
}
