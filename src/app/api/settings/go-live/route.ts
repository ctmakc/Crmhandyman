import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/guard";
import { loadGoLiveReadiness } from "@/lib/go-live-readiness";
import { readNotificationSettings } from "@/lib/notify";
import { smtpConfigured } from "@/lib/mailer";

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

  // An address alone is not a delivery channel. Email requires a configured SMTP
  // transport; Telegram requires both the chat id and a stored bot token.
  const telegramReady = Boolean(alerts.telegramChatId && alerts.telegramTokenHint);
  const emailReady = smtpConfigured();
  if (alerts.isActive && !telegramReady && !emailReady) {
    const gate = readiness.gates.find((row) => row.id === "alerts");
    if (gate) {
      gate.state = "BLOCKED";
      gate.summary = "Alerts are on, but neither Telegram nor SMTP is deliverable.";
      gate.details = [
        `Telegram: ${telegramReady ? "ready" : "missing chat id/token"}`,
        `SMTP: ${emailReady ? "ready" : "not configured on server"}`,
        `Last alert attempt: ${alerts.lastSentAt || "never"}`,
      ];
      recount(readiness);
    }
  }

  return NextResponse.json(readiness, {
    headers: { "Cache-Control": "no-store" },
  });
}
