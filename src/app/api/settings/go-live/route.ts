import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/guard";
import { loadGoLiveReadiness } from "@/lib/go-live-readiness";
import { applyLiveProof } from "@/lib/go-live-proof";
import { readNotificationSettings } from "@/lib/notify";
import { smtpConfigured } from "@/lib/mailer";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { tenantId } = guard.identity;
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const forwarded = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwarded || req.headers.get("host")?.trim() || null;
  const [readiness, alerts] = await Promise.all([
    loadGoLiveReadiness(tenantId, { currentHost: host, now }),
    readNotificationSettings(tenantId),
  ]);

  const acceptanceLead = readiness.evidence.latestExternalLead;
  const exactSms = acceptanceLead
    ? await prisma.auditLog.findFirst({
        where: {
          tenantId,
          entity: "Lead",
          entityId: acceptanceLead.id,
          action: { in: ["lead.activity.sms_sent", "lead.activity.sms_received"] },
          createdAt: { gte: sevenDaysAgo },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: { createdAt: true },
      })
    : null;

  const report = applyLiveProof(readiness, {
    now,
    alerts: {
      active: alerts.isActive,
      telegramReady: Boolean(alerts.telegramChatId && alerts.telegramTokenHint),
      smtpReady: smtpConfigured(),
      lastSentAt: alerts.lastSentAt,
      lastDelivered: alerts.lastDelivered,
    },
    exactAcceptanceSmsAt: exactSms?.createdAt || null,
  });

  return NextResponse.json(report, {
    headers: { "Cache-Control": "no-store" },
  });
}
