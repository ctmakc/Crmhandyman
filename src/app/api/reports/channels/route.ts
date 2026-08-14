import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/guard";
import { inDollars } from "@/lib/money";
import { loadChannelReport, type VerticalFilter } from "@/lib/attribution";
import { TRADES } from "@/lib/price-book";

/**
 * GET /api/reports/channels?year=2026&month=8&vertical=MOVING
 *
 * Which channel brought work that got paid for. Owner-only for the same reason the books
 * are: it carries collected money, margin and what the shop pays for traffic.
 */
export async function GET(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const { tenantId } = guard.identity;

  const { searchParams } = new URL(req.url);
  const year = Number(searchParams.get("year") || new Date().getFullYear());
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return NextResponse.json({ error: "That year is outside the books" }, { status: 400 });
  }

  const monthParam = searchParams.get("month");
  const month = monthParam ? Number(monthParam) : null;
  if (month !== null && !(Number.isInteger(month) && month >= 1 && month <= 12)) {
    return NextResponse.json({ error: "Pick a month from the list" }, { status: 400 });
  }

  const verticalParam = searchParams.get("vertical") || "ALL";
  if (verticalParam !== "ALL" && !TRADES.includes(verticalParam as never)) {
    return NextResponse.json({ error: "That trade is not on this desk" }, { status: 400 });
  }

  const report = await loadChannelReport(tenantId, {
    year,
    month,
    vertical: verticalParam as VerticalFilter,
  });

  // The one door out: every `<name>Cents` leaves as `<name>` in dollars.
  return NextResponse.json(inDollars(report));
}
