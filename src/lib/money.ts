/**
 * Money is a whole number of cents. Everywhere inside this system.
 *
 * `Float` cannot hold 0.1, so a thousand stored line amounts stopped adding up to their
 * own stored total: the sum drifted while every column still printed two clean decimals.
 * Rounding on the way in hid that from the paper without fixing it — the drift lived in
 * the column itself. Integers have no dust, so the sum of the parts IS the total.
 *
 * THE UNIT IS IN THE NAME. A field or variable holding cents ends in `Cents`; a bare
 * `total` is dollars and belongs to an edge. The edges, and the single door each one
 * goes through:
 *
 *   JSON API out    inDollars(row)            — a payload leaves in dollars
 *   JSON API in     parseCents(body.amount)   — an amount arrives in dollars
 *   fetch() in UI   inCents(payload)          — the screen works in cents again
 *   screen / paper  formatCents(cents)        — the only money formatter
 *   CSV             dollarText(cents)         — two decimals for the bookkeeper
 *
 * A bare `* 100` or `/ 100` anywhere else is the same disease under another name.
 */

/** Half a cent always rounds away from zero — a credit line is not rounded up. */
const roundCents = (n: number) => Math.sign(n) * Math.round(Math.abs(n));

/**
 * Dollars → cents, the only multiplication in the codebase.
 *
 * Scaled through a fixed-decimal string because `Math.round(1.005 * 100)` is 100:
 * 1.005 is stored as 1.00499999999999989, and the paper says 1.01.
 */
export function toCents(dollars: number): number {
  if (!Number.isFinite(dollars)) return 0;
  return roundCents(Number((dollars * 100).toFixed(4)));
}

/** Cents → dollars, for an edge that speaks dollars. Never for arithmetic. */
export function toDollars(cents: number): number {
  return cents / 100;
}

/**
 * An amount as it arrives from a form or a JSON body — dollars, possibly a string,
 * possibly nonsense. `null` means "this is not an amount", which is the caller's 400.
 */
export function parseCents(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  // A blank field is a missing amount, never zero — `Number("")` is 0 and would book
  // a free job as a real one.
  if (typeof raw === "string" && !raw.trim()) return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return toCents(n);
}

const CAD = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" });

/** What the client reads on the paper. Every money string on every surface comes from here. */
export function formatCents(cents: number): string {
  return CAD.format(toDollars(cents));
}

/** The bookkeeper's column: plain dollars, two decimals, no symbol. */
export function dollarText(cents: number): string {
  return toDollars(cents).toFixed(2);
}

/* ------------------------------------------------------------------------- *
 * Crossing the API boundary
 * ------------------------------------------------------------------------- */

/**
 * The dollar names the API serves. A field listed here is money, and `inCents` turns it
 * back into `<name>Cents` on the way into a screen. Adding a money field to a payload
 * means adding its name here — that is the whole vocabulary, in one place.
 */
const MONEY_FIELDS = [
  "amount",
  "amountPaid",
  "collected",
  "costs",
  // What the crew is told to collect at the door — the one figure that survives the
  // role filter on a job card.
  "dueAtDoor",
  "invoiced",
  "lifetime",
  "margin",
  "netProfit",
  "outstanding",
  "owing",
  "pricePerVisit",
  "quoted",
  "subtotal",
  "tax",
  "total",
  "totalExpenses",
  "totalRevenue",
  "unbilled",
  "unitPrice",
] as const;

export type MoneyField = (typeof MONEY_FIELDS)[number];

const IS_MONEY = new Set<string>(MONEY_FIELDS);

export type InDollars<T> = T extends Date
  ? T
  : T extends Array<infer E>
    ? Array<InDollars<E>>
    : T extends object
      ? { [K in keyof T as K extends `${infer B}Cents` ? B : K]: InDollars<T[K]> }
      : T;

export type InCents<T> = T extends Date
  ? T
  : T extends Array<infer E>
    ? Array<InCents<E>>
    : T extends object
      ? { [K in keyof T as K extends MoneyField ? `${K}Cents` : K]: InCents<T[K]> }
      : T;

function rewrite(value: unknown, rename: (key: string) => [string, (n: number) => number] | null): unknown {
  if (value === null || typeof value !== "object") return value;
  if (value instanceof Date) return value;
  if (Array.isArray(value)) return value.map((v) => rewrite(v, rename));

  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    // Only a number or an absent value is money. A money field that is null stays null
    // under its new name — an absent amount is not zero, and printing $0.00 for
    // "never quoted" is a lie the desk would believe. Anything else keeps its own name
    // and is walked into, so a stray match cannot swallow a branch of the payload.
    const hit = v === null || typeof v === "number" ? rename(key) : null;
    if (hit) out[hit[0]] = typeof v === "number" ? hit[1](v) : v;
    else out[key] = rewrite(v, rename);
  }
  return out;
}

/**
 * A payload on its way out of the server. Every `<name>Cents` becomes `<name>` in
 * dollars, at any depth — the contractor and his bookkeeper think in dollars, and an
 * API that answers 103960 where the invoice says $1,039.60 will be read wrong once.
 */
export function inDollars<T>(value: T): InDollars<T> {
  return rewrite(value, (k) =>
    k.endsWith("Cents") && k.length > 5 ? [k.slice(0, -5), toDollars] : null
  ) as InDollars<T>;
}

/** The mirror: a payload arriving in a screen goes back to cents before anything adds it up. */
export function inCents<T>(value: T): InCents<T> {
  return rewrite(value, (k) => (IS_MONEY.has(k) ? [`${k}Cents`, toCents] : null)) as InCents<T>;
}

/* ------------------------------------------------------------------------- *
 * Estimate and invoice lines
 * ------------------------------------------------------------------------- */

/** A line as it is stored and priced. */
export interface LineItem {
  description: string;
  qty: number;
  unit: string;
  unitPriceCents: number;
}

/** The same line at an edge — what a form posts and what the paper prints. */
export interface DollarLineItem {
  description: string;
  qty: number;
  unit: string;
  unitPrice: number;
}

/**
 * What one line is worth. Rounded here, so the amounts printed down the page add up to
 * the subtotal underneath them: at $1.855 a foot over 2000 feet the paper used to show
 * a rate of $1.86, a line of $3,710.00, and no way to get from one to the other.
 */
export const lineTotalCents = (line: LineItem) => roundCents(line.qty * line.unitPriceCents);

/**
 * Subtotal, tax and total for a set of lines — the ONE place this arithmetic lives.
 * The estimate screen prices its preview with it and the API prices the saved record
 * with it, so the number the estimator reads is the number the client is billed.
 */
export function quoteTotals(lines: LineItem[], taxRate: number) {
  const subtotalCents = lines.reduce((sum, line) => sum + lineTotalCents(line), 0);
  const taxCents = roundCents(subtotalCents * taxRate);
  return { subtotalCents, taxCents, totalCents: subtotalCents + taxCents };
}

/** A share of an amount — a deposit percentage, cut to the cent. */
export const shareOfCents = (cents: number, rate: number) => roundCents(cents * rate);

/** Ontario HST, which is what both live shops charge. */
export const DEFAULT_TAX_RATE = 0.13;

/**
 * Highest rate any Canadian jurisdiction charges is 15%; the ceiling is set at 30% so a
 * shop with a rate we have not heard of still gets through, and `13` never does.
 */
export const MAX_TAX_RATE = 0.3;

/**
 * A tax rate as it arrives in a request body — a FRACTION, never a percentage.
 *
 * Absent means the default. `null` means the caller sent something that is not a rate,
 * which is the caller's 400. A contractor says «thirteen percent» out loud, so `13` is
 * the shape of the mistake: it once put a $1,300.00 tax line on a $100.00 subtotal and
 * the invoice went out under a real number. The estimate screen is a four-item select
 * and could not make that mistake; the API had nothing between the body and the ledger.
 */
export function parseTaxRate(raw: unknown): number | null {
  if (raw === undefined || raw === null || raw === "") return DEFAULT_TAX_RATE;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > MAX_TAX_RATE) return null;
  return n;
}

/**
 * Lines out of the database.
 *
 * Tolerates a pre-cents row (`unitPrice` in dollars): the migration rewrote every line
 * it could parse, and an estimate printed last month still has to print today.
 */
export function parseLineItems(json: string): LineItem[] {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];

  return raw.map((item) => {
    const line = (item ?? {}) as Partial<LineItem & DollarLineItem>;
    return {
      description: String(line.description ?? ""),
      qty: Number(line.qty) || 0,
      unit: String(line.unit ?? ""),
      unitPriceCents:
        typeof line.unitPriceCents === "number"
          ? Math.round(line.unitPriceCents)
          : toCents(Number(line.unitPrice) || 0),
    };
  });
}

/** Lines into the database. */
export const lineItemsToJson = (lines: LineItem[]) => JSON.stringify(lines);

/** Lines arriving from a form or an API body, in dollars. */
export function lineItemsFromInput(raw: unknown): LineItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => {
    const line = (item ?? {}) as Partial<DollarLineItem>;
    return {
      description: String(line.description ?? ""),
      qty: Number(line.qty) || 0,
      unit: String(line.unit ?? ""),
      unitPriceCents: toCents(Number(line.unitPrice) || 0),
    };
  });
}

/** Lines on their way out, in dollars, still a JSON string — the shape the API always served. */
export const lineItemsJsonInDollars = (json: string) =>
  JSON.stringify(inDollars(parseLineItems(json)));
