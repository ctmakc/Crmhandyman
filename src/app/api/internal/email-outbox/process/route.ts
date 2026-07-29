import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { recordAuditEvent, requestIp } from "@/lib/audit";
import { processDueOutboundEmails } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const authorization = req.headers.get("authorization") || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  const expected = Buffer.from(secret, "utf8");
  const provided = Buffer.from(token, "utf8");
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

async function handleProcessRequest(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const requestedLimit = Math.min(
    Math.max(Math.trunc(Number(req.nextUrl.searchParams.get("limit") || 25)), 1),
    100
  );
  try {
    const result = await processDueOutboundEmails(requestedLimit);
    try {
      await recordAuditEvent({
        actor: { type: "SYSTEM", id: "email-outbox-processor", email: null },
        action: "EMAIL_OUTBOX_CRON_PROCESSED",
        targetType: "EMAIL_OUTBOX",
        metadata: { requestedLimit, ...result },
        ipAddress: requestIp(req.headers),
      });
    } catch (auditError) {
      console.error("Unable to audit email outbox processor run", auditError);
    }
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("Email outbox processor failed", error);
    return NextResponse.json({ error: "Email outbox processing failed." }, { status: 500 });
  }
}

export const GET = handleProcessRequest;
export const POST = handleProcessRequest;
