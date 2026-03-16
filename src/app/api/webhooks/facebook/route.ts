import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchFbLead, extractLeadField, verifyFbWebhookSignature } from "@/lib/integrations/facebook";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.META_WEBHOOK_VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 });
  }
  return NextResponse.json({ error: "Verification failed" }, { status: 403 });
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-hub-signature-256") || "";

  if (process.env.META_APP_SECRET) {
    const valid = verifyFbWebhookSignature(rawBody, signature, process.env.META_APP_SECRET);
    if (!valid) return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let body: { entry?: Array<{ changes?: Array<{ value?: { leadgen_id?: string; page_id?: string } }> }> };
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  for (const entry of body.entry || []) {
    for (const change of entry.changes || []) {
      const leadgenId = change.value?.leadgen_id;
      const pageId = change.value?.page_id;
      if (!leadgenId) continue;

      try {
        // Resolve tenant by pageId
        const integration = pageId
          ? await prisma.channelIntegration.findFirst({ where: { pageId, channel: "FACEBOOK" } })
          : await prisma.channelIntegration.findFirst({ where: { channel: "FACEBOOK", isActive: true } });

        if (!integration?.accessToken || !integration.isActive) continue;

        const leadData = await fetchFbLead(leadgenId, integration.accessToken);
        const fields = leadData.field_data;

        const name =
          extractLeadField(fields, "full_name") ||
          `${extractLeadField(fields, "first_name") || ""} ${extractLeadField(fields, "last_name") || ""}`.trim() ||
          "Unknown";

        const existing = await prisma.lead.findFirst({ where: { sourceLeadId: leadgenId, tenantId: integration.tenantId } });
        if (existing) continue;

        await prisma.lead.create({
          data: {
            tenantId: integration.tenantId,
            name,
            email: extractLeadField(fields, "email"),
            phone: extractLeadField(fields, "phone_number") || extractLeadField(fields, "phone"),
            address: extractLeadField(fields, "street_address"),
            city: extractLeadField(fields, "city"),
            source: "FACEBOOK",
            sourceLeadId: leadgenId,
            jobType: extractLeadField(fields, "job_type") || extractLeadField(fields, "service"),
            notes: extractLeadField(fields, "message") || extractLeadField(fields, "comments"),
            status: "NEW",
          },
        });
      } catch (err) {
        console.error("Error processing FB lead:", err);
      }
    }
  }

  return NextResponse.json({ ok: true });
}
