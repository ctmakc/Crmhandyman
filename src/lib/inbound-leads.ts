import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export interface InboundLeadInput {
  tenantId: string;
  channel: string;
  externalId: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  source: "FACEBOOK" | "INSTAGRAM" | "GOOGLE" | "HOMESTARS" | "KIJIJI" | "EMAIL" | "MANUAL" | "OTHER";
  jobType?: string | null;
  notes?: string | null;
}

function isUniqueViolation(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

async function resolveCommittedReceipt(tenantId: string, channel: string, externalId: string) {
  const receipt = await prisma.inboundReceipt.findUnique({
    where: { tenantId_channel_externalId: { tenantId, channel, externalId } },
  });
  if (!receipt?.leadId) return null;
  return prisma.lead.findFirst({ where: { id: receipt.leadId, tenantId } });
}

/**
 * Exactly-once ingress boundary for public/provider lead creation.
 *
 * The receipt is created before the lead inside the same transaction. Concurrent
 * deliveries race on the receipt's unique constraint; the loser resolves the lead
 * committed by the winner instead of creating a duplicate customer inquiry.
 */
export async function createInboundLead(input: InboundLeadInput) {
  const channel = input.channel.trim().toUpperCase().slice(0, 40);
  const externalId = input.externalId.trim().slice(0, 200);
  if (!channel || !externalId) throw new Error("Inbound channel and externalId are required");

  // Preserve idempotency for leads created before the receipt table existed.
  const legacy = await prisma.lead.findFirst({
    where: { tenantId: input.tenantId, sourceLeadId: externalId },
  });
  if (legacy) {
    await prisma.inboundReceipt.upsert({
      where: {
        tenantId_channel_externalId: {
          tenantId: input.tenantId,
          channel,
          externalId,
        },
      },
      update: { leadId: legacy.id },
      create: {
        tenantId: input.tenantId,
        channel,
        externalId,
        leadId: legacy.id,
      },
    });
    return { lead: legacy, duplicate: true };
  }

  try {
    const lead = await prisma.$transaction(async (tx) => {
      const receipt = await tx.inboundReceipt.create({
        data: {
          tenantId: input.tenantId,
          channel,
          externalId,
        },
      });

      const created = await tx.lead.create({
        data: {
          tenantId: input.tenantId,
          name: input.name,
          email: input.email ?? null,
          phone: input.phone ?? null,
          address: input.address ?? null,
          city: input.city ?? null,
          source: input.source,
          sourceLeadId: externalId,
          jobType: input.jobType ?? null,
          notes: input.notes ?? null,
          status: "NEW",
        },
      });

      await tx.inboundReceipt.update({
        where: { id: receipt.id },
        data: { leadId: created.id },
      });
      return created;
    });

    return { lead, duplicate: false };
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const committed = await resolveCommittedReceipt(input.tenantId, channel, externalId);
    if (!committed) throw error;
    return { lead: committed, duplicate: true };
  }
}
