import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyIntakeSignature } from "@/lib/intake-signature";
import { writeAuditEvent } from "@/lib/audit";

export const runtime = "nodejs";

const SOURCES = new Set(["FACEBOOK", "INSTAGRAM", "GOOGLE", "HOMESTARS", "KIJIJI", "EMAIL", "MANUAL", "OTHER"]);

export async function POST(req: NextRequest, { params }: { params: { tenant: string } }) {
  const secret = process.env.LEAD_INTAKE_SIGNING_SECRET ?? "";
  if (!secret) {
    return NextResponse.json({ error: "Lead intake is not configured" }, { status: 503 });
  }

  const rawBody = await req.text();
  const valid = verifyIntakeSignature({
    rawBody,
    timestamp: req.headers.get("x-handyman-timestamp"),
    signature: req.headers.get("x-handyman-signature"),
    secret,
  });
  if (!valid) return NextResponse.json({ error: "Invalid signature" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const externalId = String(body.externalId ?? "").trim();
  const name = String(body.name ?? "").trim();
  const phone = body.phone ? String(body.phone).trim() : null;
  const email = body.email ? String(body.email).trim().toLowerCase() : null;

  if (externalId.length < 6 || externalId.length > 160) {
    return NextResponse.json({ error: "externalId is required (6-160 chars)" }, { status: 400 });
  }
  if (!name || name.length > 160) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  if (!phone && !email) {
    return NextResponse.json({ error: "phone or email is required" }, { status: 400 });
  }

  const tenant = await prisma.tenant.findUnique({ where: { slug: params.tenant } });
  if (!tenant) return NextResponse.json({ error: "Unknown tenant" }, { status: 404 });

  const existing = await prisma.lead.findFirst({
    where: { tenantId: tenant.id, sourceLeadId: externalId },
    select: { id: true, status: true },
  });
  if (existing) return NextResponse.json({ ...existing, duplicate: true }, { status: 200 });

  const requestedSource = String(body.source ?? "OTHER").toUpperCase();
  const source = SOURCES.has(requestedSource) ? requestedSource : "OTHER";

  const lead = await prisma.lead.create({
    data: {
      tenantId: tenant.id,
      name,
      phone,
      email,
      address: body.address ? String(body.address).trim() : null,
      city: body.city ? String(body.city).trim() : null,
      source: source as never,
      sourceLeadId: externalId,
      jobType: body.jobType ? String(body.jobType).trim() : null,
      notes: body.notes ? String(body.notes).slice(0, 4000) : null,
    },
    select: { id: true, status: true, createdAt: true },
  });

  await writeAuditEvent({
    tenantId: tenant.id,
    actorEmail: "signed-intake",
    action: "lead.created.external",
    entityType: "lead",
    entityId: lead.id,
    summary: `External lead received from ${source}`,
    metadata: { source, externalId },
  });

  return NextResponse.json(lead, { status: 201 });
}
