import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/guard";
import { record } from "@/lib/audit";
import {
  MOVING_RATE_CARD_CHANNEL,
  decodeMovingRateCard,
  encodeMovingRateCard,
  movingRateCardFromForm,
  movingRateCardToForm,
} from "@/lib/moving-rate-card";

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const { tenantId } = guard.identity;

  const row = await prisma.channelIntegration.findUnique({
    where: { tenantId_channel: { tenantId, channel: MOVING_RATE_CARD_CHANNEL } },
    select: { config: true, isActive: true },
  });
  const card = row?.isActive ? decodeMovingRateCard(row.config) : null;

  return NextResponse.json({
    configured: Boolean(card),
    rateCard: card ? movingRateCardToForm(card) : null,
  });
}

export async function PUT(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const { tenantId, id: actorId } = guard.identity;

  const parsed = movingRateCardFromForm(await req.json());
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  await prisma.channelIntegration.upsert({
    where: { tenantId_channel: { tenantId, channel: MOVING_RATE_CARD_CHANNEL } },
    create: {
      tenantId,
      channel: MOVING_RATE_CARD_CHANNEL,
      config: encodeMovingRateCard(parsed.card),
      isActive: true,
    },
    update: {
      config: encodeMovingRateCard(parsed.card),
      isActive: true,
    },
  });

  await record({
    tenantId,
    actor: { id: actorId },
    action: "moving.rates",
    entity: "Tenant",
    entityId: tenantId,
    summary: "Updated moving estimate rate card",
  });

  return NextResponse.json({ configured: true, rateCard: movingRateCardToForm(parsed.card) });
}
