import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { readTextCapped } from "@/lib/request-body";
import {
  digestsMatch,
  hashIntakeKey,
  parseIntakePayload,
  phoneDigits,
  renderIntakeNotes,
} from "@/lib/intake";

/**
 * POST /api/intake/<key> — the contractor's own landing pages post here.
 *
 * The tenant comes from the key and from nowhere else: a body field would let any
 * visitor of any landing page file leads into a competitor's desk.
 */

/** A repeat submission inside this window is the same enquiry — shared with the mail hook. */
const DEDUP_WINDOW_DAYS = Number(process.env.LEAD_DEDUP_DAYS || 30);

/** The Korvex handler caps its own body at 20 KB; a quiz answer set never approaches it. */
const MAX_BODY_BYTES = 20_000;

/** One visitor filling the form eleven times in ten minutes is a script. */
const IP_LIMIT = 10;
const IP_WINDOW_MS = 10 * 60 * 1000;

/** A landing under paid traffic; sixty leads an hour from one page is an attack, not a sale. */
const KEY_LIMIT = 60;
const KEY_WINDOW_MS = 60 * 60 * 1000;

/** Lead.source is an enum; a key configured with anything else lands in OTHER. */
const LEAD_SOURCES = new Set([
  "FACEBOOK",
  "INSTAGRAM",
  "GOOGLE",
  "HOMESTARS",
  "KIJIJI",
  "EMAIL",
  "MANUAL",
  "OTHER",
]);

/** Browsers preflight a cross-origin POST from a landing page on another domain. */
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

function json(body: Record<string, unknown>, status: number, headers?: Record<string, string>) {
  return NextResponse.json(body, { status, headers: { ...CORS, ...headers } });
}

/** A revoked key and an invented one answer identically — probing must teach nothing. */
function unknownKey() {
  return json({ ok: false, error: "Unknown intake key" }, 404);
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function POST(req: NextRequest, { params }: { params: { key: string } }) {
  const throttleIp = rateLimit(`intake:ip:${clientIp(req)}`, IP_LIMIT, IP_WINDOW_MS);
  if (!throttleIp.ok) {
    return json({ ok: false, error: "Too many submissions" }, 429, {
      "Retry-After": String(throttleIp.retryAfter),
    });
  }

  try {
    const digest = hashIntakeKey(params.key ?? "");
    const key = await prisma.intakeKey.findUnique({ where: { keyHash: digest } });
    if (!key || !key.isActive || !digestsMatch(key.keyHash, digest)) return unknownKey();

    const throttleKey = rateLimit(`intake:key:${key.id}`, KEY_LIMIT, KEY_WINDOW_MS);
    if (!throttleKey.ok) {
      return json({ ok: false, error: "Too many submissions" }, 429, {
        "Retry-After": String(throttleKey.retryAfter),
      });
    }

    // Capped while reading, not after: buffering the whole body first turned a public
    // endpoint into free memory for anyone who could send a large POST.
    const raw = await readTextCapped(req, MAX_BODY_BYTES);
    if (raw === null) {
      return json({ ok: false, error: "Payload too large" }, 413);
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

    // Stamped whenever the key carries a well-formed lead, duplicates included: the owner
    // is asking «is this channel still alive», and a re-send proves the wire works.
    await prisma.intakeKey.update({
      where: { id: key.id },
      data: { lastUsedAt: new Date() },
    });

    // The Beaver quiz parks failed submissions in localStorage and replays them later.
    // Its event_id is per submission, so an exact match is literally the same form.
    if (lead.externalId) {
      const replay = await prisma.lead.findFirst({
        where: { tenantId: key.tenantId, sourceLeadId: lead.externalId },
        select: { id: true },
      });
      if (replay) return json({ ok: true, deduped: true }, 200);
    }

    // Same person inside the window is the same enquiry; past it, a returning customer is
    // new work. Phone formats differ between the landing and the desk, so the comparison
    // runs on digits over the recent slice rather than on a stored string.
    const since = new Date(Date.now() - DEDUP_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const recent = await prisma.lead.findMany({
      where: { tenantId: key.tenantId, createdAt: { gte: since } },
      select: { id: true, phone: true, email: true },
      orderBy: { createdAt: "desc" },
      take: 500,
    });
    const digits = phoneDigits(lead.phone);
    const twin = recent.find(
      (row) =>
        (!!lead.email && row.email?.toLowerCase() === lead.email) ||
        (!!digits && phoneDigits(row.phone) === digits)
    );
    if (twin) return json({ ok: true, deduped: true }, 200);

    const source = LEAD_SOURCES.has(key.source) ? key.source : "OTHER";

    await prisma.lead.create({
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

    return json({ ok: true }, 201);
  } catch (error) {
    // The visitor is looking at a thank-you screen; our trouble stays on our side.
    console.error("Intake failed", error);
    return json({ ok: false, error: "Intake unavailable" }, 500);
  }
}
