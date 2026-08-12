import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { record, actorFromSession } from "@/lib/audit";
import { isAdmin, sessionTenant } from "@/lib/session";

const isNotAdmin = (session: Parameters<typeof isAdmin>[0]) => !isAdmin(session);

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || isNotAdmin(session)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { tenantId } = sessionTenant(session);

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
  const { tenantId } = sessionTenant(session);

  const body = await req.json();
  const password = await bcrypt.hash(body.password, 12);

  const user = await prisma.user.create({
    data: {
      tenantId,
      name: body.name,
      email: body.email,
      password,
      role: body.role || "WORKER",
    },
    select: { id: true, name: true, email: true, role: true, createdAt: true },
  });

  await record({
    tenantId,
    actor: actorFromSession(session),
    action: "user.add",
    entity: "User",
    entityId: user.id,
    summary: `Added ${user.name} (${user.email}) to the crew as ${user.role}`,
    meta: { role: user.role, email: user.email },
  });

  return NextResponse.json(user, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || isNotAdmin(session)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { tenantId, id: selfId } = sessionTenant(session);

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  if (id === selfId) {
    return NextResponse.json({ error: "You cannot remove your own account" }, { status: 400 });
  }

  // Scoped to this crew: an unscoped delete reached any user of any tenant, including
  // another company's only admin, which locks them out of their own workspace for good.
  // Name and email ride along so the journal can say who lost access, not just an id.
  const target = await prisma.user.findFirst({
    where: { id, tenantId },
    select: { role: true, name: true, email: true },
  });
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (target.role === "ADMIN") {
    const admins = await prisma.user.count({ where: { tenantId, role: "ADMIN" } });
    if (admins <= 1) {
      return NextResponse.json({ error: "The last admin cannot be removed" }, { status: 400 });
    }
  }

  await prisma.user.delete({ where: { id } });

  await record({
    tenantId,
    actor: actorFromSession(session),
    action: "user.remove",
    entity: "User",
    entityId: id,
    summary: `Removed ${target.name} (${target.email}, ${target.role}) from the crew`,
    meta: { role: target.role, email: target.email },
  });

  return NextResponse.json({ ok: true });
}
