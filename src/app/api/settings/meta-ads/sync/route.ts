import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/guard";
import { inDollars } from "@/lib/money";
import {
  META_ADS_CHANNEL,
  fetchMetaAdSpend,
  normalizeMetaAdAccountId,
  replaceMetaAdSpend,
} from "@/lib/meta-ads";

function dayRange(year: number, month: number | null) {
  const mm = (n: number) => String(n).padStart(2, "0");
  if (month) {
    const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return {
      since: `${year}-${mm(month)}-01`,
      until: `${year}-${mm(month)}-${mm(last)}`,
    };
  }
  return { since: `${year}-01-01`, until: `${year}-12-31` };
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const { tenantId } = guard.identity;

  const body = await req.json().catch(() => ({}));
  const year = Number(body.year ?? new Date().getFullYear());
  const rawMonth = body.month === null || body.month === undefined || body.month === "" ? null : Number(body.month);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return NextResponse.json({ error: "That year is outside the reporting range" }, { status: 400 });
  }
  if (rawMonth !== null && (!Number.isInteger(rawMonth) || rawMonth < 1 || rawMonth > 12)) {
    return NextResponse.json({ error: "Pick a month from 1 to 12" }, { status: 400 });
  }

  const integration = await prisma.channelIntegration.findUnique({
    where: { tenantId_channel: { tenantId, channel: META_ADS_CHANNEL } },
  });
  const accountId = normalizeMetaAdAccountId(integration?.pageId);
  if (!integration?.isActive || !integration.accessToken || !accountId) {
    return NextResponse.json(
      { error: "Configure an active Meta Ads account ID and ads-read token first" },
      { status: 409 },
    );
  }

  const range = dayRange(year, rawMonth);
  try {
    const rows = await fetchMetaAdSpend({
      accountId,
      accessToken: integration.accessToken,
      ...range,
    });
    await replaceMetaAdSpend({ tenantId, accountId, ...range, rows });

    const byCurrency = new Map<string, number>();
    for (const row of rows) {
      byCurrency.set(row.currency, (byCurrency.get(row.currency) ?? 0) + row.spendCents);
    }

    return NextResponse.json(
      inDollars({
        ok: true,
        accountId,
        year,
        month: rawMonth,
        since: range.since,
        until: range.until,
        rows: rows.length,
        // The collection itself is not money; only each item's amountCents is. Keeping
        // the outer key stable makes the client contract `spendByCurrency[].amount`.
        spendByCurrency: Array.from(byCurrency, ([currency, amountCents]) => ({
          currency,
          amountCents,
        })),
      }),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Meta Ads Insights sync failed";
    return NextResponse.json({ error: message.slice(0, 300) }, { status: 502 });
  }
}
