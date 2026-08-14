import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

import { sessionTenant } from "@/lib/session";
import { removeStoredFile } from "@/lib/uploads";
import type { Session } from "next-auth";

const SUPER_ADMIN_EMAILS = (process.env.SUPER_ADMIN_EMAILS || "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

/** Unset means the panel does not exist — a missing variable must not open it. */
const PLATFORM_TENANT_SLUG = (process.env.PLATFORM_TENANT_SLUG || "").trim();

/**
 * An email alone is not an identity here: users are unique per tenant, so anyone could
 * open a workspace on the operator's address and inherit this panel over every tenant.
 * The account must also sit in the platform's own workspace and be an admin there.
 */
function isSuperAdmin(session: Session | null) {
  if (!session?.user?.email || !PLATFORM_TENANT_SLUG) return false;
  if (!SUPER_ADMIN_EMAILS.includes(session.user.email.toLowerCase())) return false;

  const { tenantSlug, role } = sessionTenant(session);
  return tenantSlug === PLATFORM_TENANT_SLUG && role === "ADMIN";
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!isSuperAdmin(session)) return NextResponse.json({ error: "You are signed out — sign in again" }, { status: 401 });

  const tenants = await prisma.tenant.findMany({
    include: { _count: { select: { users: true, leads: true, projects: true } } },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(tenants);
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!isSuperAdmin(session)) return NextResponse.json({ error: "You are signed out — sign in again" }, { status: 401 });

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
  if (!isSuperAdmin(session)) return NextResponse.json({ error: "You are signed out — sign in again" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Nothing was picked to remove" }, { status: 400 });

  /**
   * Every table that carries `tenantId`, in dependency order. Each wave that adds a
   * model has to appear here: waves 2–3 were missed once and the delete failed on the
   * last statement, and wave 5б repeated it with AuditLog, JobPhoto and IntakeKey.
   * The foreign keys are RESTRICT, so a forgotten table means the tenant cannot leave.
   */
  const photos = await prisma.jobPhoto.findMany({
    where: { tenantId: id },
    select: { path: true },
  });

  await prisma.$transaction([
    prisma.auditLog.deleteMany({ where: { tenantId: id } }),
    prisma.jobPhoto.deleteMany({ where: { tenantId: id } }),
    prisma.intakeKey.deleteMany({ where: { tenantId: id } }),
    prisma.expense.deleteMany({ where: { tenantId: id } }),
    prisma.payment.deleteMany({ where: { tenantId: id } }),
    prisma.invoice.deleteMany({ where: { tenantId: id } }),
    prisma.task.deleteMany({ where: { tenantId: id } }),
    prisma.estimate.deleteMany({ where: { tenantId: id } }),
    prisma.equipment.deleteMany({ where: { tenantId: id } }),
    prisma.serviceContract.deleteMany({ where: { tenantId: id } }),
    prisma.project.deleteMany({ where: { tenantId: id } }),
    prisma.lead.deleteMany({ where: { tenantId: id } }),
    prisma.client.deleteMany({ where: { tenantId: id } }),
    prisma.channelIntegration.deleteMany({ where: { tenantId: id } }),
    prisma.user.deleteMany({ where: { tenantId: id } }),
    prisma.tenant.delete({ where: { id } }),
  ]);

  // Rows first, bytes second: an orphaned file is litter, an orphaned row is a 404 the
  // owner cannot explain. Deleting a workspace has to take its site photos with it.
  for (const photo of photos) await removeStoredFile(photo.path);

  return NextResponse.json({ ok: true });
}
