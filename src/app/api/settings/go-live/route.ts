import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/guard";
import { loadGoLiveReadiness } from "@/lib/go-live-readiness";

export async function GET(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const forwarded = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwarded || req.headers.get("host")?.trim() || null;
  const readiness = await loadGoLiveReadiness(guard.identity.tenantId, { currentHost: host });

  return NextResponse.json(readiness, {
    headers: { "Cache-Control": "no-store" },
  });
}
