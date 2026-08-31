import { prisma } from "@/lib/prisma";
import { readNotificationSettings } from "@/lib/notify";
import { twilioConfig } from "@/lib/sms";
import { leadAutomationSettings } from "@/lib/lead-automation";
import {
  META_ADS_CHANNEL,
  metaAdsSyncConfig,
  normalizeMetaAdAccountId,
} from "@/lib/meta-ads";

export type GoLiveGateState = "READY" | "WARN" | "BLOCKED";

export type GoLiveGate = {
  id: string;
  title: string;
  state: GoLiveGateState;
  summary: string;
  details: string[];
  href?: string;
};

export type GoLiveReadiness = {
  verdict: "READY" | "BLOCKED";
  checkedAt: string;
  expectedWorkspaceUrl: string;
  currentHost: string | null;
  counts: { ready: number; warn: number; blocked: number };
  gates: GoLiveGate[];
  evidence: {
    latestExternalLead: {
      id: string;
      name: string;
      source: string;
      status: string;
      createdAt: string;
      phonePresent: boolean;
    } | null;
    latestSmsActivityAt: string | null;
  };
};

export type ReadinessFacts = {
  now: Date;
  tenant: {
    slug: string;
    status: string;
    plan: string;
    businessName: string;
    ownerEmail: string;
    businessAddress: string | null;
    businessPhone: string | null;
    businessEmail: string | null;
    paymentInstructions: string | null;
  };
  currentHost?: string | null;
  approvedUsers: number;
  approvedAdmins: number;
  activeWebsiteKeys: number;
  latestWebsiteKeyUseAt: Date | null;
  smsReady: boolean;
  automation: {
    instantAck: boolean;
    slaCallback: boolean;
    followUps: boolean;
  };
  cronSecretPresent: boolean;
  alerts: {
    active: boolean;
    channelConfigured: boolean;
    lastSentAt: string | null;
    lastDelivered: boolean;
  };
  facebook: {
    active: boolean;
    pageIdPresent: boolean;
    pageTokenPresent: boolean;
    appIdPresent: boolean;
    appSecretPresent: boolean;
    verifyTokenPresent: boolean;
  };
  metaAds: {
    configured: boolean;
    lastSyncAt: Date | null;
    lastSyncSince?: string;
    lastSyncUntil?: string;
  };
  latestExternalLead: {
    id: string;
    name: string;
    source: string;
    status: string;
    createdAt: Date;
    phonePresent: boolean;
  } | null;
  latestSmsActivityAt: Date | null;
};

const nonEmpty = (value: string | null | undefined) => Boolean(value?.trim());

function gate(
  id: string,
  title: string,
  state: GoLiveGateState,
  summary: string,
  details: string[],
  href?: string,
): GoLiveGate {
  return { id, title, state, summary, details, href };
}

export function evaluateGoLiveReadiness(facts: ReadinessFacts): GoLiveReadiness {
  const gates: GoLiveGate[] = [];
  const workspaceUrl = `https://${facts.tenant.slug}.itopsi.com`;

  const workspaceDetails = [
    `Workspace: ${workspaceUrl}`,
    `Plan: ${facts.tenant.plan}`,
  ];
  if (facts.currentHost && facts.currentHost !== `${facts.tenant.slug}.itopsi.com`) {
    workspaceDetails.push(`Current host: ${facts.currentHost} (shared/admin host is acceptable for setup)`);
  }
  gates.push(
    gate(
      "workspace",
      "Workspace",
      facts.tenant.status === "ACTIVE" ? (facts.tenant.plan === "PAID" ? "READY" : "WARN") : "BLOCKED",
      facts.tenant.status !== "ACTIVE"
        ? `Workspace status is ${facts.tenant.status}.`
        : facts.tenant.plan === "PAID"
          ? "Workspace is active on a paid plan."
          : "Workspace is active, but still on the demo plan.",
      workspaceDetails,
      "/settings/business",
    ),
  );

  const missingBusiness = [
    !nonEmpty(facts.tenant.businessAddress) ? "business address" : null,
    !nonEmpty(facts.tenant.businessPhone) ? "business phone" : null,
    !nonEmpty(facts.tenant.businessEmail) ? "business email" : null,
    !nonEmpty(facts.tenant.paymentInstructions) ? "payment instructions" : null,
  ].filter((value): value is string => Boolean(value));
  gates.push(
    gate(
      "business",
      "Business details",
      missingBusiness.length ? "WARN" : "READY",
      missingBusiness.length
        ? `Complete ${missingBusiness.join(", ")} before sending customer paperwork.`
        : "Customer-facing business and payment details are populated.",
      [`Business: ${facts.tenant.businessName}`, `Owner: ${facts.tenant.ownerEmail}`],
      "/settings/business",
    ),
  );

  gates.push(
    gate(
      "crew",
      "Crew access",
      facts.approvedAdmins < 1 ? "BLOCKED" : facts.approvedUsers < 2 ? "WARN" : "READY",
      facts.approvedAdmins < 1
        ? "No approved admin can operate this workspace."
        : facts.approvedUsers < 2
          ? "Only one approved user exists; add a backup dispatcher/worker."
          : "Approved admin and crew access exist.",
      [`Approved users: ${facts.approvedUsers}`, `Approved admins: ${facts.approvedAdmins}`],
      "/settings/users",
    ),
  );

  const websiteState: GoLiveGateState = facts.activeWebsiteKeys < 1
    ? "BLOCKED"
    : facts.latestWebsiteKeyUseAt
      ? "READY"
      : "WARN";
  gates.push(
    gate(
      "website",
      "Website intake",
      websiteState,
      facts.activeWebsiteKeys < 1
        ? "No active WEBSITE intake key exists."
        : facts.latestWebsiteKeyUseAt
          ? "The website intake credential has been used successfully."
          : "A WEBSITE intake key exists, but it has not received a lead yet.",
      [
        `Active WEBSITE keys: ${facts.activeWebsiteKeys}`,
        `Last used: ${facts.latestWebsiteKeyUseAt?.toISOString() || "never"}`,
      ],
      "/settings/intake",
    ),
  );

  gates.push(
    gate(
      "sms",
      "Two-way SMS",
      facts.smsReady ? "READY" : "BLOCKED",
      facts.smsReady
        ? "Twilio account, auth token and inbound number are configured."
        : "Twilio SMS is not fully configured or is inactive.",
      [],
      "/settings/sms",
    ),
  );

  const anyAutomation = facts.automation.instantAck || facts.automation.slaCallback || facts.automation.followUps;
  const scheduledAutomation = facts.automation.slaCallback || facts.automation.followUps;
  const automationState: GoLiveGateState = !anyAutomation
    ? "WARN"
    : scheduledAutomation && !facts.cronSecretPresent
      ? "BLOCKED"
      : "READY";
  gates.push(
    gate(
      "automation",
      "Lead automation",
      automationState,
      !anyAutomation
        ? "All automatic first-response/SLA/follow-up switches are off."
        : scheduledAutomation && !facts.cronSecretPresent
          ? "SLA/follow-up automation is enabled but AUTOMATION_CRON_SECRET is missing on the app server."
          : "Enabled automation has the server-side scheduler credential it needs.",
      [
        `Instant acknowledgement: ${facts.automation.instantAck ? "on" : "off"}`,
        `5-minute SLA: ${facts.automation.slaCallback ? "on" : "off"}`,
        `No-reply follow-ups: ${facts.automation.followUps ? "on" : "off"}`,
      ],
      "/settings/sms",
    ),
  );

  const alertsState: GoLiveGateState = !facts.alerts.active || !facts.alerts.channelConfigured
    ? "BLOCKED"
    : facts.alerts.lastDelivered
      ? "READY"
      : "WARN";
  gates.push(
    gate(
      "alerts",
      "Lead alerts",
      alertsState,
      !facts.alerts.active
        ? "New-lead alerts are switched off."
        : !facts.alerts.channelConfigured
          ? "Alerts are on, but no deliverable Telegram/email channel is configured."
          : facts.alerts.lastDelivered
            ? "The configured alert channel has a successful delivery record."
            : "Alert channel is configured but has not produced a successful test/delivery yet.",
      [`Last alert attempt: ${facts.alerts.lastSentAt || "never"}`],
      "/settings/notifications",
    ),
  );

  const facebookReady = facts.facebook.active && facts.facebook.pageIdPresent && facts.facebook.pageTokenPresent;
  const facebookServerReady = facts.facebook.appSecretPresent && facts.facebook.verifyTokenPresent;
  gates.push(
    gate(
      "meta-leads",
      "Meta Lead Ads intake",
      facebookReady && facebookServerReady ? "READY" : "BLOCKED",
      facebookReady && facebookServerReady
        ? "Facebook Page routing and server webhook verification are configured."
        : "Meta Lead Ads is missing tenant credentials or server webhook secrets.",
      [
        `Page integration: ${facebookReady ? "ready" : "missing/inactive"}`,
        `META_APP_SECRET: ${facts.facebook.appSecretPresent ? "present" : "missing"}`,
        `META_WEBHOOK_VERIFY_TOKEN: ${facts.facebook.verifyTokenPresent ? "present" : "missing"}`,
        `META_APP_ID: ${facts.facebook.appIdPresent ? "present" : "not set (not used by runtime webhook)"}`,
      ],
      "/settings/integrations",
    ),
  );

  gates.push(
    gate(
      "meta-reporting",
      "Meta Ads spend reporting",
      !facts.metaAds.configured ? "WARN" : facts.metaAds.lastSyncAt ? "READY" : "WARN",
      !facts.metaAds.configured
        ? "Ads Insights reporting is not configured; lead intake can still run, but campaign ROAS will be absent."
        : facts.metaAds.lastSyncAt
          ? "Ads Insights has a successful cached sync."
          : "Ads Insights credentials are configured but no successful spend sync is recorded yet.",
      [
        `Last sync: ${facts.metaAds.lastSyncAt?.toISOString() || "never"}`,
        facts.metaAds.lastSyncSince && facts.metaAds.lastSyncUntil
          ? `Coverage: ${facts.metaAds.lastSyncSince} → ${facts.metaAds.lastSyncUntil}`
          : "Coverage: none",
      ],
      "/settings/meta-ads",
    ),
  );

  const cutoff = facts.now.getTime() - 7 * 24 * 60 * 60 * 1000;
  const recentLead = facts.latestExternalLead && facts.latestExternalLead.createdAt.getTime() >= cutoff;
  gates.push(
    gate(
      "acceptance",
      "End-to-end lead evidence",
      recentLead ? (facts.latestSmsActivityAt ? "READY" : "WARN") : "BLOCKED",
      !recentLead
        ? "No non-manual lead has landed in this workspace during the last 7 days. Run a real website or Meta test lead before paid traffic."
        : facts.latestSmsActivityAt
          ? "A recent external lead and recent SMS activity prove the live sales path has been exercised."
          : "A recent external lead exists, but there is no recent SMS activity yet.",
      facts.latestExternalLead
        ? [
            `Latest external lead: ${facts.latestExternalLead.name} · ${facts.latestExternalLead.source} · ${facts.latestExternalLead.status}`,
            `Lead time: ${facts.latestExternalLead.createdAt.toISOString()}`,
            `Phone: ${facts.latestExternalLead.phonePresent ? "present" : "missing"}`,
            `Latest SMS activity: ${facts.latestSmsActivityAt?.toISOString() || "none"}`,
          ]
        : [],
      "/leads",
    ),
  );

  const counts = gates.reduce(
    (acc, row) => {
      if (row.state === "READY") acc.ready += 1;
      if (row.state === "WARN") acc.warn += 1;
      if (row.state === "BLOCKED") acc.blocked += 1;
      return acc;
    },
    { ready: 0, warn: 0, blocked: 0 },
  );

  return {
    verdict: counts.blocked ? "BLOCKED" : "READY",
    checkedAt: facts.now.toISOString(),
    expectedWorkspaceUrl: workspaceUrl,
    currentHost: facts.currentHost || null,
    counts,
    gates,
    evidence: {
      latestExternalLead: facts.latestExternalLead
        ? {
            ...facts.latestExternalLead,
            createdAt: facts.latestExternalLead.createdAt.toISOString(),
          }
        : null,
      latestSmsActivityAt: facts.latestSmsActivityAt?.toISOString() || null,
    },
  };
}

export async function loadGoLiveReadiness(
  tenantId: string,
  options: { currentHost?: string | null; now?: Date } = {},
): Promise<GoLiveReadiness> {
  const now = options.now || new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [tenant, approvedUsers, approvedAdmins, websiteKeys, integrations, alerts, latestExternalLead, latestSmsActivity] =
    await Promise.all([
      prisma.tenant.findUniqueOrThrow({
        where: { id: tenantId },
        select: {
          slug: true,
          status: true,
          plan: true,
          businessName: true,
          ownerEmail: true,
          businessAddress: true,
          businessPhone: true,
          businessEmail: true,
          paymentInstructions: true,
        },
      }),
      prisma.user.count({ where: { tenantId, approved: true } }),
      prisma.user.count({ where: { tenantId, approved: true, role: "ADMIN" } }),
      prisma.intakeKey.findMany({
        where: { tenantId, isActive: true, source: "WEBSITE" },
        select: { lastUsedAt: true },
      }),
      prisma.channelIntegration.findMany({
        where: { tenantId, channel: { in: ["SMS", "FACEBOOK", META_ADS_CHANNEL] } },
        select: {
          channel: true,
          accessToken: true,
          pageId: true,
          config: true,
          normalizedAddress: true,
          isActive: true,
          lastSyncAt: true,
        },
      }),
      readNotificationSettings(tenantId),
      prisma.lead.findFirst({
        where: { tenantId, source: { not: "MANUAL" } },
        orderBy: { createdAt: "desc" },
        select: { id: true, name: true, source: true, status: true, createdAt: true, phone: true },
      }),
      prisma.auditLog.findFirst({
        where: {
          tenantId,
          entity: "Lead",
          action: { in: ["lead.activity.sms_sent", "lead.activity.sms_received"] },
          createdAt: { gte: sevenDaysAgo },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: { createdAt: true },
      }),
    ]);

  const byChannel = new Map(integrations.map((row) => [row.channel, row]));
  const sms = byChannel.get("SMS");
  const facebook = byChannel.get("FACEBOOK");
  const metaAds = byChannel.get(META_ADS_CHANNEL);
  const automation = leadAutomationSettings(sms?.config);
  const metaSync = metaAdsSyncConfig(metaAds?.config);
  const latestWebsiteKeyUseAt = websiteKeys.reduce<Date | null>((latest, row) => {
    if (!row.lastUsedAt) return latest;
    if (!latest || row.lastUsedAt > latest) return row.lastUsedAt;
    return latest;
  }, null);
  const telegramReady = Boolean(alerts.telegramChatId && alerts.telegramTokenHint);
  const emailReady = Boolean(alerts.email || tenant.ownerEmail);

  return evaluateGoLiveReadiness({
    now,
    tenant: {
      ...tenant,
      status: String(tenant.status),
      plan: String(tenant.plan),
    },
    currentHost: options.currentHost,
    approvedUsers,
    approvedAdmins,
    activeWebsiteKeys: websiteKeys.length,
    latestWebsiteKeyUseAt,
    smsReady: Boolean(twilioConfig(sms)),
    automation: {
      instantAck: automation.instantAck,
      slaCallback: automation.slaCallback,
      followUps: automation.followUps,
    },
    cronSecretPresent: Boolean(process.env.AUTOMATION_CRON_SECRET?.trim()),
    alerts: {
      active: alerts.isActive,
      channelConfigured: telegramReady || emailReady,
      lastSentAt: alerts.lastSentAt,
      lastDelivered: alerts.lastDelivered,
    },
    facebook: {
      active: Boolean(facebook?.isActive),
      pageIdPresent: Boolean(facebook?.pageId?.trim()),
      pageTokenPresent: Boolean(facebook?.accessToken?.trim()),
      appIdPresent: Boolean(process.env.META_APP_ID?.trim()),
      appSecretPresent: Boolean(process.env.META_APP_SECRET?.trim()),
      verifyTokenPresent: Boolean(process.env.META_WEBHOOK_VERIFY_TOKEN?.trim()),
    },
    metaAds: {
      configured: Boolean(
        metaAds?.isActive && metaAds.accessToken?.trim() && normalizeMetaAdAccountId(metaAds.pageId),
      ),
      lastSyncAt: metaAds?.lastSyncAt || null,
      lastSyncSince: metaSync.lastSyncSince,
      lastSyncUntil: metaSync.lastSyncUntil,
    },
    latestExternalLead: latestExternalLead
      ? {
          id: latestExternalLead.id,
          name: latestExternalLead.name,
          source: String(latestExternalLead.source),
          status: String(latestExternalLead.status),
          createdAt: latestExternalLead.createdAt,
          phonePresent: Boolean(latestExternalLead.phone?.trim()),
        }
      : null,
    latestSmsActivityAt: latestSmsActivity?.createdAt || null,
  });
}
