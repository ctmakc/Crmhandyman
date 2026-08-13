import Link from "next/link";
import { requireAdminPage } from "@/lib/page-guard";
import { formatCents } from "@/lib/money";
import { MONTH_NAMES } from "@/lib/contracts";
import { TRADES, type Trade } from "@/lib/price-book";
import {
  loadChannelReport,
  formatDelay,
  replyTone,
  TRADE_LABELS,
  type ChannelFunnel,
  type VerticalFilter,
} from "@/lib/attribution";
import {
  PageHead,
  LaneHead,
  Readout,
  Money,
  buttonClass,
} from "@/components/ui/primitives";

/**
 * REPORTS — the media-buy sheet.
 *
 * The device of this screen is the COLUMN: one channel per column, its funnel reading
 * straight down from «leads arrived» to «money collected», so two channels are compared
 * by running the eye across one line. Under it, the year strip answers the other half of
 * the question the owner is really asking — when does this trade actually sell.
 *
 * A server component on purpose: the sheet is read-only, so the money never has to leave
 * cents, cross a JSON boundary in dollars and be converted back to be printed.
 */

const CHART_H = 92;

function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/** A funnel step: the count, and a bar showing what survived from the step above. */
function Step({
  label,
  value,
  base,
  tone,
}: {
  label: string;
  value: number;
  base: number;
  tone: string;
}) {
  const pct = base > 0 ? Math.min(100, Math.round((value / base) * 100)) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="eyebrow">{label}</span>
        <span className="mono text-[15px] font-bold tabular-nums text-ink">{value}</span>
      </div>
      <div className="mt-1 h-1.5 bg-sunk">
        <div className="h-full" style={{ width: `${pct}%`, background: tone }} />
      </div>
    </div>
  );
}

/** A ledger line inside a column: label, dotted leader, money. */
function Line({
  label,
  cents,
  tone,
  strong,
}: {
  label: string;
  cents: number | null;
  tone?: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-1.5 py-1">
      <span className="eyebrow shrink-0">{label}</span>
      <span className="dotlead" aria-hidden="true" />
      {cents === null ? (
        <span className="mono shrink-0 text-[11px] uppercase tracking-[0.06em] text-ink-3">
          not set
        </span>
      ) : (
        <Money
          cents={cents}
          tone={tone}
          className={strong ? "shrink-0 text-[14px] font-bold" : "shrink-0 text-[13px]"}
        />
      )}
    </div>
  );
}

function ChannelColumn({ c, base }: { c: ChannelFunnel; base: number }) {
  return (
    <div className="min-w-[210px] flex-1 border-line px-4 first:pl-0 md:border-l md:first:border-l-0">
      <div className="text-[15px] font-bold leading-tight text-ink">{c.label}</div>
      <div className="mono mt-1.5 text-[11px] uppercase tracking-[0.07em] text-ink-3">
        {c.adSpendCents === null ? (
          "Ad spend not set"
        ) : (
          <>
            {formatCents(c.adSpendCents)} ads
            {c.cplCents !== null ? ` · ${formatCents(c.cplCents)} / lead` : ""}
          </>
        )}
      </div>

      <div className="mt-4 space-y-2.5">
        <Step label="Leads" value={c.leads} base={base} tone="var(--slate)" />
        <Step label="Reached" value={c.reached} base={base} tone="var(--sky)" />
        <Step label="Jobs" value={c.jobs} base={base} tone="var(--emerald)" />
      </div>

      <div className="mt-4 border-t border-line pt-1.5">
        <Line label="Invoiced" cents={c.invoicedCents} />
        <Line label="Collected" cents={c.collectedCents} tone="var(--emerald-ink)" />
        <Line label="Job costs" cents={c.costsCents} tone="var(--rose-ink)" />
        <Line label="Margin" cents={c.marginCents} />
      </div>

      {/* The bottom line of the column: what the channel left after paying for itself. */}
      <div className="rule-double mt-1.5 pt-1.5">
        <Line
          label="After ads"
          cents={c.netAfterAdsCents}
          strong
          tone={
            c.netAfterAdsCents === null
              ? undefined
              : c.netAfterAdsCents >= 0
                ? "var(--emerald-ink)"
                : "var(--rose-ink)"
          }
        />
      </div>

      <div className="mono mt-3 space-y-1 text-[11px] uppercase tracking-[0.07em] text-ink-3">
        <div>
          First reply{" "}
          <span style={{ color: replyTone(c.avgFirstReplyMins) }}>
            {formatDelay(c.avgFirstReplyMins)}
          </span>
          {c.unanswered > 0 ? ` · ${c.unanswered} unanswered` : ""}
        </div>
        <div>
          Avg ticket {c.avgTicketCents === null ? "—" : formatCents(c.avgTicketCents)}
        </div>
        <div>
          Cost / job {c.cpjCents === null ? "—" : formatCents(c.cpjCents)}
          {c.returnPerAdDollar !== null
            ? ` · ${c.returnPerAdDollar.toFixed(2)}× on ads`
            : ""}
        </div>
      </div>
    </div>
  );
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  // The rail hides this screen from the crew and the layout redirects them; the identity
  // is read again here because every query below is scoped by it.
  const { tenantId } = await requireAdminPage();

  const now = new Date();
  const yearRaw = Number(one(searchParams.year));
  const year =
    Number.isInteger(yearRaw) && yearRaw >= 2000 && yearRaw <= 2100
      ? yearRaw
      : now.getFullYear();

  const monthRaw = Number(one(searchParams.month));
  const month = Number.isInteger(monthRaw) && monthRaw >= 1 && monthRaw <= 12 ? monthRaw : null;

  const verticalRaw = one(searchParams.vertical) ?? "ALL";
  const vertical: VerticalFilter = TRADES.includes(verticalRaw as Trade)
    ? (verticalRaw as Trade)
    : "ALL";

  const report = await loadChannelReport(tenantId, { year, month, vertical });
  const { totals } = report;

  const periodLabel = month ? `${MONTH_NAMES[month]} ${year}` : `Full year ${year}`;
  const query = `year=${year}${month ? `&month=${month}` : ""}${
    vertical === "ALL" ? "" : `&vertical=${vertical}`
  }`;

  // Nothing has ever been attributed: no leads, no jobs, no ad spend booked.
  const cold = totals.leads === 0 && totals.jobs === 0 && !report.spendBooked;

  // One scale for the whole strip — collected and ad spend are the same dollars, so the
  // spend tick sits directly under the bar it has to be cleared by.
  const stripMax = report.months.reduce(
    (max, m) => Math.max(max, m.collectedCents, m.adSpendCents ?? 0),
    0
  );

  // ONE scale across the columns as well. Measuring each funnel against its own top step
  // drew the same bar for two leads and for six, and the columns sit side by side —
  // whichever channel is biggest sets the width for all of them.
  const funnelMax = report.channels.reduce((max, c) => Math.max(max, c.leads, c.jobs), 0);

  return (
    <div className="space-y-10 pb-24 md:pb-0">
      <PageHead
        eyebrow="Media buy"
        title="Reports"
        sub="Which channel brought work that got paid for — measured to money collected, never to money billed."
      />

      {/* The period bar is its own ruled row rather than a cluster in the header: on a
          phone the four controls and the title were fighting over the same line. */}
      <section>
        <form method="GET" className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
          <select
            name="month"
            defaultValue={month ?? ""}
            className="mono px-2.5 py-2 text-[12px] uppercase tracking-[0.06em]"
            aria-label="Month"
          >
            <option value="">Full year</option>
            {MONTH_NAMES.slice(1).map((m, i) => (
              <option key={i + 1} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
          <select
            name="year"
            defaultValue={year}
            className="mono px-2.5 py-2 text-[12px]"
            aria-label="Year"
          >
            {[year - 2, year - 1, year, year + 1].map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <select
            name="vertical"
            defaultValue={vertical}
            className="mono px-2.5 py-2 text-[12px] uppercase tracking-[0.06em]"
            aria-label="Trade"
          >
            <option value="ALL">All trades</option>
            {TRADES.map((t) => (
              <option key={t} value={t}>
                {TRADE_LABELS[t]}
              </option>
            ))}
          </select>
          <button type="submit" className={buttonClass("ghost")}>
            Show
          </button>
        </form>
      </section>

      {/* ================================================================
          THE TOP LINE — the period's answer in one readout, with what it
          cost to buy it standing beside it.
          ================================================================ */}
      <section>
        <div className="rule-double flex flex-wrap items-end justify-between gap-6 pt-4">
          <div>
            <div className="eyebrow">Collected · {periodLabel}</div>
            <div className="mono mt-2 text-[11px] uppercase tracking-[0.08em] text-ink-3">
              {totals.leads} leads · {totals.jobs} jobs · {totals.unanswered} never answered
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-8">
            <div>
              <div className="eyebrow">Ad spend</div>
              <div className="mt-1.5">
                {totals.adSpendCents === null ? (
                  <span className="mono text-[13px] uppercase tracking-[0.06em] text-ink-3">
                    not set
                  </span>
                ) : (
                  <Readout value={formatCents(totals.adSpendCents)} size={22} tone="var(--rose-ink)" />
                )}
              </div>
            </div>
            <div>
              <div className="eyebrow">After ads</div>
              <div className="mt-1.5">
                {totals.netAfterAdsCents === null ? (
                  <span className="mono text-[13px] uppercase tracking-[0.06em] text-ink-3">
                    —
                  </span>
                ) : (
                  <Readout
                    value={formatCents(totals.netAfterAdsCents)}
                    size={22}
                    tone={
                      totals.netAfterAdsCents >= 0 ? "var(--emerald-ink)" : "var(--rose-ink)"
                    }
                  />
                )}
              </div>
            </div>
            <Readout
              value={formatCents(totals.collectedCents)}
              size={30}
              tone={totals.collectedCents > 0 ? "var(--emerald-ink)" : "var(--ink-2)"}
            />
          </div>
        </div>
        <p className="mt-3 max-w-[70ch] text-[13px] text-ink-2">
          Money follows the lead it came from, so a job sold in{" "}
          {month ? `${MONTH_NAMES[month]} ${year}` : year} and paid later still counts here.
          A recent period keeps filling up for weeks.
        </p>
      </section>

      {cold ? (
        /* ==============================================================
           THE COLD START — a new shop opens this screen on day one and
           has to be told exactly what makes a column appear.
           ============================================================== */
        <section className="border-t border-line pt-6">
          <div className="eyebrow">Nothing to attribute yet</div>
          <p className="mt-3 max-w-[62ch] text-[14px] text-ink-2">
            This sheet fills itself from work you already do — three things have to be true
            before a channel can be judged.
          </p>
          <ol className="mt-5 max-w-[62ch] space-y-4">
            {[
              {
                n: "01",
                title: "Leads carry a channel",
                body: (
                  <>
                    A landing page files leads through its own intake key, and the key
                    decides what they count as —{" "}
                    <Link href="/settings/intake" className="underline underline-offset-4">
                      Settings → Lead intake
                    </Link>
                    . A lead typed at the desk carries whatever source you pick on the{" "}
                    <Link href="/leads" className="underline underline-offset-4">
                      lead sheet
                    </Link>
                    .
                  </>
                ),
              },
              {
                n: "02",
                title: "Jobs get invoiced and paid",
                body: (
                  <>
                    The funnel is measured to money collected, so a channel starts showing a
                    return once payments land against its jobs.
                  </>
                ),
              },
              {
                n: "03",
                title: "Ad spend is booked as overhead",
                body: (
                  <>
                    In{" "}
                    <Link href="/finance" className="underline underline-offset-4">
                      Finance → Cost out
                    </Link>
                    , leave the job empty and write the description{" "}
                    <span className="mono text-ink">Ad spend: FACEBOOK</span> (or GOOGLE,
                    INSTAGRAM, KIJIJI, HOMESTARS, QUIZ). Until then cost per lead reads
                    «not set» rather than zero.
                  </>
                ),
              },
            ].map((step) => (
              <li key={step.n} className="flex gap-4 border-t border-line pt-4">
                <span className="mono shrink-0 text-[13px] tracking-[0.08em] text-ink-3">
                  {step.n}
                </span>
                <div>
                  <div className="text-[14px] font-bold text-ink">{step.title}</div>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      ) : (
        <>
          {/* ============================================================
              THE COLUMNS — one channel each, funnel reading top to bottom.
              ============================================================ */}
          <section>
            <LaneHead
              title="Channels"
              right={<span className="eyebrow">{periodLabel}</span>}
            />
            {report.channels.length === 0 ? (
              <div className="border-t border-line py-9 text-center">
                <p className="eyebrow">No leads and no jobs in this period</p>
              </div>
            ) : (
              <div className="overflow-x-auto border-t border-line pt-5">
                <div className="flex min-w-full gap-6 md:gap-0">
                  {report.channels.map((c) => (
                    <ChannelColumn key={c.channel} c={c} base={funnelMax} />
                  ))}
                </div>
              </div>
            )}

            {report.spendBooked ? null : (
              <p className="mono mt-5 max-w-[74ch] text-[11px] uppercase leading-relaxed tracking-[0.06em] text-ink-3">
                No ad spend booked. Record it in Finance as a cost with no job, described
                «Ad spend: FACEBOOK» — cost per lead stays «not set» until then.
              </p>
            )}
            {report.spendBooked && !report.spendShown ? (
              <p className="mono mt-5 max-w-[74ch] text-[11px] uppercase leading-relaxed tracking-[0.06em] text-ink-3">
                Ad spend is bought per channel, not per trade. Clear the trade filter to see
                cost per lead and what came back after ads.
              </p>
            ) : null}
          </section>

          {/* ============================================================
              THE YEAR STRIP — seasonality. Collected and ad spend share one
              scale, so a month whose amber tick sits above its bar is a month
              the advertising did not pay for itself.
              ============================================================ */}
          <section>
            <LaneHead
              title={`Season · ${year}`}
              right={
                <span className="mono flex items-center gap-3 text-[10px] uppercase tracking-[0.08em] text-ink-3">
                  <span className="flex items-center gap-1.5">
                    <span
                      className="inline-block h-2.5 w-2.5"
                      style={{ background: "var(--emerald)" }}
                    />
                    collected
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span
                      className="inline-block h-[3px] w-3.5"
                      style={{ background: "var(--rose)" }}
                    />
                    ad spend
                  </span>
                </span>
              }
            />
            {stripMax === 0 ? (
              <div className="border-t border-line py-9 text-center">
                <p className="eyebrow">No money collected and no ad spend in {year}</p>
              </div>
            ) : (
              <div className="overflow-x-auto border-t border-line pt-5">
                <div className="flex min-w-[640px] items-end gap-1.5 border-b border-line">
                  {report.months.map((m) => {
                    const barH = Math.round((m.collectedCents / stripMax) * CHART_H);
                    const spendH =
                      m.adSpendCents === null
                        ? null
                        : Math.round((m.adSpendCents / stripMax) * CHART_H);
                    const lit = month === m.month;
                    return (
                      <div key={m.month} className="flex-1">
                        {/* No plotting frame: the bars stand on the rule under the row, so
                            a month with nothing in it is empty rather than grey. */}
                        <div
                          className={`relative w-full ${lit ? "today-glow" : ""}`}
                          style={{ height: CHART_H }}
                          title={`${MONTH_NAMES[m.month]}: ${formatCents(
                            m.collectedCents
                          )} collected, ${m.leads} leads`}
                        >
                          <div
                            className="absolute inset-x-0 bottom-0"
                            style={{ height: barH, background: "var(--emerald)" }}
                          />
                          {spendH === null ? null : (
                            <div
                              className="absolute inset-x-0"
                              style={{
                                bottom: spendH,
                                height: 2,
                                background: "var(--rose)",
                              }}
                            />
                          )}
                        </div>
                        <div
                          className={`mono mt-1.5 text-center text-[10px] uppercase tracking-[0.06em] ${
                            lit ? "text-ink" : "text-ink-3"
                          }`}
                        >
                          {MONTH_NAMES[m.month]}
                        </div>
                        <div className="mono mt-0.5 text-center text-[10px] tabular-nums text-ink-3">
                          {m.collectedCents > 0 ? formatCents(m.collectedCents) : "—"}
                        </div>
                        <div className="mono text-center text-[10px] tabular-nums text-ink-3">
                          {m.leads > 0 ? `${m.leads} leads` : ""}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </section>

          {/* ============================================================
              BY TRADE — moving against renovation, read off the job type
              the desk already types.
              ============================================================ */}
          <section>
            <LaneHead title="By trade" right={<span className="eyebrow">{periodLabel}</span>} />
            {report.verticals.length === 0 ? (
              <div className="border-t border-line py-9 text-center">
                <p className="eyebrow">No work to split by trade in this period</p>
              </div>
            ) : (
              <div className="lane">
                {report.verticals.map((v) => (
                  <div key={v.vertical} className="row">
                    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                      <span className="min-w-[120px] text-[15px] font-bold text-ink">
                        {v.label}
                      </span>
                      <span className="mono text-[11px] uppercase tracking-[0.07em] text-ink-3">
                        {v.leads} leads · {v.jobs} jobs · avg ticket{" "}
                        {v.avgTicketCents === null ? "—" : formatCents(v.avgTicketCents)}
                      </span>
                      <span className="dotlead" aria-hidden="true" />
                      <span className="shrink-0 text-right">
                        <Money
                          cents={v.collectedCents}
                          tone="var(--emerald-ink)"
                          className="text-[14px] font-bold"
                        />
                        <span className="mono ml-3 text-[11px] uppercase tracking-[0.07em] text-ink-3">
                          margin <Money cents={v.marginCents} className="text-[11px]" />
                        </span>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {/* Straight to the bookkeeper — the period and trade above are what gets exported.
          Nothing to export while the sheet is cold. */}
      {cold ? null : (
        <div className="mono flex flex-wrap items-baseline gap-x-4 gap-y-1 pt-2 text-[11px] uppercase tracking-[0.08em] text-ink-3">
          <span>Export CSV</span>
          <a
            href={`/api/export/channels?${query}`}
            className="underline underline-offset-4 transition-colors duration-[140ms] ease-instrument hover:text-ink"
          >
            channels
          </a>
        </div>
      )}
    </div>
  );
}
