import { prisma } from "@/lib/prisma";
import { sendSms, SmsProviderError, twilioConfig } from "@/lib/sms";
import { smsTemplate } from "@/lib/sms-templates";
import { leadTaskMarker } from "@/lib/lead-sales";

export type LeadAutomationSettings = {
  instantAck: boolean;
  slaCallback: boolean;
  followUps: boolean;
  slaMinutes: number;
  firstFollowUpMinutes: number;
  finalFollowUpMinutes: number;
};

const DEFAULTS: LeadAutomationSettings = {
  instantAck: false,
  slaCallback: false,
  followUps: false,
  slaMinutes: 5,
  firstFollowUpMinutes: 120,
  finalFollowUpMinutes: 24 * 60,
};

const STEPS = ["NO_REPLY_2H", "NO_REPLY_24H"] as const;
export type LeadAutomationStep = (typeof STEPS)[number];

function parseJson(raw: string | null | undefined): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function boundedMinutes(raw: unknown, fallback: number, min: number, max: number): number {
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

/**
 * SMS config used to be a bare phone string. Automation is stored beside the number now,
 * but this reader keeps every older workspace valid and defaults every automatic send OFF.
 */
export function leadAutomationSettings(rawConfig: string | null | undefined): LeadAutomationSettings {
  const value = parseJson(rawConfig);
  if (!value || typeof value !== "object") return { ...DEFAULTS };
  const automation = (value as { automation?: unknown }).automation;
  if (!automation || typeof automation !== "object") return { ...DEFAULTS };
  const input = automation as Record<string, unknown>;
  return {
    instantAck: input.instantAck === true,
    slaCallback: input.slaCallback === true,
    followUps: input.followUps === true,
    slaMinutes: boundedMinutes(input.slaMinutes, DEFAULTS.slaMinutes, 1, 60),
    firstFollowUpMinutes: boundedMinutes(input.firstFollowUpMinutes, DEFAULTS.firstFollowUpMinutes, 15, 24 * 60),
    finalFollowUpMinutes: boundedMinutes(input.finalFollowUpMinutes, DEFAULTS.finalFollowUpMinutes, 60, 7 * 24 * 60),
  };
}

export function automationTaskMarker(step: LeadAutomationStep): string {
  return `[[AUTOMATION:${step}]]`;
}

export function parseAutomationTask(description: string | null): { step: LeadAutomationStep; leadId: string } | null {
  if (!description) return null;
  const step = /^\[\[AUTOMATION:([^\]]+)\]\]/.exec(description)?.[1];
  const leadId = /\[\[LEAD:([^\]]+)\]\]/.exec(description)?.[1];
  if (!leadId || !step || !(STEPS as readonly string[]).includes(step)) return null;
  return { step: step as LeadAutomationStep, leadId };
}

export async function cancelLeadAutomations(tenantId: string, leadId: string): Promise<number> {
  const changed = await prisma.task.updateMany({
    where: {
      tenantId,
      status: { in: ["TODO", "IN_PROGRESS"] },
      description: { startsWith: "[[AUTOMATION:", contains: leadTaskMarker(leadId) },
    },
    data: { status: "DONE" },
  });
  return changed.count;
}

async function smsConsent(tenantId: string, leadId: string): Promise<"STOP" | "START" | null> {
  const latest = await prisma.auditLog.findFirst({
    where: {
      tenantId,
      entity: "Lead",
      entityId: leadId,
      action: { in: ["lead.activity.sms_opt_out", "lead.activity.sms_opt_in"] },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { action: true },
  });
  if (!latest) return null;
  return latest.action === "lead.activity.sms_opt_out" ? "STOP" : "START";
}

async function automationActor(tenantId: string, assignedToId: string | null) {
  if (assignedToId) {
    const assigned = await prisma.user.findFirst({
      where: { id: assignedToId, tenantId, approved: true },
      select: { id: true, name: true },
    });
    if (assigned) return assigned;
  }
  return prisma.user.findFirst({
    where: { tenantId, role: "ADMIN", approved: true },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true },
  });
}

async function automationEvent(input: {
  tenantId: string;
  leadId: string;
  action: string;
  summary: string;
  meta?: Record<string, unknown>;
}) {
  await prisma.auditLog.create({
    data: {
      tenantId: input.tenantId,
      actorId: "system:lead-automation",
      actorName: "Lead automation",
      action: input.action,
      entity: "Lead",
      entityId: input.leadId,
      summary: input.summary,
      meta: input.meta ? JSON.stringify(input.meta) : null,
    },
  });
}

async function taskExists(tenantId: string, leadId: string, marker: string) {
  return prisma.task.findFirst({
    where: {
      tenantId,
      description: { contains: marker },
      AND: { description: { contains: leadTaskMarker(leadId) } },
    },
    select: { id: true },
  });
}

/**
 * Called after a non-manual lead is saved. It is intentionally at-most-once for the
 * instant acknowledgement: an audit claim is written BEFORE the provider call, so a
 * process crash can lose an acknowledgement but can never text the customer twice on a
 * retry. The due sequence lives in Task, not a timer, and therefore survives deploys.
 */
export async function startLeadAutomation(tenantId: string, leadId: string): Promise<void> {
  try {
    const [lead, integration] = await Promise.all([
      prisma.lead.findFirst({
        where: { id: leadId, tenantId },
        select: {
          id: true,
          name: true,
          phone: true,
          source: true,
          status: true,
          assignedToId: true,
          createdAt: true,
          tenant: { select: { businessName: true } },
        },
      }),
      prisma.channelIntegration.findUnique({
        where: { tenantId_channel: { tenantId, channel: "SMS" } },
      }),
    ]);
    if (!lead || lead.source === "MANUAL" || lead.status !== "NEW" || !lead.phone) return;

    const settings = leadAutomationSettings(integration?.config);
    if (!settings.instantAck && !settings.slaCallback && !settings.followUps) return;

    const config = twilioConfig(integration);
    if (!config) return;
    if ((await smsConsent(tenantId, lead.id)) === "STOP") return;

    const actor = await automationActor(tenantId, lead.assignedToId);
    if (!actor) return;

    if (settings.instantAck) {
      const claimed = await prisma.auditLog.findFirst({
        where: {
          tenantId,
          entity: "Lead",
          entityId: lead.id,
          action: "lead.automation.ack_claimed",
        },
        select: { id: true },
      });

      if (!claimed) {
        // Reservation before the external call. A duplicate webhook or process retry sees
        // this and refuses to send a second acknowledgement.
        await automationEvent({
          tenantId,
          leadId: lead.id,
          action: "lead.automation.ack_claimed",
          summary: `Automatic acknowledgement reserved for ${lead.name}`,
        });

        const template = smsTemplate("ACKNOWLEDGEMENT", {
          leadName: lead.name,
          businessName: lead.tenant.businessName,
        });
        if (template) {
          try {
            const sent = await sendSms(config, lead.phone, template.message, {
              baseUrl: process.env.TWILIO_API_BASE || undefined,
            });
            await automationEvent({
              tenantId,
              leadId: lead.id,
              action: "lead.automation.ack_sent",
              summary: `Automatic acknowledgement sent to ${lead.name}`,
              meta: {
                provider: sent.provider,
                providerMessageId: sent.id,
                providerStatus: sent.status,
                templateId: template.id,
                message: template.message,
              },
            });
          } catch (err) {
            const provider = err instanceof SmsProviderError ? err : null;
            await automationEvent({
              tenantId,
              leadId: lead.id,
              action: "lead.automation.ack_failed",
              summary: `Automatic acknowledgement to ${lead.name} failed`,
              meta: { providerCode: provider?.code ?? null, error: provider?.message ?? "send failed" },
            });
          }
        }
      }
    }

    if (settings.slaCallback) {
      const marker = "[[SLA:NEW_LEAD]]";
      if (!(await taskExists(tenantId, lead.id, marker))) {
        await prisma.task.create({
          data: {
            tenantId,
            title: `SLA: call new lead — ${lead.name}`,
            description: [leadTaskMarker(lead.id), marker, "No human response recorded yet."].join("\n"),
            assignedToId: actor.id,
            createdById: actor.id,
            dueDate: new Date(lead.createdAt.getTime() + settings.slaMinutes * 60_000),
          },
        });
      }
    }

    if (settings.followUps) {
      const schedule: Array<{ step: LeadAutomationStep; minutes: number }> = [
        { step: "NO_REPLY_2H", minutes: settings.firstFollowUpMinutes },
        { step: "NO_REPLY_24H", minutes: settings.finalFollowUpMinutes },
      ];
      for (const item of schedule) {
        const marker = automationTaskMarker(item.step);
        if (await taskExists(tenantId, lead.id, marker)) continue;
        await prisma.task.create({
          data: {
            tenantId,
            title: `Auto follow-up — ${lead.name}`,
            description: [marker, leadTaskMarker(lead.id), `Step: ${item.step}`].join("\n"),
            assignedToId: actor.id,
            createdById: actor.id,
            dueDate: new Date(lead.createdAt.getTime() + item.minutes * 60_000),
          },
        });
      }
    }
  } catch (err) {
    console.error(`[lead-automation] start failed for ${tenantId}/${leadId}:`, err);
  }
}

function templateForStep(step: LeadAutomationStep) {
  return step === "NO_REPLY_2H" ? "REQUEST_DETAILS" : "LAST_CHECK_IN";
}

export async function processDueLeadAutomations(limit = 50): Promise<{
  found: number;
  sent: number;
  stopped: number;
  failed: number;
}> {
  const now = new Date();
  const tasks = await prisma.task.findMany({
    where: {
      status: "TODO",
      dueDate: { lte: now },
      description: { startsWith: "[[AUTOMATION:" },
    },
    orderBy: { dueDate: "asc" },
    take: Math.min(100, Math.max(1, limit)),
  });

  const result = { found: tasks.length, sent: 0, stopped: 0, failed: 0 };

  for (const task of tasks) {
    const parsed = parseAutomationTask(task.description);
    if (!parsed) {
      await prisma.task.update({ where: { id: task.id }, data: { status: "DONE" } });
      result.stopped += 1;
      continue;
    }

    // Atomic claim: two scheduler calls can see the same row, but only one can turn TODO
    // into IN_PROGRESS and therefore only one is allowed to touch the provider.
    const claim = await prisma.task.updateMany({
      where: { id: task.id, status: "TODO" },
      data: { status: "IN_PROGRESS" },
    });
    if (claim.count !== 1) continue;

    try {
      const [lead, integration, consent] = await Promise.all([
        prisma.lead.findFirst({
          where: { id: parsed.leadId, tenantId: task.tenantId },
          select: {
            id: true,
            name: true,
            phone: true,
            status: true,
            tenant: { select: { businessName: true } },
          },
        }),
        prisma.channelIntegration.findUnique({
          where: { tenantId_channel: { tenantId: task.tenantId, channel: "SMS" } },
        }),
        smsConsent(task.tenantId, parsed.leadId),
      ]);

      const settings = leadAutomationSettings(integration?.config);
      const config = twilioConfig(integration);
      if (!lead || lead.status !== "NEW" || !lead.phone || consent === "STOP" || !settings.followUps || !config) {
        await prisma.task.update({ where: { id: task.id }, data: { status: "DONE" } });
        result.stopped += 1;
        continue;
      }

      // Inbound replies intentionally leave status NEW so the response clock stays honest.
      // They therefore need an explicit stop check in addition to the status gate.
      const customerReply = await prisma.auditLog.findFirst({
        where: {
          tenantId: task.tenantId,
          entity: "Lead",
          entityId: lead.id,
          action: "lead.activity.sms_received",
          createdAt: { gte: task.createdAt },
        },
        select: { id: true },
      });
      if (customerReply) {
        await prisma.task.update({ where: { id: task.id }, data: { status: "DONE" } });
        result.stopped += 1;
        continue;
      }

      const stillClaimed = await prisma.task.findFirst({
        where: { id: task.id, status: "IN_PROGRESS" },
        select: { id: true },
      });
      if (!stillClaimed) {
        result.stopped += 1;
        continue;
      }

      const template = smsTemplate(templateForStep(parsed.step), {
        leadName: lead.name,
        businessName: lead.tenant.businessName,
      });
      if (!template) {
        await prisma.task.update({ where: { id: task.id }, data: { status: "DONE" } });
        result.failed += 1;
        continue;
      }

      const sent = await sendSms(config, lead.phone, template.message, {
        baseUrl: process.env.TWILIO_API_BASE || undefined,
      });
      await automationEvent({
        tenantId: task.tenantId,
        leadId: lead.id,
        action: `lead.automation.${parsed.step.toLowerCase()}_sent`,
        summary: `Automatic follow-up sent to ${lead.name}`,
        meta: {
          step: parsed.step,
          provider: sent.provider,
          providerMessageId: sent.id,
          providerStatus: sent.status,
          templateId: template.id,
          message: template.message,
        },
      });
      await prisma.task.update({ where: { id: task.id }, data: { status: "DONE" } });
      result.sent += 1;
    } catch (err) {
      const provider = err instanceof SmsProviderError ? err : null;
      await automationEvent({
        tenantId: task.tenantId,
        leadId: parsed.leadId,
        action: `lead.automation.${parsed.step.toLowerCase()}_failed`,
        summary: `Automatic lead follow-up failed`,
        meta: { providerCode: provider?.code ?? null, error: provider?.message ?? "automation failed" },
      }).catch(() => {});
      // At-most-once is safer than a duplicate customer text after an uncertain network
      // failure. The human SLA task remains on the Leads desk even when this step dies.
      await prisma.task.update({ where: { id: task.id }, data: { status: "DONE" } }).catch(() => {});
      result.failed += 1;
    }
  }

  return result;
}
