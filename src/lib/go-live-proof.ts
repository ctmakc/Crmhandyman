import type { GoLiveReadiness } from "@/lib/go-live-readiness";

export type LiveProofInput = {
  now: Date;
  alerts: {
    active: boolean;
    telegramReady: boolean;
    smtpReady: boolean;
    lastSentAt: string | null;
    lastDelivered: boolean;
  };
  exactAcceptanceSmsAt: Date | null;
};

function recount(readiness: GoLiveReadiness) {
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

/**
 * Tightens the structural readiness report with proof that can only be known from the
 * currently running tenant. CI and saved credentials are not evidence that a dispatcher
 * actually receives a lead. We require fresh alert delivery and SMS on the exact latest
 * external acceptance lead before paid traffic can be called safe.
 */
export function applyLiveProof(
  source: GoLiveReadiness,
  input: LiveProofInput,
): GoLiveReadiness {
  const readiness: GoLiveReadiness = {
    ...source,
    counts: { ...source.counts },
    gates: source.gates.map((row) => ({ ...row, details: [...row.details] })),
    evidence: {
      latestExternalLead: source.evidence.latestExternalLead
        ? { ...source.evidence.latestExternalLead }
        : null,
      latestSmsActivityAt: source.evidence.latestSmsActivityAt,
    },
  };
  const cutoff = input.now.getTime() - 7 * 24 * 60 * 60 * 1000;

  const alertsGate = readiness.gates.find((row) => row.id === "alerts");
  if (alertsGate) {
    const transportReady = input.alerts.telegramReady || input.alerts.smtpReady;
    const lastAlertAt = input.alerts.lastSentAt ? new Date(input.alerts.lastSentAt) : null;
    const freshDelivery = Boolean(
      input.alerts.lastDelivered &&
        lastAlertAt &&
        !Number.isNaN(lastAlertAt.getTime()) &&
        lastAlertAt.getTime() >= cutoff,
    );

    if (!input.alerts.active) {
      alertsGate.state = "BLOCKED";
      alertsGate.summary = "New-lead alerts are switched off.";
    } else if (!transportReady) {
      alertsGate.state = "BLOCKED";
      alertsGate.summary = "Alerts are on, but neither Telegram nor SMTP is deliverable.";
    } else if (!freshDelivery) {
      alertsGate.state = "BLOCKED";
      alertsGate.summary = "The alert transport is configured, but there is no successful delivery proof from the last 7 days.";
    } else {
      alertsGate.state = "READY";
      alertsGate.summary = "The configured lead-alert transport has fresh successful delivery proof.";
    }

    alertsGate.details = [
      `Telegram: ${input.alerts.telegramReady ? "ready" : "not ready"}`,
      `SMTP: ${input.alerts.smtpReady ? "ready" : "not ready"}`,
      `Last alert attempt: ${input.alerts.lastSentAt || "never"}`,
      `Last delivered: ${input.alerts.lastDelivered ? "yes" : "no"}`,
    ];
  }

  const acceptanceGate = readiness.gates.find((row) => row.id === "acceptance");
  const lead = readiness.evidence.latestExternalLead;
  if (acceptanceGate && lead) {
    const leadAt = new Date(lead.createdAt);
    const recentLead = !Number.isNaN(leadAt.getTime()) && leadAt.getTime() >= cutoff;
    const exactSmsAt = input.exactAcceptanceSmsAt;
    const freshExactSms = Boolean(exactSmsAt && exactSmsAt.getTime() >= cutoff);

    readiness.evidence.latestSmsActivityAt = freshExactSms
      ? exactSmsAt!.toISOString()
      : null;

    if (!recentLead) {
      acceptanceGate.state = "BLOCKED";
      acceptanceGate.summary = "The latest external lead is older than 7 days. Run a fresh website or Meta acceptance lead.";
    } else if (!lead.phonePresent) {
      acceptanceGate.state = "BLOCKED";
      acceptanceGate.summary = "The latest external acceptance lead has no phone number, so the SMS path cannot be proven.";
    } else if (!freshExactSms) {
      acceptanceGate.state = "BLOCKED";
      acceptanceGate.summary = "The latest external lead has no matching SMS activity from the last 7 days.";
    } else {
      acceptanceGate.state = "READY";
      acceptanceGate.summary = "The latest external test lead has matching recent SMS activity in this workspace.";
    }

    acceptanceGate.details = [
      `Latest external lead: ${lead.name} · ${lead.source} · ${lead.status}`,
      `Lead time: ${lead.createdAt}`,
      `Phone: ${lead.phonePresent ? "present" : "missing"}`,
      `Matching SMS activity: ${freshExactSms ? exactSmsAt!.toISOString() : "none"}`,
    ];
  }

  recount(readiness);
  return readiness;
}
