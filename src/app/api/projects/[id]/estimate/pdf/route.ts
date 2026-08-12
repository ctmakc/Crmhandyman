import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/guard";
import { docRef, renderDocument, DocLineItem } from "@/lib/document";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const { tenantId } = guard.identity;

  // Ownership of the job first: answering «estimateId required» to a stranger confirms
  // the route and the job behind it exist.
  const owned = await prisma.project.findFirst({
    where: { id: params.id, tenantId },
    select: { id: true },
  });
  if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { searchParams } = new URL(req.url);
  const estimateId = searchParams.get("estimateId");
  if (!estimateId) return NextResponse.json({ error: "estimateId required" }, { status: 400 });

  // Scoped by tenant AND by the project in the route — an estimate id alone used to be
  // enough to read another tenant's document.
  const estimate = await prisma.estimate.findFirst({
    where: { id: estimateId, projectId: params.id, project: { tenantId } },
    include: { project: { include: { tenant: { select: { businessName: true } } } } },
  });
  if (!estimate) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const html = renderDocument({
    kind: "ESTIMATE",
    number: docRef("EST", estimate.id, estimate.createdAt),
    status: estimate.status,
    businessName: estimate.project.tenant.businessName,
    clientName: estimate.project.clientName,
    address: estimate.project.address,
    phone: estimate.project.phone,
    email: estimate.project.email,
    jobTitle: estimate.project.title,
    lineItems: JSON.parse(estimate.lineItems) as DocLineItem[],
    subtotal: estimate.subtotal,
    tax: estimate.tax,
    total: estimate.total,
    notes: estimate.notes,
    issuedAt: estimate.createdAt,
    validUntil: estimate.validUntil,
    autoPrint: searchParams.get("print") === "1",
  });

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
