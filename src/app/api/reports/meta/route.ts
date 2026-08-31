import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/guard";
import { inDollars } from "@/lib/money";
import { loadMetaCampaignReport } from "@/lib/meta-report";

/** Owner-only Meta Lead Ads outcome report. Spend is intentionally not allocated here. */
export async function GET(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const { tenantId } = guard.identity;

  const { searchParams } = new URL(req.url);
  const year = Number(searchParams.get("year") || new Date().getFullYear());
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return NextResponse.json({ error: "That year is outside the books" }, { status: 400 });
  }

  const rawMonth = searchParams.get("month");
  const month = rawMonth ? Number(rawMonth) : null;
  if (month !== null && !(Number.isInteger(month) && month >= 1 && month <= 12)) {
    return NextResponse.json({ error: "Pick a month from the list" }, { status: 400 });
  }

  return NextResponse.json(inDollars(await loadMetaCampaignReport(tenantId, { year, month })));
}
