import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchFbLead, extractLeadField, verifyFbWebhookSignature } from "@/lib/integrations/facebook";
import { consumeRateLimit, rateLimitHeaders, requestIp } from "@/lib/rate-limit";
import { createInboundLead } from "@/lib/inbound-leads";
import { writeAuditEvent } from "@/lib/audit";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");
  const verifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN;

  if (verifyToken && mode === "subscribe" && token === verifyToken) {
    return new NextResponse(challenge, { status: 200 });
  }
  return NextResponse.json({ error: "Verification failed" }, { status: 403 });
}

export async function POST(req: NextRequest) {
  const secret = process.env.META_APP_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Meta webhook verification is not configured" }, { status: 503 });
  }

  const rawBody = await req.text();
  const signature = req.headers.get("x-hub-signature-256") || "";
  if (!verifyFbWebhookSignature(rawBody, signature, secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let limit;
  try {
    limit = await consumeRateLimit({
      scope: "webhook:facebook",
      identifier: requestIp(req),
      limit: 300,
      windowMs: 60_000,
    });
  } catch (error) {
    console.error("FACEBOOK_RATE_LIMIT_FAILED", error);
    return NextResponse.json({ error: "Ingress controls unavailable" }, { status: 503 });
  }
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: rateLimitHeaders(limit) });
  }

  let body: { entry?: Array<{ changes?: Array<{ value?: { leadgen_id?: string; page_id?: string } }> }> };
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400, headers: rateLimitHeaders(limit) });
  }

  for (const entry of body.entry || []) {
    for (const change of entry.changes || []) {
      const leadgenId = change.value?.leadgen_id;
      const pageId = change.value?.page_id;
      if (!leadgenId || !pageId) continue;

      try {
        // Never fall back to an arbitrary active tenant. Meta tells us which page the
        // lead belongs to; only an explicitly configured page may route the event.
        const integration = await prisma.channelIntegration.findFirst({
          where: { pageId, channel: "FACEBOOK", isActive: true },
        });
        if (!integration?.accessToken) continue;

        const leadData = await fetchFbLead(leadgenId, integration.accessToken);
        const fields = leadData.field_data;
        const name =
          extractLeadField(fields, "full_name") ||
          `${extractLeadField(fields, "first_name") || ""} ${extractLeadField(fields, "last_name") || ""}`.trim() ||
          "Unknown";

        const result = await createInboundLead({
          tenantId: integration.tenantId,
          channel: "FACEBOOK",
          externalId: leadgenId,
          name,
          email: extractLeadField(fields, "email"),
          phone: extractLeadField(fields, "phone_number") || extractLeadField(fields, "phone"),
          address: extractLeadField(fields, "street_address"),
          city: extractLeadField(fields, "city"),
          source: "FACEBOOK",
          jobType: extractLeadField(fields, "job_type") || extractLeadField(fields, "service"),
          notes: extractLeadField(fields, "message") || extractLeadField(fields, "comments"),
        });

        if (!result.duplicate) {
          await writeAuditEvent({
            tenantId: integration.tenantId,
            actorEmail: "facebook-webhook",
            action: "lead.created.external",
            entityType: "lead",
            entityId: result.lead.id,
            summary: "Facebook Lead Ads lead received",
            metadata: { leadgenId, pageId },
          });
        }
      } catch (err) {
        console.error("Error processing FB lead:", err);
      }
    }
  }

  return NextResponse.json({ ok: true }, { headers: rateLimitHeaders(limit) });
}
