import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/guard";
import { loadGoLiveReadiness } from "@/lib/go-live-readiness";
import { readNotificationSettings } from "@/lib/notify";
import { smtpConfigured } from "@/lib/mailer";
import { prisma } from "@/lib/prisma";

function recount(readiness: Awaited<ReturnType<typeof loadGoLiveReadiness>>) {
  readiness.counts = readiness.gates.reduce(
    (acc, row) => {
      if (row.state === "READY") acc.ready += 1;
      if (row.state === "WARN") acc.warn += 1;
      if (row.state === "BLOCKED") acc.blocked += 1;
      return acc;
    },
    { ready: 0, warn: 0, blocked: 0 },
  );
  readiness.verdict = readiness.counts.blocked ? "BLOCKED" : "READY";
}

export async function GET(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { tenantId } = guard.identity;
  const forwarded = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwarded || req.headers.get("host")?.trim() || null;
  const [readiness, alerts] = await Promise.all([
    loadGoLiveReadiness(tenantId, { currentHost: host }),
    readNotificationSettings(tenantId),
  ]);
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  // An address alone is not a delivery channel. Email requires a configured SMTP
  // transport; Telegram requires both the chat id and a stored bot token.
  const telegramReady = Boolean(alerts.telegramChatId && alerts.telegramTokenHint);
  const emailReady = smtpConfigured();
  const alertsGate = readiness.gates.find((row) => row.id === "alerts");
  if (alerts.isActive && !telegramReady && !emailReady && alertsGate) {
    alertsGate.state = "BLOCKED";
    alertsGate.summary = "Alerts are on, but neither Telegram nor SMTP is deliverable.";
    alertsGate.details = [
      `Telegram: ${telegramReady ? "ready" : "missing chat id/token"}`,
      `SMTP: ${emailReady ? "ready" : "not configured on server"}`,
      `Last alert attempt: ${alerts.lastSentAt || "never"}`,
    ];
  } else if (alerts.lastDelivered && alerts.lastSentAt && alertsGate) {
    const lastAlert = new Date(alerts.lastSentAt);
    if (!Number.isNaN(lastAlert.getTime()) && lastAlert < sevenDaysAgo) {
      alertsGate.state = "WARN";
      alertsGate.summary = "Alert delivery worked before, but the proof is older than 7 days. Send a fresh test before launch.";
      alertsGate.details = [`Last successful alert: ${alerts.lastSentAt}`];
    }
  }

  // Acceptance evidence must be one coherent path. A text to some other lead during the
  // same week does not prove that the latest website/Meta test lead reached the SMS desk.
  const acceptanceLead = readiness.evidence.latestExternalLead;
  const acceptanceGate = readiness.gates.find((row) => row.id === "acceptance");
  if (acceptanceLead && acceptanceGate) {
    const leadCreatedAt = new Date(acceptanceLead.createdAt);
    const recentLead = !Number.isNaN(leadCreatedAt.getTime()) && leadCreatedAt >= sevenDaysAgo;
    const exactSms = recentLead
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

    readiness.evidence.latestSmsActivityAt = exactSms?.createdAt.toISOString() || null;
    if (recentLead && exactSms) {
      acceptanceGate.state = "READY";
      acceptanceGate.summary = "The latest external test lead has matching recent SMS activity in this workspace.";
    } else if (recentLead) {
      acceptanceGate.state = "WARN";
      acceptanceGate.summary = "A recent external lead exists, but that same lead has no recent SMS activity yet.";
    }
    acceptanceGate.details = [
      `Latest external lead: ${acceptanceLead.name} · ${acceptanceLead.source} · ${acceptanceLead.status}`,
      `Lead time: ${acceptanceLead.createdAt}`,
      `Phone: ${acceptanceLead.phonePresent ? "present" : "missing"}`,
      `Matching SMS activity: ${exactSms?.createdAt.toISOString() || "none"}`,
    ];
  }

  recount(readiness);

  return NextResponse.json(readiness, {
    headers: { "Cache-Control": "no-store" },
  });
}
