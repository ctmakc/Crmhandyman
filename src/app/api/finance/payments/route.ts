import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const payment = await prisma.payment.create({
    data: {
      projectId: body.projectId,
      amount: Number(body.amount),
      method: body.method || "CASH",
      date: body.date ? new Date(body.date) : new Date(),
      notes: body.notes,
    },
  });

  return NextResponse.json(payment, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  await prisma.payment.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
