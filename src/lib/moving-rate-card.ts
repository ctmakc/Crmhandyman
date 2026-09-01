import type { PriceItem } from "@/lib/price-book";

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

export function movingCrewRateDollars(card: MovingRateCard, size: number): number {
  if (size <= 2) return card.crew2HourlyCents / 100;
  if (size === 3) return card.crew3HourlyCents / 100;
  return card.crew4HourlyCents / 100;
}

function crewSizeFromDescription(description: string): number | null {
  const match = description.match(/crew of\s+(2|3|4)\b/i);
  return match ? Number(match[1]) : null;
}

/**
 * Reprices only moving-specific lines. It preserves quantities/descriptions and leaves
 * unrelated custom lines alone. A generic travel line inherits the crew rate from the
 * preceding crew line, which matches quoteMove and every built-in moving template.
 */
export function repriceMovingLines(lines: PriceItem[], card: MovingRateCard): PriceItem[] {
  let currentCrewRate: number | null = null;
  return lines.map((line) => {
    const description = line.description.trim();
    const explicitCrew = crewSizeFromDescription(description);
    if (explicitCrew) currentCrewRate = movingCrewRateDollars(card, explicitCrew);

    let unitPrice = line.unitPrice;
    if (/^crew of\s+(2|3|4)\b/i.test(description) && currentCrewRate !== null) {
      unitPrice = currentCrewRate;
    } else if (/^travel time\b/i.test(description)) {
      const travelCrew = explicitCrew ? movingCrewRateDollars(card, explicitCrew) : currentCrewRate;
      if (travelCrew !== null) unitPrice = travelCrew;
    } else if (/^stair carry surcharge/i.test(description)) {
      unitPrice = card.stairFlightCents / 100;
    } else if (/^packing materials kit/i.test(description)) {
      unitPrice = card.packingKitCents / 100;
    } else if (/^wardrobe box rental/i.test(description)) {
      unitPrice = card.wardrobeBoxCents / 100;
    } else if (/^piano \/ safe handling/i.test(description)) {
      unitPrice = card.pianoSafeCents / 100;
    }

    return { ...line, unitPrice };
  });
}
