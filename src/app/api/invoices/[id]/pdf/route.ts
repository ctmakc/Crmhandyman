import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { renderDocument, DocLineItem } from "@/lib/document";

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tenantId = (session.user as any).tenantId as string;

  const invoice = await prisma.invoice.findFirst({
    where: { id: params.id, tenantId },
    include: {
      payments: { select: { amount: true } },
      project: { select: { title: true, phone: true } },
      tenant: { select: { businessName: true } },
    },
  });
  if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const html = renderDocument({
    kind: "INVOICE",
    number: invoice.number,
    status: invoice.status,
    businessName: invoice.tenant.businessName,
    clientName: invoice.clientName,
    address: invoice.address,
    phone: invoice.project.phone,
    email: invoice.email,
    jobTitle: invoice.project.title,
    lineItems: JSON.parse(invoice.lineItems) as DocLineItem[],
    subtotal: invoice.subtotal,
    tax: invoice.tax,
    total: invoice.total,
    amountPaid: invoice.payments.reduce((s, p) => s + p.amount, 0),
    notes: invoice.notes,
    issuedAt: invoice.issuedAt,
    dueDate: invoice.dueDate,
    autoPrint: new URL(req.url).searchParams.get("print") === "1",
  });

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
