import { describe, expect, it } from "vitest";
import {
  containsMovingRateLines,
  decodeMovingRateCard,
  encodeMovingRateCard,
  movingRateCardFromForm,
  movingRateCardToForm,
  repriceMovingLines,
  repriceMovingLinesCents,
  type MovingRateCard,
} from "../src/lib/moving-rate-card";

const CARD: MovingRateCard = {
  crew2HourlyCents: 15000,
  crew3HourlyCents: 19000,
  crew4HourlyCents: 23000,
  stairFlightCents: 5000,
  packingKitCents: 12500,
  wardrobeBoxCents: 1500,
  pianoSafeCents: 35000,
};

describe("moving rate card", () => {
  it("round-trips cents storage without floating point money", () => {
    expect(decodeMovingRateCard(encodeMovingRateCard(CARD))).toEqual(CARD);
    expect(movingRateCardToForm(CARD)).toEqual({
      crew2Hourly: 150,
      crew3Hourly: 190,
      crew4Hourly: 230,
      stairFlight: 50,
      packingKit: 125,
      wardrobeBox: 15,
      pianoSafe: 350,
    });
  });

  it("rejects partial, malformed and zero crew rate cards", () => {
    expect(decodeMovingRateCard("not json")).toBeNull();
    expect(decodeMovingRateCard(JSON.stringify({ crew2HourlyCents: 15000 }))).toBeNull();
    const parsed = movingRateCardFromForm({
      crew2Hourly: 150,
      crew3Hourly: 0,
      crew4Hourly: 230,
      stairFlight: 0,
      packingKit: 0,
      wardrobeBox: 0,
      pianoSafe: 0,
    });
    expect(parsed.ok).toBe(false);
  });

  it("reprices a moving quote from tenant rates and leaves custom lines alone", () => {
    const lines = repriceMovingLines(
      [
        { description: "Crew of 3 + 26ft truck", qty: 8, unit: "hr", unitPrice: 165 },
        { description: "Travel time (yard to yard)", qty: 1, unit: "hr", unitPrice: 165 },
        { description: "Stair carry surcharge (per flight)", qty: 2, unit: "ea", unitPrice: 45 },
        { description: "Packing materials kit", qty: 2, unit: "lot", unitPrice: 140 },
        { description: "Custom disposal", qty: 1, unit: "ea", unitPrice: 88 },
      ],
      CARD
    );

    expect(lines.map((line) => line.unitPrice)).toEqual([190, 190, 50, 125, 88]);
  });

  it("repeats the same authority in cents for server-side saving", () => {
    const lines = repriceMovingLinesCents(
      [
        { description: "Crew of 4 + 26ft truck", qty: 10, unit: "hr", unitPriceCents: 20500 },
        { description: "Travel time (yard to yard)", qty: 2, unit: "hr", unitPriceCents: 20500 },
        { description: "Piano / safe handling", qty: 1, unit: "ea", unitPriceCents: 32000 },
      ],
      CARD
    );

    expect(lines.map((line) => line.unitPriceCents)).toEqual([23000, 23000, 35000]);
  });

  it("recognises moving-priced lines but not unrelated estimates", () => {
    expect(containsMovingRateLines([{ description: "Travel time — crew of 2 (yard to yard)" }])).toBe(true);
    expect(containsMovingRateLines([{ description: "General labour" }])).toBe(false);
  });
});
