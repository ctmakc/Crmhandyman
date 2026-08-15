import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { writeAuditEvent } from "@/lib/audit";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isNotAdmin(session: any) {
  return session?.user?.role !== "ADMIN";
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || isNotAdmin(session)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tenantId = (session.user as any).tenantId as string;

  const users = await prisma.user.findMany({
    where: { tenantId },
    select: { id: true, name: true, email: true, role: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(users);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || isNotAdmin(session)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tenantId = (session.user as any).tenantId as string;

  const body = await req.json();
  const name = String(body.name ?? "").trim();
  const email = String(body.email ?? "").trim().toLowerCase();
  const rawPassword = String(body.password ?? "");
  const role = String(body.role ?? "WORKER").toUpperCase();
  if (!name || !email.includes("@") || rawPassword.length < 10 || !["ADMIN", "WORKER"].includes(role)) {
    return NextResponse.json({ error: "Valid name/email, role and 10+ character password required" }, { status: 400 });
  }

  const existing = await prisma.user.findFirst({ where: { tenantId, email }, select: { id: true } });
  if (existing) return NextResponse.json({ error: "A user with that email already exists" }, { status: 409 });

  const password = await bcrypt.hash(rawPassword, 12);
  const user = await prisma.user.create({
    data: {
      tenantId,
      name: name.slice(0, 160),
      email,
      password,
      role: role as "ADMIN" | "WORKER",
    },
    select: { id: true, name: true, email: true, role: true, createdAt: true },
  });

  await writeAuditEvent({
    tenantId,
    actorEmail: session.user?.email,
    action: "user.created",
    entityType: "user",
    entityId: user.id,
    summary: `Team member created: ${user.email}`,
    metadata: { role: user.role },
  });
  return NextResponse.json(user, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || isNotAdmin(session)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const actor = session.user as any;
  const tenantId = actor.tenantId as string;
  const actorId = actor.id as string;

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  if (id === actorId) return NextResponse.json({ error: "You cannot delete your own signed-in account" }, { status: 400 });

  const existing = await prisma.user.findFirst({ where: { id, tenantId }, select: { id: true, email: true, role: true } });
  if (!existing) return NextResponse.json({ error: "User not found" }, { status: 404 });

  if (existing.role === "ADMIN") {
    const adminCount = await prisma.user.count({ where: { tenantId, role: "ADMIN" } });
    if (adminCount <= 1) return NextResponse.json({ error: "A tenant must keep at least one admin" }, { status: 409 });
  }

  try {
    await prisma.user.delete({ where: { id: existing.id } });
  } catch (error) {
    console.error("USER_DELETE_FAILED", error);
    return NextResponse.json({ error: "User still owns assigned work; reassign it before deletion" }, { status: 409 });
  }

  await writeAuditEvent({
    tenantId,
    actorEmail: session.user?.email,
    action: "user.deleted",
    entityType: "user",
    entityId: existing.id,
    summary: `Team member deleted: ${existing.email}`,
    metadata: { role: existing.role },
  });
  return NextResponse.json({ ok: true });
}
