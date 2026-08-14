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
  Empty,
  Field,
  Money,
  Num,
  Readout,
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
 * The column is ordered by the decision it serves. The owner has 400 dollars and one
 * question: where do they go. So the funnel comes first (did the channel produce work),
 * then the pair that answers the question — what went in as advertising and what came
 * back as collected money, printed side by side on two lines of the same weight — and
 * the return between them. The invoiced / costs / margin detail sits below in quiet
 * type, and the bottom line is what the channel left after paying for itself.
 *
 * A server component on purpose: the sheet is read-only, so the money never has to leave
 * cents, cross a JSON boundary in dollars and be converted back to be printed.
 */

const CHART_H = 92;

function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/**
 * A zero is a value, and a value carries no verdict. Emerald on `$0.00 collected` and
 * rose on `$0.00 of job costs` painted five idle channels as five results.
 */
function toneFor(cents: number | null, tone?: string) {
  return cents ? tone : undefined;
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
        <Num className="t-row font-bold text-ink">{value}</Num>
      </div>
      <div className="mt-1 h-1.5 bg-sunk">
        <div className="h-full" style={{ width: `${pct}%`, background: tone }} />
      </div>
    </div>
  );
}

/**
 * A ledger line inside a column: label, dotted leader, money.
 *
 * `cents === null` means the owner has not told the system something — never zero.
 * The line says so in words, because a dash in a column of money reads as «nothing
 * came of it» when the truth is «nobody typed it in».
 */
function Line({
  label,
  cents,
  tone,
  strong,
  quiet,
  nullText = "not set",
}: {
  label: string;
  cents: number | null;
  tone?: string;
  strong?: boolean;
  quiet?: boolean;
  nullText?: string;
}) {
  return (
    <div className="flex items-baseline gap-1.5 py-1">
      <span className="eyebrow shrink-0">{label}</span>
      <span className="dotlead" aria-hidden="true" />
      {cents === null ? (
        /* Kept to ten characters and held on one line. Spelled out («needs the ad
           bill») it either ran over the rule into the next channel or wrapped, and a
           wrapped line pushes every line under it out of step with its neighbours —
           which is the one thing a shelf of columns cannot afford. The sentence
           behind the words is printed once, under the shelf. */
        <span className="eyebrow shrink-0 whitespace-nowrap">{nullText}</span>
      ) : (
        <Money
          cents={cents}
          tone={toneFor(cents, tone)}
          className={
            strong
              ? "t-lede shrink-0 font-bold"
              : quiet
                ? "t-meta shrink-0 text-ink-2"
                : "t-body shrink-0"
          }
        />
      )}
    </div>
  );
}

function ChannelColumn({
  c,
  base,
  spendNull,
}: {
  c: ChannelFunnel;
  base: number;
  /** Why the ad spend is blank: never booked, or booked and not splittable by trade. */
  spendNull: string;
}) {
  return (
    <div className="min-w-[212px] flex-1 border-line px-4 first:pl-0 md:border-l md:first:border-l-0">
      {/* One line, always: a head that wraps in one column and not in the next puts
          every row of that column half a line out of step with its neighbours, and
          reading across the shelf is the only reason the shelf exists. */}
      <div className="t-row truncate font-bold text-ink" title={c.label}>
        {c.label}
      </div>

      <div className="mt-4 space-y-2.5">
        <Step label="Leads" value={c.leads} base={base} tone="var(--slate)" />
        <Step label="Got hold of" value={c.reached} base={base} tone="var(--sky)" />
        <Step label="Jobs" value={c.jobs} base={base} tone="var(--emerald)" />
      </div>

      {/* THE PAIR — what went out as advertising and what came back, on two lines
          of the same weight, with the multiple between them. This is the answer to
          «where do the next 400 dollars go». */}
      <div className="mt-4 border-t border-line pt-2">
        <Line
          label="Ad spend"
          cents={c.adSpendCents}
          tone="var(--rose-ink)"
          strong
          nullText={spendNull}
        />
        <Line
          label="Collected"
          cents={c.collectedCents}
          tone="var(--emerald-ink)"
          strong
        />
        <div className="flex items-baseline gap-1.5 py-1">
          <span className="eyebrow shrink-0">Return</span>
          <span className="dotlead" aria-hidden="true" />
          <span className="eyebrow shrink-0 whitespace-nowrap">
            {c.returnPerAdDollar === null ? (
              spendNull
            ) : (
              <Num className="t-body font-bold text-ink">
                {c.returnPerAdDollar.toFixed(2)}×
              </Num>
            )}
          </span>
        </div>
      </div>

      {/* The working out, in quiet type: where the collected money went. */}
      <div className="mt-3 border-t border-line pt-1.5">
        <Line label="Invoiced" cents={c.invoicedCents} quiet />
        <Line label="Job costs" cents={c.costsCents} tone="var(--rose-ink)" quiet />
        <Line
          label="Margin"
          cents={c.marginCents}
          tone={c.marginCents < 0 ? "var(--rose-ink)" : undefined}
          quiet
        />
      </div>

      {/* The bottom line of the column: what the channel left after paying for itself. */}
      <div className="rule-double mt-1.5 pt-1.5">
        <Line
          label="After ads"
          cents={c.netAfterAdsCents}
          strong
          nullText={spendNull}
          tone={
            c.netAfterAdsCents === null || c.netAfterAdsCents >= 0
              ? "var(--emerald-ink)"
              : "var(--rose-ink)"
          }
        />
      </div>

      {/* Three facts about the phone work behind the money. One per line: the old
          block ran them together and wrapped mid-phrase into «COST / JOB - · 0.00×». */}
      <div className="mt-3 space-y-1.5">
        <div className="eyebrow">
          First reply{" "}
          {c.avgFirstReplyMins === null ? (
            "none yet"
          ) : (
            <span style={{ color: replyTone(c.avgFirstReplyMins) }}>
              {formatDelay(c.avgFirstReplyMins)}
            </span>
          )}
          {c.unanswered > 0 ? (
            <>
              {" · "}
              <span style={{ color: "var(--rose-ink)" }}>
                <Num>{c.unanswered}</Num> never answered
              </span>
            </>
          ) : (
            ""
          )}
        </div>
        <div className="eyebrow">
          Avg ticket{" "}
          {c.avgTicketCents === null ? (
            "none yet"
          ) : (
            <Money cents={c.avgTicketCents} className="t-micro" />
          )}
        </div>
        {/* What a lead and a job cost to buy. They live here, with the other
            per-unit facts, so the block above stays three lines in every column. */}
        {c.cplCents === null ? null : (
          <div className="eyebrow">
            Cost / lead <Money cents={c.cplCents} className="t-micro" />
          </div>
        )}
        {c.cpjCents === null ? null : (
          <div className="eyebrow">
            Cost / job <Money cents={c.cpjCents} className="t-micro" />
          </div>
        )}
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

  /**
   * Ten characters for the blank where the ad spend belongs, and they have to be true:
   * with a trade filter on, the bill IS booked and simply cannot be split between
   * moving and renovation — «not booked» would be a lie. The sentence is under the shelf.
   */
  const spendNull = report.spendBooked && !report.spendShown ? "not split" : "not booked";

  return (
    <div className="space-y-10 pb-24 md:pb-0">
      <PageHead
        eyebrow="Ad spend"
        title="Reports"
        sub="Which channel brought work that got paid for. The count runs to money collected."
      />

      {/* The period bar is its own ruled row rather than a cluster in the header: on a
          phone the four controls and the title were fighting over the same line. */}
      <section>
        <form
          method="GET"
          className="flex flex-wrap items-end gap-2 border-t border-line pt-4"
        >
          <Field id="report-month" label="Month">
            {(f) => (
              <select
                {...f}
                className={`${f.className} mono uppercase tracking-[0.06em]`}
                name="month"
                defaultValue={month ?? ""}
              >
                <option value="">Full year</option>
                {MONTH_NAMES.slice(1).map((m, i) => (
                  <option key={i + 1} value={i + 1}>
                    {m}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field id="report-year" label="Year">
            {(f) => (
              <select {...f} className={`${f.className} mono`} name="year" defaultValue={year}>
                {[year - 2, year - 1, year, year + 1].map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field id="report-vertical" label="Trade">
            {(f) => (
              <select
                {...f}
                className={`${f.className} mono uppercase tracking-[0.06em]`}
                name="vertical"
                defaultValue={vertical}
              >
                <option value="ALL">All trades</option>
                {TRADES.map((t) => (
                  <option key={t} value={t}>
                    {TRADE_LABELS[t]}
                  </option>
                ))}
              </select>
            )}
          </Field>
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
            <div className="eyebrow mt-2">
              <Num>{totals.leads}</Num> leads · <Num>{totals.jobs}</Num> jobs ·{" "}
              <Num>{totals.unanswered}</Num> never answered
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-8">
            <div>
              <div className="eyebrow">Ad spend</div>
              <div className="mt-1.5">
                {totals.adSpendCents === null ? (
                  <span className="eyebrow">{spendNull}</span>
                ) : (
                  <Readout
                    value={formatCents(totals.adSpendCents)}
                    size={22}
                    tone="var(--rose-ink)"
                  />
                )}
              </div>
            </div>
            <div>
              <div className="eyebrow">After ads</div>
              <div className="mt-1.5">
                {totals.netAfterAdsCents === null ? (
                  <span className="eyebrow">{spendNull}</span>
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
        <p className="measure t-body mt-3 text-ink-2">
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
          <div className="eyebrow">No channel has anything to show yet</div>
          <p className="measure t-lede mt-3 text-ink-2">
            This sheet fills itself from work you already do — three things have to be true
            before a channel can be judged.
          </p>
          <ol className="measure mt-5 space-y-4">
            {[
              {
                n: "01",
                title: "Leads carry a channel",
                body: (
                  <>
                    A landing page files leads through its own intake key, and the key
                    decides what they count as —{" "}
                    <Link href="/settings/intake" className="underline underline-offset-4">
                      Settings → Landing intake
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
                    INSTAGRAM, KIJIJI, HOMESTARS, QUIZ). Until that line exists a channel
                    reads &ldquo;not booked&rdquo; where its cost per lead belongs.
                  </>
                ),
              },
            ].map((step) => (
              <li key={step.n} className="flex gap-4 border-t border-line pt-4">
                <Num className="t-body shrink-0 tracking-[0.08em] text-ink-3">{step.n}</Num>
                <div>
                  <div className="t-lede font-bold text-ink">{step.title}</div>
                  <p className="t-body mt-1.5 leading-relaxed text-ink-2">{step.body}</p>
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
              right={
                <span className="eyebrow">
                  {periodLabel}
                  {report.channels.length > 4 ? (
                    <>
                      {" · "}
                      <Num>{report.channels.length}</Num> channels, scroll →
                    </>
                  ) : (
                    ""
                  )}
                </span>
              }
            />
            {report.channels.length === 0 ? (
              <Empty hint="A channel appears here as soon as a lead arrives carrying it, or a job is opened from one.">
                No leads and no jobs · {periodLabel}
              </Empty>
            ) : (
              /* The shelf is wider than the desk once there are six channels, so it
                 carries its own scroller — and says so, and answers the keyboard. */
              <div
                className="overflow-x-auto border-t border-line pt-5"
                role="region"
                aria-label={`Channels for ${periodLabel}`}
                tabIndex={0}
              >
                <div className="flex min-w-full gap-6 md:gap-0">
                  {report.channels.map((c) => (
                    <ChannelColumn
                      key={c.channel}
                      c={c}
                      base={funnelMax}
                      spendNull={spendNull}
                    />
                  ))}
                </div>
              </div>
            )}

            {report.spendBooked ? null : (
              <p className="measure t-body mt-5 text-ink-2">
                Every column reads <span className="mono text-ink">NO AD BILL</span> because
                no advertising is booked yet. Record it in Finance as a cost with no job on
                it, described <span className="mono text-ink">Ad spend: FACEBOOK</span>, and
                the return per dollar fills itself in.
              </p>
            )}
            {report.spendBooked && !report.spendShown ? (
              <p className="measure t-body mt-5 text-ink-2">
                Ad spend is bought per channel and covers every trade at once. Clear the
                trade filter to see cost per lead and what came back after ads.
              </p>
            ) : null}
          </section>

          {/* ============================================================
              THE YEAR STRIP — seasonality. Collected and ad spend share one
              scale, so a month whose rose tick sits above its bar is a month
              the advertising did not pay for itself.
              ============================================================ */}
          <section>
            <LaneHead
              title={`Season · ${year}`}
              right={
                <span className="eyebrow flex items-center gap-3">
                  <span className="flex items-center gap-1.5">
                    <span
                      aria-hidden
                      className="inline-block h-2.5 w-2.5"
                      style={{ background: "var(--emerald)" }}
                    />
                    collected
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span
                      aria-hidden
                      className="inline-block h-[3px] w-3.5"
                      style={{ background: "var(--rose)" }}
                    />
                    ad spend
                  </span>
                </span>
              }
            />
            {stripMax === 0 ? (
              <Empty hint="The strip draws itself from payments and from the advertising bills booked as overhead.">
                No money collected and no ad spend in {year}
              </Empty>
            ) : (
              <div className="border-t border-line pt-4">
                {/* The top of the plot is a number, so a bar's height means something
                    before the label under it is read. It stands outside the scroller:
                    inside it, the phone scrolled the scale off its own chart. */}
                <div className="eyebrow flex items-baseline gap-1.5">
                  <span className="shrink-0">Top of scale</span>
                  <span className="dotlead" aria-hidden="true" />
                  <Money cents={stripMax} className="t-micro shrink-0" />
                </div>
                <div className="mt-2 overflow-x-auto">
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
                            )} collected, ${m.leads} leads, ${
                              m.adSpendCents === null
                                ? "no ad spend booked"
                                : `${formatCents(m.adSpendCents)} on ads`
                            }`}
                          >
                            <div
                              className="absolute inset-x-0 bottom-0"
                              style={{ height: barH, background: "var(--emerald)" }}
                            />
                            {spendH === null ? null : (
                              /* The tick has to read against the bar it crosses and
                                 against the bare deck alike, so it carries a hairline
                                 of deck on both sides — a gap, never a shadow. */
                              <div
                                className="absolute inset-x-0 border-y border-deck"
                                style={{
                                  bottom: spendH,
                                  height: 4,
                                  background: "var(--rose)",
                                }}
                              />
                            )}
                          </div>
                          <div
                            className={`eyebrow mt-1.5 text-center ${
                              lit ? "text-ink" : ""
                            }`}
                          >
                            {MONTH_NAMES[m.month]}
                          </div>
                          <div className="t-micro mono mt-1 text-center text-ink-3">
                            {m.collectedCents > 0 ? formatCents(m.collectedCents) : "—"}
                          </div>
                          <div className="t-micro mono mt-0.5 text-center text-ink-3">
                            {m.leads > 0 ? `${m.leads} leads` : ""}
                          </div>
                        </div>
                      );
                    })}
                  </div>
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
              <Empty hint="A job carries its trade from the job type on the work order, so this splits itself once work is booked.">
                No work to split by trade · {periodLabel}
              </Empty>
            ) : (
              <div className="lane">
                {report.verticals.map((v) => (
                  <div key={v.vertical} className="row">
                    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                      <span className="t-row min-w-[120px] font-bold text-ink">
                        {v.label}
                      </span>
                      <span className="eyebrow">
                        <Num>{v.leads}</Num> leads · <Num>{v.jobs}</Num> jobs · avg ticket{" "}
                        {v.avgTicketCents === null ? (
                          "none yet"
                        ) : (
                          <Money cents={v.avgTicketCents} className="t-micro" />
                        )}
                      </span>
                      <span className="dotlead hidden sm:block" aria-hidden="true" />
                      {/* On a phone the leader is gone, so the money keeps its right
                          margin by pushing itself there instead. */}
                      <span className="ml-auto flex shrink-0 items-baseline gap-3 sm:ml-0">
                        <Money
                          cents={v.collectedCents}
                          tone={toneFor(v.collectedCents, "var(--emerald-ink)")}
                          className="t-lede font-bold"
                        />
                        <span className="eyebrow">
                          margin{" "}
                          <Money
                            cents={v.marginCents}
                            tone={v.marginCents < 0 ? "var(--rose-ink)" : undefined}
                            className="t-micro"
                          />
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
        <section>
          <LaneHead title="Export CSV" right={<span className="eyebrow">{periodLabel}</span>} />
          <div className="border-t border-line pt-4">
            <p className="measure t-body text-ink-2">
              One row per channel, cut to the period and the trade above.
            </p>
            <div className="actions mt-4">
              <a href={`/api/export/channels?${query}`} className={buttonClass("ghost")}>
                Channels
              </a>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
