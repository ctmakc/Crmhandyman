/**
 * The renovation take-off.
 *
 * A renovator quotes by area and by room: "620 square feet, three rooms, eight-foot
 * ceilings, gut it, vinyl on the floor" already fixes most of the quantities. This turns
 * that sentence into priced lines in the units the crew works in — sq ft of wall, lf of
 * baseboard, points of power, days of supervision.
 *
 * It is a TAKE-OFF, not a measurement. Perimeter is inferred from the floor area, so every
 * number lands in the estimate as an editable line the estimator corrects after walking the
 * site. Treating it as exact is how a reno loses money on the second week.
 */

import { RENO_LINES, at, type PriceItem } from "./price-book";

export type RenoScope = "PAINT" | "REFRESH" | "GUT";
export type RenoFlooring = "NONE" | "LAMINATE" | "VINYL" | "TILE";

export interface RenoInputs {
  /** Floor area of the space in scope. */
  areaSqFt: number;
  ceilingFt: number;
  /** Rooms, hallway counted as one. Drives doors, trim runs and how broken up the walls are. */
  rooms: number;
  scope: RenoScope;
  flooring: RenoFlooring;
}

export interface RenoGeometry {
  /** Wall face to board or paint, openings already deducted. */
  wallSqFt: number;
  ceilingSqFt: number;
  perimeterLf: number;
  /** Baseboard run — perimeter minus the door openings. */
  trimLf: number;
  doors: number;
}

export const RENO_SCOPES: Array<{ id: RenoScope; label: string; hint: string }> = [
  { id: "PAINT", label: "Paint only", hint: "Patch, prime, two coats, trim" },
  { id: "REFRESH", label: "Refresh", hint: "Paint, new floor, new baseboard" },
  { id: "GUT", label: "Full gut", hint: "Strip to studs, rebuild, permits" },
];

export const RENO_FLOORING: Array<{ id: RenoFlooring; label: string }> = [
  { id: "NONE", label: "Keep floor" },
  { id: "LAMINATE", label: "Laminate" },
  { id: "VINYL", label: "Vinyl plank" },
  { id: "TILE", label: "Porcelain tile" },
];

const FLOOR_LINE = {
  LAMINATE: RENO_LINES.laminate,
  VINYL: RENO_LINES.vinylPlank,
  TILE: RENO_LINES.tileFloor,
} as const;

/** Areas quoted to the nearest 5 sq ft — a take-off that reads 1873 pretends to be a survey. */
const r5 = (n: number) => Math.max(5, Math.round(n / 5) * 5);

export function renoGeometry(input: RenoInputs): RenoGeometry {
  const area = Math.max(40, input.areaSqFt || 0);
  const rooms = Math.min(20, Math.max(1, Math.round(input.rooms || 1)));
  const ceiling = Math.min(16, Math.max(7, input.ceilingFt || 8));

  // Rooms are treated as equal squares, so the perimeter of n of them totalling A is
  // 4·√(A·n). Wrong for a bowling-alley hallway, close enough to quote a house.
  const perimeter = Math.round(4 * Math.sqrt(area * rooms));
  const doors = rooms;
  // Windows and openings take roughly an eighth of the wall face out of the paintable area.
  const wallSqFt = r5(perimeter * ceiling * 0.88);
  const trimLf = Math.max(0, perimeter - doors * 3);

  return { wallSqFt, ceilingSqFt: r5(area), perimeterLf: perimeter, trimLf, doors };
}

export function quoteRenovation(input: RenoInputs): PriceItem[] {
  const g = renoGeometry(input);
  const area = g.ceilingSqFt;
  // A paint-only job leaves the floor alone whatever the picker says.
  const floor =
    input.scope === "PAINT" || input.flooring === "NONE" ? null : FLOOR_LINE[input.flooring];
  const items: PriceItem[] = [];

  if (input.scope === "GUT") {
    items.push(at(RENO_LINES.demoStrip, area));
    if (floor) items.push(at(RENO_LINES.demoFloor, area));
    items.push(at(RENO_LINES.binHaul, Math.max(1, Math.ceil(area / 500))));
  } else if (floor) {
    items.push(at(RENO_LINES.demoFloor, area));
    items.push(at(RENO_LINES.dumpRun, Math.max(1, Math.ceil(area / 400))));
  }

  items.push(at(RENO_LINES.protection, 1));

  if (input.scope === "GUT") {
    // A gut rarely moves every wall: about a third of the perimeter comes back as new
    // partition, and the outside walls — call it 40% of the face — get insulated.
    items.push(at(RENO_LINES.framing, Math.round(g.perimeterLf * 0.35)));
    items.push(at(RENO_LINES.insulation, r5(g.wallSqFt * 0.4)));
    // Four points per room — doors track rooms one for one.
    items.push(at(RENO_LINES.elecPoint, g.doors * 4));
    items.push(at(RENO_LINES.potLight, Math.max(2, Math.round(area / 60))));
    items.push(at(RENO_LINES.circuit, Math.max(1, Math.round(g.doors / 2))));
    items.push(at(RENO_LINES.esaPermit, 1));
    items.push(at(RENO_LINES.drywallL4, g.wallSqFt + area));
    items.push(at(RENO_LINES.primer, g.wallSqFt + area));
  } else {
    // Existing board: what the painter charges for is the patching, not the whole wall.
    items.push(at(RENO_LINES.skimPrep, r5(g.wallSqFt * 0.25)));
  }

  items.push(at(RENO_LINES.paintWalls, g.wallSqFt));
  items.push(at(RENO_LINES.paintCeiling, area));

  if (floor) {
    items.push(at(RENO_LINES.floorPrep, area));
    items.push(at(floor, area));
  }

  if (input.scope === "GUT") {
    items.push(at(RENO_LINES.doorPrehung, g.doors));
    items.push(at(RENO_LINES.doorHardware, g.doors));
    // Both sides of a prehung opening take about 17 lf of casing.
    items.push(at(RENO_LINES.casing, g.doors * 17));
    items.push(at(RENO_LINES.baseboard, g.trimLf));
    // New doors and baseboard arrive primed, so the finish coat is still ours.
    items.push(at(RENO_LINES.paintDoor, g.doors));
    items.push(at(RENO_LINES.paintTrim, g.trimLf));
    items.push(at(RENO_LINES.buildingPermit, 1));
    items.push(at(RENO_LINES.supervision, Math.max(2, Math.round(area / 250))));
  } else if (input.scope === "REFRESH") {
    items.push(at(RENO_LINES.baseboard, g.trimLf));
    items.push(at(RENO_LINES.paintDoor, g.doors));
  } else {
    items.push(at(RENO_LINES.paintDoor, g.doors));
    items.push(at(RENO_LINES.paintTrim, g.trimLf));
  }

  items.push(at(RENO_LINES.finalClean, area));
  return items;
}
