import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSessionUser } from "@/lib/session";

const ACTION_TO_STATUS = {
  PUBLISH: "PUBLISHED",
  PAUSE: "PAUSED",
  CLOSE: "CLOSED",
  REOPEN: "DRAFT",
} as const;

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAppSessionUser();
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const action = typeof body.action === "string" ? body.action.trim().toUpperCase() : "";
  const targetStatus = ACTION_TO_STATUS[action as keyof typeof ACTION_TO_STATUS];
  if (!targetStatus) return NextResponse.json({ error: "Unsupported vacancy action." }, { status: 422 });

  const vacancy = await prisma.vacancy.findFirst({
    where: { id: params.id, profile: { tenantId: user.tenantId } },
    include: { profile: { select: { profileStatus: true } } },
  });
  if (!vacancy) return NextResponse.json({ error: "Vacancy not found." }, { status: 404 });

  if (targetStatus === "PUBLISHED") {
    if (vacancy.profile.profileStatus !== "PUBLISHED") {
      return NextResponse.json({ error: "Publish the contractor profile first." }, { status: 409 });
    }
    if (vacancy.validThrough && vacancy.validThrough <= new Date()) {
      return NextResponse.json({ error: "The vacancy closing date is already in the past." }, { status: 409 });
    }
  }

  const updated = await prisma.vacancy.update({
    where: { id: vacancy.id },
    data: { status: targetStatus },
  });

  return NextResponse.json({ vacancy: updated });
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAppSessionUser();
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const vacancy = await prisma.vacancy.findFirst({
    where: { id: params.id, profile: { tenantId: user.tenantId } },
    select: { id: true, status: true },
  });
  if (!vacancy) return NextResponse.json({ error: "Vacancy not found." }, { status: 404 });

  if (vacancy.status === "PUBLISHED") {
    return NextResponse.json({ error: "Close the vacancy before deleting it." }, { status: 409 });
  }

  await prisma.vacancy.delete({ where: { id: vacancy.id } });
  return NextResponse.json({ success: true });
}
