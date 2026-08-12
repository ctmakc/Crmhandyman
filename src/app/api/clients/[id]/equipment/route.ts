import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sessionTenant } from "@/lib/session";
import { parseDayInput } from "@/lib/dates";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { tenantId } = sessionTenant(session);

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
      installedAt: parseDayInput(body.installedAt),
      warrantyUntil: parseDayInput(body.warrantyUntil),
      notes: body.notes || undefined,
    },
  });

  return NextResponse.json(equipment, { status: 201 });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { tenantId } = sessionTenant(session);

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
