/**
 * A mover's sell rates belong to the shop, never to a generic Ottawa price book.
 * Values are stored as integer cents inside ChannelIntegration.config and converted
 * back to dollars only at the estimate-form edge.
 */
export const MOVING_RATE_CARD_CHANNEL = "MOVING_RATE_CARD";

export interface MovingRateCard {
  crew2HourlyCents: number;
  crew3HourlyCents: number;
  crew4HourlyCents: number;
  stairFlightCents: number;
  packingKitCents: number;
  wardrobeBoxCents: number;
  pianoSafeCents: number;
}

export interface MovingRateCardForm {
  crew2Hourly: number;
  crew3Hourly: number;
  crew4Hourly: number;
  stairFlight: number;
  packingKit: number;
  wardrobeBox: number;
  pianoSafe: number;
}

export const EMPTY_MOVING_RATE_CARD_FORM: MovingRateCardForm = {
  crew2Hourly: 0,
  crew3Hourly: 0,
  crew4Hourly: 0,
  stairFlight: 0,
  packingKit: 0,
  wardrobeBox: 0,
  pianoSafe: 0,
};

const FIELDS = [
  "crew2HourlyCents",
  "crew3HourlyCents",
  "crew4HourlyCents",
  "stairFlightCents",
  "packingKitCents",
  "wardrobeBoxCents",
  "pianoSafeCents",
] as const;

type StoredField = (typeof FIELDS)[number];

type DescribedLine = { description: string };
type DollarLine = DescribedLine & { unitPrice: number };
type CentsLine = DescribedLine & { unitPriceCents: number };

function validCents(value: unknown, requiredPositive = false): value is number {
  return (
    Number.isInteger(value) &&
    Number(value) >= (requiredPositive ? 1 : 0) &&
    Number(value) <= 1_000_000
  );
}

/** Malformed or partial config is treated as unconfigured; no quote may silently guess. */
export function decodeMovingRateCard(raw: string | null | undefined): MovingRateCard | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    for (const field of FIELDS) {
      const crew = field.startsWith("crew");
      if (!validCents(parsed[field], crew)) return null;
    }
    return Object.fromEntries(FIELDS.map((field) => [field, Number(parsed[field])])) as unknown as MovingRateCard;
  } catch {
    return null;
  }
}

export function encodeMovingRateCard(card: MovingRateCard): string {
  return JSON.stringify(Object.fromEntries(FIELDS.map((field) => [field, card[field]])));
}

function dollarsToCents(value: unknown): number | null {
  const number = typeof value === "string" && value.trim() !== "" ? Number(value) : Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 10_000) return null;
  return Math.round((number + Number.EPSILON) * 100);
}

/** Parse the settings form. Crew rates must be positive; optional surcharges may be zero. */
export function movingRateCardFromForm(input: unknown):
  | { ok: true; card: MovingRateCard }
  | { ok: false; error: string } {
  if (!input || typeof input !== "object") return { ok: false, error: "Enter the moving rates" };
  const body = input as Record<string, unknown>;
  const map: Array<[keyof MovingRateCardForm, StoredField, boolean]> = [
    ["crew2Hourly", "crew2HourlyCents", true],
    ["crew3Hourly", "crew3HourlyCents", true],
    ["crew4Hourly", "crew4HourlyCents", true],
    ["stairFlight", "stairFlightCents", false],
    ["packingKit", "packingKitCents", false],
    ["wardrobeBox", "wardrobeBoxCents", false],
    ["pianoSafe", "pianoSafeCents", false],
  ];
  const card = {} as MovingRateCard;
  for (const [formField, storedField, requiredPositive] of map) {
    const cents = dollarsToCents(body[formField]);
    if (cents === null || (requiredPositive && cents === 0)) {
      return {
        ok: false,
        error: requiredPositive
          ? `${formField} must be greater than $0`
          : `${formField} must be a dollar amount from $0 to $10,000`,
      };
    }
    card[storedField] = cents;
  }
  return { ok: true, card };
}

export function movingRateCardToForm(card: MovingRateCard): MovingRateCardForm {
  return {
    crew2Hourly: card.crew2HourlyCents / 100,
    crew3Hourly: card.crew3HourlyCents / 100,
    crew4Hourly: card.crew4HourlyCents / 100,
    stairFlight: card.stairFlightCents / 100,
    packingKit: card.packingKitCents / 100,
    wardrobeBox: card.wardrobeBoxCents / 100,
    pianoSafe: card.pianoSafeCents / 100,
  };
}

export function movingCrewRateCents(card: MovingRateCard, size: number): number {
  if (size <= 2) return card.crew2HourlyCents;
  if (size === 3) return card.crew3HourlyCents;
  return card.crew4HourlyCents;
}

export function movingCrewRateDollars(card: MovingRateCard, size: number): number {
  return movingCrewRateCents(card, size) / 100;
}

function crewSizeFromDescription(description: string): number | null {
  const match = description.match(/crew of\s+(2|3|4)\b/i);
  return match ? Number(match[1]) : null;
}

export function isMovingRateLine(description: string): boolean {
  const value = description.trim();
  return (
    /^crew of\s+(2|3|4)\b/i.test(value) ||
    /^travel time\b/i.test(value) ||
    /^stair carry surcharge/i.test(value) ||
    /^packing materials kit/i.test(value) ||
    /^wardrobe box rental/i.test(value) ||
    /^piano \/ safe handling/i.test(value)
  );
}

export function containsMovingRateLines(lines: DescribedLine[]): boolean {
  return lines.some((line) => isMovingRateLine(line.description));
}

function centsForMovingLine(description: string, card: MovingRateCard, currentCrewCents: number | null) {
  const explicitCrew = crewSizeFromDescription(description);
  if (/^crew of\s+(2|3|4)\b/i.test(description) && explicitCrew) {
    return movingCrewRateCents(card, explicitCrew);
  }
  if (/^travel time\b/i.test(description)) {
    return explicitCrew ? movingCrewRateCents(card, explicitCrew) : currentCrewCents;
  }
  if (/^stair carry surcharge/i.test(description)) return card.stairFlightCents;
  if (/^packing materials kit/i.test(description)) return card.packingKitCents;
  if (/^wardrobe box rental/i.test(description)) return card.wardrobeBoxCents;
  if (/^piano \/ safe handling/i.test(description)) return card.pianoSafeCents;
  return null;
}

/** Reprice browser/form lines while preserving every non-price field. */
export function repriceMovingLines<T extends DollarLine>(lines: T[], card: MovingRateCard): T[] {
  let currentCrewCents: number | null = null;
  return lines.map((line) => {
    const description = line.description.trim();
    const crew = crewSizeFromDescription(description);
    if (crew) currentCrewCents = movingCrewRateCents(card, crew);
    const cents = centsForMovingLine(description, card, currentCrewCents);
    return cents === null ? { ...line } : { ...line, unitPrice: cents / 100 };
  });
}

/**
 * The API repeats the repricing in cents. Client-side preview is convenience; this is the
 * authority that prevents a stale browser or crafted POST from saving the old demo rates.
 */
export function repriceMovingLinesCents<T extends CentsLine>(lines: T[], card: MovingRateCard): T[] {
  let currentCrewCents: number | null = null;
  return lines.map((line) => {
    const description = line.description.trim();
    const crew = crewSizeFromDescription(description);
    if (crew) currentCrewCents = movingCrewRateCents(card, crew);
    const cents = centsForMovingLine(description, card, currentCrewCents);
    return cents === null ? { ...line } : { ...line, unitPriceCents: cents };
  });
}
