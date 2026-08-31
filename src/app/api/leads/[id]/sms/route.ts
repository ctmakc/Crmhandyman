import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/guard";
import { record } from "@/lib/audit";
import { cancelLeadAutomations } from "@/lib/lead-automation";
import { sendSms, SmsProviderError, twilioConfig } from "@/lib/sms";
import { smsTemplate, smsTemplates } from "@/lib/sms-templates";

function readMeta(meta: string | null): Record<string, unknown> | null {
  if (!meta) return null;
  try {
    return JSON.parse(meta) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function leadConsent(tenantId: string, leadId: string): Promise<"STOP" | "START" | null> {
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

async function smsContext(tenantId: string, leadId: string) {
  const [lead, integration] = await Promise.all([
    prisma.lead.findFirst({
      where: { id: leadId, tenantId },
      select: {
        id: true,
        name: true,
        phone: true,
        status: true,
        tenant: { select: { businessName: true } },
      },
    }),
    prisma.channelIntegration.findUnique({
      where: { tenantId_channel: { tenantId, channel: "SMS" } },
    }),
  ]);
  return { lead, integration, config: twilioConfig(integration) };
}

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireUser();
  if (!guard.ok) return guard.response;
  const { tenantId } = guard.identity;

  const { lead, config } = await smsContext(tenantId, params.id);
  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

  const [history, consent] = await Promise.all([
    prisma.auditLog.findMany({
      where: {
        tenantId,
        entity: "Lead",
        entityId: lead.id,
        action: { startsWith: "lead.activity.sms_" },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 30,
      select: {
        id: true,
        action: true,
        actorName: true,
        summary: true,
        meta: true,
        createdAt: true,
      },
    }),
    leadConsent(tenantId, lead.id),
  ]);

  return NextResponse.json({
    ready: Boolean(config),
    fromNumber: config?.fromNumber ?? null,
    phone: lead.phone ?? null,
    optedOut: consent === "STOP",
    templates: smsTemplates({
      leadName: lead.name,
      businessName: lead.tenant.businessName,
    }),
    history: history.map((entry) => ({ ...entry, meta: readMeta(entry.meta) })),
  });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireUser();
  if (!guard.ok) return guard.response;
  const { id: actorId, tenantId } = guard.identity;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "The SMS body is not valid JSON" }, { status: 400 });
  }

  const { lead, config } = await smsContext(tenantId, params.id);
  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  if (!lead.phone) return NextResponse.json({ error: "This lead has no phone number" }, { status: 400 });
  if (!config) {
    return NextResponse.json(
      { error: "SMS is not configured. Add the Twilio channel in Settings → SMS." },
      { status: 503 },
    );
  }

  const consent = await leadConsent(tenantId, lead.id);
  if (consent === "STOP") {
    return NextResponse.json(
      { error: "This customer opted out of SMS. A START reply is required before another send." },
      { status: 409 },
    );
  }

  const templateId = typeof body.templateId === "string" ? body.templateId : null;
  const template = templateId
    ? smsTemplate(templateId, {
        leadName: lead.name,
        businessName: lead.tenant.businessName,
      })
    : null;
  if (templateId && !template) {
    return NextResponse.json({ error: "Unknown SMS template", field: "templateId" }, { status: 400 });
  }

  const custom = typeof body.message === "string" ? body.message.trim() : "";
  const message = custom || template?.message || "";
  if (!message) return NextResponse.json({ error: "SMS cannot be empty" }, { status: 400 });
  if (message.length > 1600) {
    return NextResponse.json({ error: "SMS cannot exceed 1600 characters" }, { status: 400 });
  }

  try {
    const sent = await sendSms(config, lead.phone, message, {
      baseUrl: process.env.TWILIO_API_BASE || undefined,
    });

    if (lead.status === "NEW") {
      await prisma.lead.updateMany({
        where: { id: lead.id, tenantId, status: "NEW" },
        data: { status: "CONTACTED" },
      });
    }

    // A human has taken ownership of the conversation. Generic no-reply nurture must
    // disappear immediately; promised callback tasks are not automation and stay put.
    await cancelLeadAutomations(tenantId, lead.id);

    await record({
      tenantId,
      actor: { id: actorId },
      action: "lead.activity.sms_sent",
      entity: "Lead",
      entityId: lead.id,
      summary: `SMS sent to ${lead.name}${template ? ` · ${template.label}` : ""}`,
      meta: {
        direction: "OUTBOUND",
        provider: sent.provider,
        providerMessageId: sent.id,
        providerStatus: sent.status,
        from: config.fromNumber,
        to: lead.phone,
        templateId: template?.id ?? null,
        message,
      },
    });

    return NextResponse.json({
      ok: true,
      provider: sent.provider,
      providerMessageId: sent.id,
      status: sent.status,
      leadStatus: lead.status === "NEW" ? "CONTACTED" : lead.status,
    });
  } catch (err) {
    const provider = err instanceof SmsProviderError ? err : null;
    await record({
      tenantId,
      actor: { id: actorId },
      action: "lead.activity.sms_failed",
      entity: "Lead",
      entityId: lead.id,
      summary: `SMS to ${lead.name} failed`,
      meta: {
        direction: "OUTBOUND",
        from: config.fromNumber,
        to: lead.phone,
        templateId: template?.id ?? null,
        message,
        providerCode: provider?.code ?? null,
      },
    });

    return NextResponse.json(
      {
        error: provider?.message || "The SMS provider did not send the message",
        providerCode: provider?.code ?? null,
      },
      { status: provider?.status === 400 ? 400 : 502 },
    );
  }
}
