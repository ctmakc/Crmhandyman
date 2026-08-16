import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyIntakeSignature } from "@/lib/intake-signature";
import { writeAuditEvent } from "@/lib/audit";
import { createInboundLead, type InboundLeadInput } from "@/lib/inbound-leads";
import { consumeRateLimit, rateLimitHeaders, requestIp } from "@/lib/rate-limit";

export const runtime = "nodejs";

const SOURCES = new Set(["FACEBOOK", "INSTAGRAM", "GOOGLE", "HOMESTARS", "KIJIJI", "EMAIL", "MANUAL", "OTHER"]);

export async function POST(req: NextRequest, props: { params: Promise<{ tenant: string }> }) {
  const params = await props.params;
  const secret = process.env.LEAD_INTAKE_SIGNING_SECRET ?? "";
  if (!secret) return NextResponse.json({ error: "Lead intake is not configured" }, { status: 503 });

  const rawBody = await req.text();
  const valid = verifyIntakeSignature({
    rawBody,
    timestamp: req.headers.get("x-handyman-timestamp"),
    signature: req.headers.get("x-handyman-signature"),
    secret,
  });
  if (!valid) return NextResponse.json({ error: "Invalid signature" }, { status: 401 });

  let limit;
  try {
    limit = await consumeRateLimit({
      scope: "signed-intake",
      identifier: `${params.tenant}:${requestIp(req)}`,
      limit: 60,
      windowMs: 60_000,
    });
  } catch (error) {
    console.error("SIGNED_INTAKE_RATE_LIMIT_FAILED", error);
    return NextResponse.json({ error: "Ingress controls unavailable" }, { status: 503 });
  }
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: rateLimitHeaders(limit) });
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400, headers: rateLimitHeaders(limit) });
  }

  const externalId = String(body.externalId ?? "").trim();
  const name = String(body.name ?? "").trim();
  const phone = body.phone ? String(body.phone).trim() : null;
  const email = body.email ? String(body.email).trim().toLowerCase() : null;

  if (externalId.length < 6 || externalId.length > 160) {
    return NextResponse.json({ error: "externalId is required (6-160 chars)" }, { status: 400, headers: rateLimitHeaders(limit) });
  }
  if (!name || name.length > 160) {
    return NextResponse.json({ error: "name is required" }, { status: 400, headers: rateLimitHeaders(limit) });
  }
  if (!phone && !email) {
    return NextResponse.json({ error: "phone or email is required" }, { status: 400, headers: rateLimitHeaders(limit) });
  }

  const tenant = await prisma.tenant.findUnique({ where: { slug: params.tenant }, select: { id: true } });
  if (!tenant) return NextResponse.json({ error: "Unknown tenant" }, { status: 404, headers: rateLimitHeaders(limit) });

  const requestedSource = String(body.source ?? "OTHER").toUpperCase();
  const source = (SOURCES.has(requestedSource) ? requestedSource : "OTHER") as InboundLeadInput["source"];
  const result = await createInboundLead({
    tenantId: tenant.id,
    channel: "SIGNED",
    externalId,
    name,
    phone,
    email,
    address: body.address ? String(body.address).trim().slice(0, 500) : null,
    city: body.city ? String(body.city).trim().slice(0, 160) : null,
    source,
    jobType: body.jobType ? String(body.jobType).trim().slice(0, 200) : null,
    notes: body.notes ? String(body.notes).slice(0, 4000) : null,
  });

  if (!result.duplicate) {
    await writeAuditEvent({
      tenantId: tenant.id,
      actorEmail: "signed-intake",
      action: "lead.created.external",
      entityType: "lead",
      entityId: result.lead.id,
      summary: `External lead received from ${source}`,
      metadata: { source, externalId },
    });
  }

  return NextResponse.json(
    { id: result.lead.id, status: result.lead.status, createdAt: result.lead.createdAt, duplicate: result.duplicate },
    { status: result.duplicate ? 200 : 201, headers: rateLimitHeaders(limit) }
  );
}
