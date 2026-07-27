import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { renderDocument, DocLineItem } from "@/lib/document";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tenantId = (session.user as any).tenantId as string;

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
    number: `EST-${new Date(estimate.createdAt).getFullYear()}-${estimate.id.slice(-4).toUpperCase()}`,
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
