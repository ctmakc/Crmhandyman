import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const SUPER_ADMIN_EMAILS = (process.env.SUPER_ADMIN_EMAILS || "").split(",").map(e => e.trim()).filter(Boolean);

function isSuperAdmin(session: { user?: { email?: string | null } } | null) {
  return session?.user?.email && SUPER_ADMIN_EMAILS.includes(session.user.email);
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!isSuperAdmin(session)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenants = await prisma.tenant.findMany({
    include: { _count: { select: { users: true, leads: true, projects: true } } },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(tenants);
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!isSuperAdmin(session)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { id, plan, expiresAt, businessName } = body;

  const tenant = await prisma.tenant.update({
    where: { id },
    data: {
      plan: plan || undefined,
      expiresAt: expiresAt !== undefined ? (expiresAt ? new Date(expiresAt) : null) : undefined,
      businessName: businessName || undefined,
    },
  });

  return NextResponse.json(tenant);
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!isSuperAdmin(session)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  // Delete all tenant data in order
  await prisma.$transaction([
    prisma.expense.deleteMany({ where: { tenantId: id } }),
    prisma.payment.deleteMany({ where: { tenantId: id } }),
    prisma.task.deleteMany({ where: { tenantId: id } }),
    prisma.estimate.deleteMany({ where: { project: { tenantId: id } } }),
    prisma.project.deleteMany({ where: { tenantId: id } }),
    prisma.lead.deleteMany({ where: { tenantId: id } }),
    prisma.channelIntegration.deleteMany({ where: { tenantId: id } }),
    prisma.user.deleteMany({ where: { tenantId: id } }),
    prisma.tenant.delete({ where: { id } }),
  ]);

  return NextResponse.json({ ok: true });
}
