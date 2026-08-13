import { prisma } from "@/lib/prisma";
import { jobMoney, type JobMoneyInput } from "@/lib/margin";
import type { Trade } from "@/lib/price-book";

/**
 * WHICH CHANNEL BROUGHT WORK THAT GOT PAID FOR.
 *
 * Korvex spends 300-400 CAD a month on ads and Beaver spends more; the only question
 * worth a screen is which of that came back. So the funnel is measured to COLLECTED and
 * to margin, the same rule the job card lives by (src/lib/margin.ts): money on the street
 * is not a return, and a channel judged on «leads» alone is judged on nothing.
 *
 * THE COHORT IS THE LEAD'S ARRIVAL MONTH. A lead that came in August carries everything
 * that ever happens to it — the job, the invoice, the payment that lands in October — back
 * to August, next to August's ad spend. Cutting the money by payment date instead would
 * compare August's spend against work sold in June, which is the mistake the report exists
 * to prevent. The consequence is stated on the screen: a recent month is still filling up.
 *
 * Every amount here is whole cents (src/lib/money.ts); dollars appear only at the edges —
 * the JSON route, the CSV and the printed screen.
 */

/* ------------------------------------------------------------------------- *
 * Channels
 * ------------------------------------------------------------------------- */

/**
 * The channels a lead can arrive on. Eight are the `LeadSource` enum; `NO_LEAD` is the
 * ninth, synthetic one — a job opened without a lead (walk-in, repeat customer, the
 * owner's phone). It carries no leads and no ad spend, and it is in the report because
 * leaving it out would hide real collected money and make the totals disagree with the
 * books.
 *
 * A landing-page quiz files its leads under whatever its intake key is configured to
 * count as (src/app/api/settings/intake-keys); keys left on the default land in OTHER,
 * which is why OTHER reads as the landing bucket rather than as a shrug.
 */
export const CHANNELS = [
  { key: "FACEBOOK", label: "Facebook" },
  { key: "INSTAGRAM", label: "Instagram" },
  { key: "GOOGLE", label: "Google" },
  { key: "HOMESTARS", label: "HomeStars" },
  { key: "KIJIJI", label: "Kijiji" },
  { key: "EMAIL", label: "Email" },
  { key: "MANUAL", label: "Phone / walk-in" },
  { key: "OTHER", label: "Landing quiz / other" },
  { key: "NO_LEAD", label: "No lead on file" },
] as const;

export type ChannelKey = (typeof CHANNELS)[number]["key"];

const CHANNEL_KEYS = new Set<string>(CHANNELS.map((c) => c.key));

export const channelLabel = (key: string) =>
  CHANNELS.find((c) => c.key === key)?.label ?? key;

/* ------------------------------------------------------------------------- *
 * Ad spend — read out of the expense book, no new table
 * ------------------------------------------------------------------------- */

/**
 * What the owner types in Finance → «Cost out» to book a month of advertising:
 *
 *     Job:         (leave empty — general overhead)
 *     Description: Ad spend: FACEBOOK
 *
 * Two rules, both load-bearing:
 *
 * 1. NO JOB. An ad bill charged to a job is already counted as that job's cost by
 *    `jobMoney`; counting it again as channel spend would take the same dollars out of
 *    the margin twice.
 * 2. THE PREFIX IS THE CONTRACT. Without a marker the report would have to guess which
 *    of the shop's overhead lines is advertising, and a guess here changes the verdict
 *    on a channel.
 *
 * Anything else stays ordinary overhead and never reaches this report.
 */
const AD_SPEND_RE = /^\s*(?:ad|ads|advert|advertising|ad\s*spend|adspend)\s*[:\-–—]\s*(.+)$/i;

/** Spelling the owner is likely to use → the channel it counts as. */
const CHANNEL_ALIASES: Record<string, ChannelKey> = {
  facebook: "FACEBOOK",
  fb: "FACEBOOK",
  meta: "FACEBOOK",
  instagram: "INSTAGRAM",
  ig: "INSTAGRAM",
  google: "GOOGLE",
  adwords: "GOOGLE",
  lsa: "GOOGLE",
  homestars: "HOMESTARS",
  kijiji: "KIJIJI",
  email: "EMAIL",
  newsletter: "EMAIL",
  manual: "MANUAL",
  quiz: "OTHER",
  landing: "OTHER",
  other: "OTHER",
};

/**
 * The channel an overhead line is buying traffic for, or null if the line is not ad spend.
 * Reads the first word after the marker, so «Ad spend: FACEBOOK — August boost» works.
 */
export function adSpendChannel(description: string | null | undefined): ChannelKey | null {
  if (!description) return null;
  const marked = AD_SPEND_RE.exec(description);
  if (!marked) return null;

  const word = marked[1].trim().split(/[\s,;/—–-]+/)[0]?.toLowerCase() ?? "";
  if (CHANNEL_ALIASES[word]) return CHANNEL_ALIASES[word];
  // «Ad spend: FACEBOOK» typed as the enum value itself. NO_LEAD is not a channel
  // anybody can buy traffic on, so it is excluded here.
  const upper = word.toUpperCase();
  return upper !== "NO_LEAD" && CHANNEL_KEYS.has(upper) ? (upper as ChannelKey) : null;
}

/* ------------------------------------------------------------------------- *
 * Verticals
 * ------------------------------------------------------------------------- */

/**
 * MOVING against RENOVATION — the split the two live shops are actually asking about.
 *
 * The trade is READ OFF THE JOB TYPE the desk already types, because nothing in the
 * schema records a vertical and this report is not worth a migration. A shop that runs
 * one trade sees everything in one column, which is the truthful answer for it; a mixed
 * shop sees the split as well as the words on its own work orders allow. Unrecognised
 * wording lands in GENERAL rather than being forced into a bucket that would then be
 * quoted back as fact.
 */
const TRADE_WORDS: Array<{ trade: Trade; words: RegExp }> = [
  { trade: "MOVING", words: /\b(mov(e|ing)|relocat|packing|unpack|truck|haul)/i },
  {
    trade: "RENOVATION",
    words:
      /\b(reno|renovat|remodel|kitchen|bathroom|basement|drywall|paint|floor|tile|framing|demo|trim|cabinet)/i,
  },
  {
    trade: "HVAC",
    words: /\b(hvac|furnace|a\/?c\b|air con|heat pump|duct|boiler|water heater|thermostat)/i,
  },
];

export function classifyTrade(...text: Array<string | null | undefined>): Trade {
  const haystack = text.filter(Boolean).join(" ");
  if (haystack) {
    for (const row of TRADE_WORDS) if (row.words.test(haystack)) return row.trade;
  }
  return "GENERAL";
}

export const TRADE_LABELS: Record<Trade, string> = {
  MOVING: "Moving",
  RENOVATION: "Renovation",
  HVAC: "HVAC",
  GENERAL: "Other work",
};

/* ------------------------------------------------------------------------- *
 * The report
 * ------------------------------------------------------------------------- */

/** One channel, read top to bottom: how many came in, how many turned into paid work. */
export interface ChannelFunnel {
  channel: string;
  label: string;
  /** Leads that arrived in the period. */
  leads: number;
  /** Leads somebody actually got to — anything past NEW. */
  reached: number;
  /** Leads that became a job (plus the job itself for the NO_LEAD row). */
  jobs: number;
  /** Jobs that collected anything — the divisor of the average ticket. */
  jobsPaid: number;
  quotedCents: number;
  invoicedCents: number;
  collectedCents: number;
  costsCents: number;
  /** Collected minus job costs. Ad spend is taken off separately, below. */
  marginCents: number;
  /** Null means the owner has not booked ad spend for this channel — never zero. */
  adSpendCents: number | null;
  /** Ad spend ÷ leads. */
  cplCents: number | null;
  /** Ad spend ÷ jobs opened. */
  cpjCents: number | null;
  /** Margin minus ad spend: what the channel left after paying for itself. */
  netAfterAdsCents: number | null;
  /** Dollars collected per dollar of ad spend. */
  returnPerAdDollar: number | null;
  avgTicketCents: number | null;
  /** Minutes from «lead arrived» to «somebody moved it». */
  avgFirstReplyMins: number | null;
  /** Leads still sitting on NEW — nobody has answered them at all. */
  unanswered: number;
}

export interface MonthRow {
  month: number;
  leads: number;
  jobs: number;
  collectedCents: number;
  adSpendCents: number | null;
}

export interface VerticalRow {
  vertical: Trade;
  label: string;
  leads: number;
  jobs: number;
  collectedCents: number;
  marginCents: number;
  avgTicketCents: number | null;
}

export interface ChannelReport {
  year: number;
  /** null = the whole year. */
  month: number | null;
  vertical: Trade | "ALL";
  /** Channels with something to show, best return first. */
  channels: ChannelFunnel[];
  totals: ChannelFunnel;
  /** Always the full twelve months of `year`, so seasonality survives a month filter. */
  months: MonthRow[];
  verticals: VerticalRow[];
  /** Whether any ad spend at all is booked this year — drives the «how to enter it» hint. */
  spendBooked: boolean;
  /**
   * False while a trade filter is on: a Facebook invoice buys leads for the whole shop and
   * nothing in it says which half was for moving. Splitting it by trade would invent the
   * split, so the spend line goes quiet instead and says why.
   */
  spendShown: boolean;
}

export type VerticalFilter = Trade | "ALL";

/* ------------------------------------------------------------------------- *
 * Building it
 * ------------------------------------------------------------------------- */

/** A job as the report needs it: money, plus enough words to place it in a trade. */
type JobRow = JobMoneyInput & {
  createdAt: Date;
  jobType: string | null;
  title: string;
};

type LeadRow = {
  source: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  jobType: string | null;
  project: JobRow | null;
};

/**
 * Time to first response, derived rather than stored.
 *
 * There is no «first touched» column, so the moment the row last changed stands in for
 * it, bounded by the moment a job was opened off the lead. Both are upper bounds — a
 * later edit moves `updatedAt` — so the number reads as «no worse than this», and a lead
 * still on NEW is left out of the average and counted as unanswered instead. That is the
 * pairing the whole report is for: a channel that looks expensive is usually a channel
 * nobody called back.
 */
function firstReplyMs(lead: LeadRow): number | null {
  if (lead.status === "NEW") return null;
  const answered = Math.min(
    lead.updatedAt.getTime(),
    lead.project ? lead.project.createdAt.getTime() : Number.POSITIVE_INFINITY
  );
  if (!Number.isFinite(answered)) return null;
  return Math.max(answered - lead.createdAt.getTime(), 0);
}

/** A mutable tally per channel; the divisions happen once, at the end. */
type Tally = {
  leads: number;
  reached: number;
  jobs: number;
  jobsPaid: number;
  quotedCents: number;
  invoicedCents: number;
  collectedCents: number;
  costsCents: number;
  adSpendCents: number | null;
  replyMsTotal: number;
  replyCount: number;
  unanswered: number;
};

const emptyTally = (): Tally => ({
  leads: 0,
  reached: 0,
  jobs: 0,
  jobsPaid: 0,
  quotedCents: 0,
  invoicedCents: 0,
  collectedCents: 0,
  costsCents: 0,
  adSpendCents: null,
  replyMsTotal: 0,
  replyCount: 0,
  unanswered: 0,
});

function addJob(tally: Tally, job: JobRow) {
  const m = jobMoney(job);
  tally.jobs += 1;
  tally.quotedCents += m.quotedCents;
  tally.invoicedCents += m.invoicedCents;
  tally.collectedCents += m.collectedCents;
  tally.costsCents += m.costsCents;
  if (m.collectedCents > 0) tally.jobsPaid += 1;
}

/** Whole cents; a rate nobody can pay to the tenth of a cent is not a rate. */
const per = (cents: number | null, count: number) =>
  cents === null || count <= 0 ? null : Math.round(cents / count);

function finish(channel: string, t: Tally): ChannelFunnel {
  const marginCents = t.collectedCents - t.costsCents;
  return {
    channel,
    label: channelLabel(channel),
    leads: t.leads,
    reached: t.reached,
    jobs: t.jobs,
    jobsPaid: t.jobsPaid,
    quotedCents: t.quotedCents,
    invoicedCents: t.invoicedCents,
    collectedCents: t.collectedCents,
    costsCents: t.costsCents,
    marginCents,
    adSpendCents: t.adSpendCents,
    cplCents: per(t.adSpendCents, t.leads),
    cpjCents: per(t.adSpendCents, t.jobs),
    netAfterAdsCents: t.adSpendCents === null ? null : marginCents - t.adSpendCents,
    returnPerAdDollar:
      t.adSpendCents === null || t.adSpendCents <= 0
        ? null
        : t.collectedCents / t.adSpendCents,
    avgTicketCents: per(t.collectedCents, t.jobsPaid),
    avgFirstReplyMins:
      t.replyCount === 0 ? null : Math.round(t.replyMsTotal / t.replyCount / 60000),
    unanswered: t.unanswered,
  };
}

/** A row is in the funnel when it falls inside the selected month, or any month. */
const inPeriod = (d: Date, month: number | null) => month === null || d.getMonth() + 1 === month;

/**
 * The whole report for one workspace.
 *
 * `tenantId` is an argument rather than something read in here, so the caller's session
 * is the only source of it — the API route, the screen and the CSV all pass the same
 * value from their own guard, and no query below can be reached without one.
 */
export async function loadChannelReport(
  tenantId: string,
  opts: { year: number; month?: number | null; vertical?: VerticalFilter }
): Promise<ChannelReport> {
  const year = opts.year;
  const month = opts.month && opts.month >= 1 && opts.month <= 12 ? opts.month : null;
  const vertical: VerticalFilter = opts.vertical ?? "ALL";

  // The full year is always read: the month strip has to show seasonality even when the
  // funnel above it is cut to one month.
  const from = new Date(year, 0, 1);
  const to = new Date(year, 11, 31, 23, 59, 59, 999);

  const money = {
    // Newest first — `jobMoney` takes the live accepted price off the head of the list.
    estimates: { select: { totalCents: true, status: true }, orderBy: { createdAt: "desc" } },
    invoices: { select: { totalCents: true, status: true } },
    payments: { select: { amountCents: true } },
    expenses: { select: { amountCents: true } },
  } as const;

  const [leads, orphanJobs, overhead] = await Promise.all([
    prisma.lead.findMany({
      where: { tenantId, createdAt: { gte: from, lte: to } },
      select: {
        source: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        jobType: true,
        project: {
          select: { createdAt: true, jobType: true, title: true, ...money },
        },
      },
    }),
    // Work that never was a lead: walk-ins and repeat customers. Real collected money,
    // so it gets its own row instead of vanishing from the totals.
    prisma.project.findMany({
      where: { tenantId, leadId: null, createdAt: { gte: from, lte: to } },
      select: { createdAt: true, jobType: true, title: true, ...money },
    }),
    // Ad spend hides in general overhead — see `adSpendChannel`.
    prisma.expense.findMany({
      where: { tenantId, projectId: null, date: { gte: from, lte: to } },
      select: { amountCents: true, description: true, date: true },
    }),
  ]);

  const tallies = new Map<string, Tally>();
  const tally = (key: string) => {
    const found = tallies.get(key) ?? emptyTally();
    tallies.set(key, found);
    return found;
  };

  const months: MonthRow[] = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    leads: 0,
    jobs: 0,
    collectedCents: 0,
    adSpendCents: null,
  }));

  const verticalTallies = new Map<Trade, Tally>();
  const verticalTally = (trade: Trade) => {
    const found = verticalTallies.get(trade) ?? emptyTally();
    verticalTallies.set(trade, found);
    return found;
  };

  let spendBooked = false;

  for (const lead of leads as LeadRow[]) {
    const trade = classifyTrade(lead.jobType, lead.project?.jobType, lead.project?.title);
    if (vertical !== "ALL" && trade !== vertical) continue;

    const bucket = months[lead.createdAt.getMonth()];
    bucket.leads += 1;
    if (lead.project) {
      bucket.jobs += 1;
      bucket.collectedCents += jobMoney(lead.project).collectedCents;
    }

    if (!inPeriod(lead.createdAt, month)) continue;

    const source = CHANNEL_KEYS.has(lead.source) ? lead.source : "OTHER";
    for (const t of [tally(source), verticalTally(trade)]) {
      t.leads += 1;
      if (lead.status === "NEW") t.unanswered += 1;
      else t.reached += 1;

      const reply = firstReplyMs(lead);
      if (reply !== null) {
        t.replyMsTotal += reply;
        t.replyCount += 1;
      }
      if (lead.project) addJob(t, lead.project);
    }
  }

  for (const job of orphanJobs as JobRow[]) {
    const trade = classifyTrade(job.jobType, job.title);
    if (vertical !== "ALL" && trade !== vertical) continue;

    const bucket = months[job.createdAt.getMonth()];
    bucket.jobs += 1;
    bucket.collectedCents += jobMoney(job).collectedCents;

    if (!inPeriod(job.createdAt, month)) continue;
    addJob(tally("NO_LEAD"), job);
    addJob(verticalTally(trade), job);
  }

  // An ad invoice belongs to a channel, never to a trade — see `spendShown`.
  const spendShown = vertical === "ALL";

  for (const line of overhead) {
    const channel = adSpendChannel(line.description);
    if (!channel) continue;
    spendBooked = true;
    if (!spendShown) continue;

    const bucket = months[line.date.getMonth()];
    bucket.adSpendCents = (bucket.adSpendCents ?? 0) + line.amountCents;

    if (!inPeriod(line.date, month)) continue;
    const t = tally(channel);
    t.adSpendCents = (t.adSpendCents ?? 0) + line.amountCents;
  }

  // A channel with nothing at all this period is not news; one that took ad money and
  // produced nothing is exactly the news, so any booked spend keeps the column visible.
  const channels = CHANNELS.map((c) => ({ key: c.key, t: tallies.get(c.key) }))
    .filter((row): row is { key: ChannelKey; t: Tally } => Boolean(row.t))
    .map((row) => finish(row.key, row.t))
    .filter((f) => f.leads > 0 || f.jobs > 0 || (f.adSpendCents ?? 0) > 0)
    .sort((a, b) => b.collectedCents - a.collectedCents || b.leads - a.leads);

  const totals = emptyTally();
  for (const t of Array.from(tallies.values())) {
    totals.leads += t.leads;
    totals.reached += t.reached;
    totals.jobs += t.jobs;
    totals.jobsPaid += t.jobsPaid;
    totals.quotedCents += t.quotedCents;
    totals.invoicedCents += t.invoicedCents;
    totals.collectedCents += t.collectedCents;
    totals.costsCents += t.costsCents;
    totals.replyMsTotal += t.replyMsTotal;
    totals.replyCount += t.replyCount;
    totals.unanswered += t.unanswered;
    if (t.adSpendCents !== null) totals.adSpendCents = (totals.adSpendCents ?? 0) + t.adSpendCents;
  }

  const verticals: VerticalRow[] = [];
  for (const trade of ["MOVING", "RENOVATION", "HVAC", "GENERAL"] as Trade[]) {
    const t = verticalTallies.get(trade);
    if (!t || (t.leads === 0 && t.jobs === 0)) continue;
    const f = finish(trade, t);
    verticals.push({
      vertical: trade,
      label: TRADE_LABELS[trade],
      leads: f.leads,
      jobs: f.jobs,
      collectedCents: f.collectedCents,
      marginCents: f.marginCents,
      avgTicketCents: f.avgTicketCents,
    });
  }

  return {
    year,
    month,
    vertical,
    channels,
    totals: { ...finish("TOTAL", totals), label: "All channels" },
    months,
    verticals,
    spendBooked,
    spendShown,
  };
}

/* ------------------------------------------------------------------------- *
 * Reading it out loud
 * ------------------------------------------------------------------------- */

/**
 * How the reply delay should read at a glance. Thresholds are the trade rule of thumb a
 * quiz landing lives by: the shop that calls back inside the quarter hour gets the job,
 * and the one that answers tomorrow paid for the click anyway.
 */
export function replyTone(mins: number | null): string {
  if (mins === null) return "var(--ink-3)";
  if (mins <= 15) return "var(--emerald-ink)";
  if (mins <= 60) return "var(--amber-ink)";
  return "var(--rose-ink)";
}

/** «14 min», «3 h 20 min», «2 d 4 h» — an owner reads a delay in the unit it hurts in. */
export function formatDelay(mins: number | null): string {
  if (mins === null) return "—";
  if (mins < 60) return `${mins} min`;
  if (mins < 60 * 24) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m ? `${h} h ${m} min` : `${h} h`;
  }
  const d = Math.floor(mins / (60 * 24));
  const h = Math.floor((mins % (60 * 24)) / 60);
  return h ? `${d} d ${h} h` : `${d} d`;
}
