import { NextRequest, NextResponse } from "next/server";
import { processDueLeadAutomations } from "@/lib/lead-automation";
import { throttle, tokenMatches } from "../guard";

function bearer(req: NextRequest): string | null {
  const auth = req.headers.get("authorization") || "";
  return auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : req.headers.get("x-cron-secret");
}

/**
 * Durable scheduler door. It lives under /api/webhooks so middleware never asks a cron
 * process for a user session; the route itself is fail-closed on AUTOMATION_CRON_SECRET.
 */
export async function POST(req: NextRequest) {
  const limited = await throttle(req, "lead-automation");
  if (limited) return limited;

  if (!tokenMatches(bearer(req), process.env.AUTOMATION_CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const requested = Number(new URL(req.url).searchParams.get("limit") || 50);
  const limit = Number.isFinite(requested) ? Math.min(100, Math.max(1, Math.floor(requested))) : 50;
  const result = await processDueLeadAutomations(limit);
  return NextResponse.json({ ok: true, ...result });
}
