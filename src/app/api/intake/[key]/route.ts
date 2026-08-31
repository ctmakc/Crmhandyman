import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { readTextCapped } from "@/lib/request-body";
import { notifyNewLead } from "@/lib/notify";
import { startLeadAutomation } from "@/lib/lead-automation";
import {
  digestsMatch,
  hashIntakeKey,
  parseIntakePayload,
  phoneDigits,
  renderIntakeNotes,
} from "@/lib/intake";
import { LEAD_SOURCES, choice } from "@/lib/enums";

const DEDUP_WINDOW_DAYS = Number(process.env.LEAD_DEDUP_DAYS || 30);
const MAX_BODY_BYTES = 20_000;
const IP_LIMIT = 10;
const IP_WINDOW_MS = 10 * 60 * 1000;
const KEY_LIMIT = 60;
const KEY_WINDOW_MS = 60 * 60 * 1000;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

function json(body: Record<string, unknown>, status: number, headers?: Record<string, string>) {
  return NextResponse.json(body, { status, headers: { ...CORS, ...headers } });
}

function unknownKey() {
  return json({ ok: false, error: "Unknown intake key" }, 404);
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function POST(req: NextRequest, { params }: { params: { key: string } }) {
  const throttleIp = await rateLimit(`intake:ip:${clientIp(req)}`, IP_LIMIT, IP_WINDOW_MS);
  if (!throttleIp.ok) {
    return json({ ok: false, error: "Too many submissions" }, 429, {
      "Retry-After": String(throttleIp.retryAfter),
    });
  }

  try {
    const digest = hashIntakeKey(params.key ?? "");
    const key = await prisma.intakeKey.findUnique({ where: { keyHash: digest } });
    if (!key || !key.isActive || !digestsMatch(key.keyHash, digest)) return unknownKey();

    const throttleKey = await rateLimit(`intake:key:${key.id}`, KEY_LIMIT, KEY_WINDOW_MS);
    if (!throttleKey.ok) {
      return json({ ok: false, error: "Too many submissions" }, 429, {
        "Retry-After": String(throttleKey.retryAfter),
      });
    }

    const raw = await readTextCapped(req, MAX_BODY_BYTES);
    if (raw === null) {
      return json({ ok: false, error: "That form sent too much — trim the longest answer" }, 413);
    }

    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return json({ ok: false, error: "Expected JSON" }, 400);
    }

    const parsed = parseIntakePayload(body);
    if (!parsed.ok) return json({ ok: false, error: parsed.error }, 422);
    const lead = parsed.lead;

    await prisma.intakeKey.update({
      where: { id: key.id },
      data: { lastUsedAt: new Date() },
    });

    if (lead.externalId) {
      const replay = await prisma.lead.findFirst({
        where: { tenantId: key.tenantId, sourceLeadId: lead.externalId },
        select: { id: true },
      });
      if (replay) return json({ ok: true, deduped: true }, 200);
    }

    const since = new Date(Date.now() - DEDUP_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const recent = await prisma.lead.findMany({
      where: { tenantId: key.tenantId, createdAt: { gte: since } },
      select: { id: true, name: true, phone: true, email: true },
      orderBy: { createdAt: "desc" },
      take: 500,
    });

    const fold = (value: string | null | undefined) =>
      (value ?? "").toLowerCase().replace(/\s+/g, " ").trim();

    const digits = phoneDigits(lead.phone);
    const name = fold(lead.name);
    const twin = recent.find(
      (row) =>
        fold(row.name) === name &&
        ((!!lead.email && row.email?.toLowerCase() === lead.email) ||
          (!!digits && phoneDigits(row.phone) === digits))
    );
    if (twin) return json({ ok: true, deduped: true }, 200);

    const source = choice(LEAD_SOURCES, key.source) ?? "OTHER";

    const created = await prisma.lead.create({
      data: {
        tenantId: key.tenantId,
        name: lead.name,
        phone: lead.phone,
        email: lead.email,
        address: lead.address,
        city: lead.city,
        jobType: lead.jobType,
        source: source as never,
        sourceLeadId: lead.externalId,
        notes: renderIntakeNotes(key.label, lead),
        status: "NEW",
      },
    });

    // Both are post-save side effects. The paid landing gets its 201 immediately; the
    // long-running CRM process delivers the owner alert and customer acknowledgement.
    void notifyNewLead(key.tenantId, created.id);
    void startLeadAutomation(key.tenantId, created.id);

    return json({ ok: true }, 201);
  } catch (error) {
    console.error("Intake failed", error);
    return json({ ok: false, error: "Intake unavailable" }, 500);
  }
}
