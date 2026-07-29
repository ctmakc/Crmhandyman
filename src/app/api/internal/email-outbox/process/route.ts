import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
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

  const requestedLimit = Number(req.nextUrl.searchParams.get("limit") || 25);
  try {
    const result = await processDueOutboundEmails(requestedLimit);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("Email outbox processor failed", error);
    return NextResponse.json({ error: "Email outbox processing failed." }, { status: 500 });
  }
}

export const GET = handleProcessRequest;
export const POST = handleProcessRequest;
