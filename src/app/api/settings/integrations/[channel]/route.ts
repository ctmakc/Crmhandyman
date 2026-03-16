import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(_: NextRequest, { params }: { params: { channel: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const integration = await prisma.channelIntegration.findUnique({
    where: { channel: params.channel.toUpperCase() },
  });

  return NextResponse.json(integration || { channel: params.channel.toUpperCase(), isActive: false });
}

export async function PUT(req: NextRequest, { params }: { params: { channel: string } }) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user as { role?: string })?.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const integration = await prisma.channelIntegration.upsert({
    where: { channel: params.channel.toUpperCase() },
    update: {
      accessToken: body.accessToken,
      pageId: body.pageId,
      webhookSecret: body.webhookSecret,
      config: body.config ? JSON.stringify(body.config) : undefined,
      isActive: body.isActive ?? true,
    },
    create: {
      channel: params.channel.toUpperCase(),
      accessToken: body.accessToken,
      pageId: body.pageId,
      webhookSecret: body.webhookSecret,
      config: body.config ? JSON.stringify(body.config) : undefined,
      isActive: body.isActive ?? true,
    },
  });

  return NextResponse.json(integration);
}
