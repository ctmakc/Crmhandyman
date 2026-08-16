import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchFbLead, extractLeadField, verifyFbWebhookSignature } from "@/lib/integrations/facebook";
import { notifyNewLead } from "@/lib/notify";
import { defangStamps } from "@/lib/lead-notes";
import { readTextCapped } from "@/lib/request-body";
import { throttle, throttleVerify, tokenMatches } from "../guard";

/** A lead-ads delivery is a few kilobytes of JSON; this is orders of magnitude over it. */
const MAX_BODY_BYTES = 256 * 1024;

export async function GET(req: NextRequest) {
  const limited = await throttleVerify(req, "facebook");
  if (limited) return limited;

  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && tokenMatches(searchParams.get("hub.verify_token"), process.env.META_WEBHOOK_VERIFY_TOKEN)) {
    return new NextResponse(challenge, { status: 200 });
  }
  return NextResponse.json({ error: "Verification failed" }, { status: 403 });
}

export async function POST(req: NextRequest) {
  const limited = await throttle(req, "facebook");
  if (limited) return limited;

  /**
   * Fails closed, the way .env.example has always described it. While the check was
   * conditional, a deployment that simply left META_APP_SECRET empty accepted invented
   * lead ids from anyone — and each one costs a Graph API call under our own token.
   */
  const secret = process.env.META_APP_SECRET;
  if (!secret) {
    console.warn("[webhook] META_APP_SECRET is unset — Facebook delivery refused");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const rawBody = await readTextCapped(req, MAX_BODY_BYTES);
  if (rawBody === null) return NextResponse.json({ error: "Body too large" }, { status: 413 });

  const signature = req.headers.get("x-hub-signature-256") || "";
  if (!verifyFbWebhookSignature(rawBody, signature, secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
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
        // Resolve tenant strictly by page. The old fallback — «no page id, take the
        // first active Facebook integration» — delivered one company's leads to another.
        if (!pageId) {
          console.warn(`Facebook lead ${leadgenId} arrived without a page id — skipped`);
          continue;
        }

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

        const existing = await prisma.lead.findFirst({ where: { sourceLeadId: leadgenId, tenantId: integration.tenantId } });
        if (existing) continue;

        const created = await prisma.lead.create({
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
            notes: defangStamps(
              extractLeadField(fields, "message") || extractLeadField(fields, "comments") || ""
            ),
            status: "NEW",
          },
        });

        // A Lead Ad form is paid traffic: the call back is the product. Never allowed to
        // fail the delivery — Meta would retry the whole batch over an SMTP hiccup.
        await notifyNewLead(integration.tenantId, created.id);
      } catch (err) {
        console.error("Error processing FB lead:", err);
      }
    }
  }

  return NextResponse.json({ ok: true });
}
