import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const expense = await prisma.expense.create({
    data: {
      projectId: body.projectId || undefined,
      amount: Number(body.amount),
      category: body.category || "OTHER",
      description: body.description,
      date: body.date ? new Date(body.date) : new Date(),
    },
  });

  return NextResponse.json(expense, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  await prisma.expense.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
