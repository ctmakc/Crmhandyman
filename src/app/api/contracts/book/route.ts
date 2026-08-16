import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { nextDueVisit, daysUntil, MONTH_NAMES } from "@/lib/contracts";
import { createNumberedInvoice } from "@/lib/invoice-create";
import { writeAuditEvent } from "@/lib/audit";

function isUniqueViolation(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tenantId = (session.user as any).tenantId as string;

  const body = await req.json().catch(() => ({}));
  const withinDays = Math.min(Math.max(Number(body.withinDays ?? 45) || 45, 1), 120);
  const contracts = await prisma.serviceContract.findMany({
    where: {
      tenantId,
      active: true,
      ...(body.contractId ? { id: String(body.contractId) } : {}),
    },
    include: {
      client: true,
      equipment: true,
      projects: { select: { contractCycle: true } },
    },
  });

  const booked: Array<{ projectId: string; contract: string; client: string; on: string; invoiceId?: string; duplicate?: boolean }> = [];

  for (const contract of contracts) {
    const cycles = new Set(contract.projects.map((project) => project.contractCycle).filter(Boolean) as string[]);
    const next = nextDueVisit(contract, cycles);
    if (!next) continue;
    if (!body.contractId && daysUntil(next.date) > withinDays) continue;

    const unit = contract.equipment ? contract.equipment.kind.replace(/_/g, " ").toLowerCase() : "system";
    let project: { id: string };
    let duplicate = false;

    try {
      project = await prisma.$transaction(async (tx) => {
        const receipt = await tx.serviceVisitReceipt.create({
          data: { tenantId, contractId: contract.id, cycle: next.cycle },
        });
        const created = await tx.project.create({
          data: {
            tenantId,
            clientId: contract.clientId,
            contractId: contract.id,
            contractCycle: next.cycle,
            clientName: contract.client.name,
            phone: contract.client.phone,
            email: contract.client.email,
            address: contract.client.address || "",
            title: `${contract.name} — ${MONTH_NAMES[next.month]} visit`,
            description: `Contract visit for the ${unit}. ${contract.notes || ""}`.trim(),
            jobType: "HVAC service",
            scheduledDate: next.date,
            status: "SCHEDULED",
          },
          select: { id: true },
        });
        await tx.serviceVisitReceipt.update({ where: { id: receipt.id }, data: { projectId: created.id } });
        return created;
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const receipt = await prisma.serviceVisitReceipt.findUnique({
        where: { tenantId_contractId_cycle: { tenantId, contractId: contract.id, cycle: next.cycle } },
      });
      if (!receipt?.projectId) {
        console.error("SERVICE_VISIT_RECEIPT_INCOMPLETE", { tenantId, contractId: contract.id, cycle: next.cycle });
        continue;
      }
      project = { id: receipt.projectId };
      duplicate = true;
    }

    let invoiceId: string | undefined;
    if (contract.autoInvoice && contract.pricePerVisit > 0) {
      const existingInvoice = await prisma.invoice.findFirst({
        where: { tenantId, projectId: project.id, status: { not: "VOID" } },
        select: { id: true },
      });
      if (existingInvoice) {
        invoiceId = existingInvoice.id;
      } else {
        const subtotal = Math.round(contract.pricePerVisit * 100) / 100;
        const tax = Math.round(subtotal * 0.13 * 100) / 100;
        const invoice = await createNumberedInvoice(tenantId, {
          projectId: project.id,
          clientName: contract.client.name,
          address: contract.client.address,
          email: contract.client.email,
          lineItems: JSON.stringify([
            { description: `${contract.name} — ${MONTH_NAMES[next.month]} visit`, qty: 1, unit: "ea", unitPrice: subtotal },
          ]),
          subtotal,
          tax,
          total: Math.round((subtotal + tax) * 100) / 100,
          notes: `Scheduled maintenance under ${contract.name}.`,
          status: "DRAFT",
          dueDate: new Date(next.date.getTime() + 14 * 86_400_000),
        });
        invoiceId = invoice.id;
      }
    }

    booked.push({
      projectId: project.id,
      contract: contract.name,
      client: contract.client.name,
      on: next.date.toISOString(),
      invoiceId,
      duplicate,
    });

    if (!duplicate) {
      await writeAuditEvent({
        tenantId,
        actorEmail: session.user?.email,
        action: "contract.visit_booked",
        entityType: "contract",
        entityId: contract.id,
        summary: `${contract.name} visit booked for ${contract.client.name}`,
        metadata: { projectId: project.id, contractCycle: next.cycle, scheduledDate: next.date.toISOString(), invoiceId },
      });
    }
  }

  return NextResponse.json({ booked, count: booked.filter((row) => !row.duplicate).length });
}
