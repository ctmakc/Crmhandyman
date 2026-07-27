import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tenantId = (session.user as any).tenantId as string;

  const client = await prisma.client.findFirst({ where: { id: params.id, tenantId } });
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  const body = await req.json();
  const equipment = await prisma.equipment.create({
    data: {
      tenantId,
      clientId: client.id,
      projectId: body.projectId || undefined,
      kind: (body.kind || "FURNACE") as never,
      brand: body.brand || undefined,
      model: body.model || undefined,
      serial: body.serial || undefined,
      location: body.location || undefined,
      installedAt: body.installedAt ? new Date(body.installedAt) : undefined,
      warrantyUntil: body.warrantyUntil ? new Date(body.warrantyUntil) : undefined,
      notes: body.notes || undefined,
    },
  });

  return NextResponse.json(equipment, { status: 201 });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tenantId = (session.user as any).tenantId as string;

  const equipmentId = new URL(req.url).searchParams.get("equipmentId");
  if (!equipmentId)
    return NextResponse.json({ error: "equipmentId required" }, { status: 400 });

  const equipment = await prisma.equipment.findFirst({
    where: { id: equipmentId, tenantId, clientId: params.id },
  });
  if (!equipment) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.equipment.delete({ where: { id: equipment.id } });
  return NextResponse.json({ ok: true });
}
