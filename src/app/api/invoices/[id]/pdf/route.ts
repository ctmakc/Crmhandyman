import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/guard";
import { renderDocument } from "@/lib/document";
import { parseLineItems } from "@/lib/money";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const { tenantId } = guard.identity;

  const invoice = await prisma.invoice.findFirst({
    where: { id: params.id, tenantId },
    include: {
      payments: { select: { amountCents: true } },
      project: { select: { title: true, phone: true } },
      tenant: {
        select: {
          businessName: true,
          businessAddress: true,
          businessPhone: true,
          businessEmail: true,
          hstNumber: true,
          paymentInstructions: true,
        },
      },
    },
  });
  if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const html = renderDocument({
    kind: "INVOICE",
    number: invoice.number,
    status: invoice.status,
    businessName: invoice.tenant.businessName,
    business: {
      address: invoice.tenant.businessAddress,
      phone: invoice.tenant.businessPhone,
      email: invoice.tenant.businessEmail,
      hstNumber: invoice.tenant.hstNumber,
      paymentInstructions: invoice.tenant.paymentInstructions,
    },
    clientName: invoice.clientName,
    address: invoice.address,
    phone: invoice.project.phone,
    email: invoice.email,
    jobTitle: invoice.project.title,
    lineItems: parseLineItems(invoice.lineItems),
    subtotalCents: invoice.subtotalCents,
    taxCents: invoice.taxCents,
    totalCents: invoice.totalCents,
    amountPaidCents: invoice.payments.reduce((s, p) => s + p.amountCents, 0),
    notes: invoice.notes,
    issuedAt: invoice.issuedAt,
    dueDate: invoice.dueDate,
    autoPrint: new URL(req.url).searchParams.get("print") === "1",
  });

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
