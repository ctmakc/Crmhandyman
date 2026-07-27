/**
 * The price book — what a contractor actually sells, so an estimate is two clicks
 * instead of forty keystrokes.
 *
 * Prices are Ottawa-area 2026 starting points, deliberately round: they are meant to be
 * edited on the line, not trusted blindly. Anything a shop changes permanently belongs
 * in per-tenant settings (Wave 2), not here.
 */

export interface PriceItem {
  description: string;
  qty: number;
  unit: string;
  unitPrice: number;
}

export interface JobTemplate {
  id: string;
  trade: "HVAC" | "MOVING" | "GENERAL";
  label: string;
  hint: string;
  lineItems: PriceItem[];
}

/** Single lines a dispatcher drops into any estimate. */
export const PRICE_ITEMS: Array<PriceItem & { trade: JobTemplate["trade"] }> = [
  { trade: "HVAC", description: "Service call — diagnostic", qty: 1, unit: "ea", unitPrice: 149 },
  { trade: "HVAC", description: "Technician labour", qty: 1, unit: "hr", unitPrice: 115 },
  { trade: "HVAC", description: "After-hours / emergency surcharge", qty: 1, unit: "ea", unitPrice: 180 },
  { trade: "HVAC", description: "Refrigerant R-410A", qty: 1, unit: "lb", unitPrice: 85 },
  { trade: "HVAC", description: "Standard filter (16×25×1)", qty: 1, unit: "ea", unitPrice: 28 },
  { trade: "HVAC", description: "Media filter cabinet", qty: 1, unit: "ea", unitPrice: 340 },
  { trade: "HVAC", description: "Smart thermostat + setup", qty: 1, unit: "ea", unitPrice: 395 },
  { trade: "HVAC", description: "Old unit removal & disposal", qty: 1, unit: "ea", unitPrice: 175 },
  { trade: "HVAC", description: "Venting + fittings", qty: 1, unit: "lot", unitPrice: 380 },
  { trade: "MOVING", description: "Crew of 2 + 20ft truck", qty: 1, unit: "hr", unitPrice: 135 },
  { trade: "MOVING", description: "Crew of 3 + 26ft truck", qty: 1, unit: "hr", unitPrice: 165 },
  { trade: "MOVING", description: "Crew of 4 + 26ft truck", qty: 1, unit: "hr", unitPrice: 205 },
  { trade: "MOVING", description: "Travel time (yard to yard)", qty: 1, unit: "hr", unitPrice: 135 },
  { trade: "MOVING", description: "Packing materials kit", qty: 1, unit: "lot", unitPrice: 140 },
  { trade: "MOVING", description: "Wardrobe box rental", qty: 1, unit: "ea", unitPrice: 12 },
  { trade: "MOVING", description: "Piano / safe handling", qty: 1, unit: "ea", unitPrice: 320 },
  { trade: "MOVING", description: "Stair carry surcharge (per flight)", qty: 1, unit: "ea", unitPrice: 45 },
  { trade: "GENERAL", description: "General labour", qty: 1, unit: "hr", unitPrice: 85 },
  { trade: "GENERAL", description: "Materials", qty: 1, unit: "lot", unitPrice: 0 },
  { trade: "GENERAL", description: "Disposal / dump run", qty: 1, unit: "ea", unitPrice: 120 },
];

/** Whole jobs, priced the way the shop quotes them. */
export const JOB_TEMPLATES: JobTemplate[] = [
  {
    id: "furnace-swap",
    trade: "HVAC",
    label: "Furnace replacement",
    hint: "96% two-stage, same-day swap",
    lineItems: [
      { description: "High-efficiency furnace (96% two-stage)", qty: 1, unit: "ea", unitPrice: 3450 },
      { description: "Installation labour", qty: 8, unit: "hr", unitPrice: 115 },
      { description: "Venting + fittings", qty: 1, unit: "lot", unitPrice: 380 },
      { description: "Old unit removal & disposal", qty: 1, unit: "ea", unitPrice: 175 },
      { description: "Permit + inspection", qty: 1, unit: "ea", unitPrice: 210 },
    ],
  },
  {
    id: "ac-install",
    trade: "HVAC",
    label: "AC installation",
    hint: "3-ton condenser + coil",
    lineItems: [
      { description: "3-ton condenser", qty: 1, unit: "ea", unitPrice: 2650 },
      { description: "Evaporator coil", qty: 1, unit: "ea", unitPrice: 780 },
      { description: "Line set + electrical", qty: 1, unit: "lot", unitPrice: 460 },
      { description: "Installation labour", qty: 6, unit: "hr", unitPrice: 115 },
      { description: "Startup & commissioning", qty: 1, unit: "ea", unitPrice: 190 },
    ],
  },
  {
    id: "heat-pump",
    trade: "HVAC",
    label: "Heat pump install",
    hint: "Cold-climate, rebate-eligible",
    lineItems: [
      { description: "Cold-climate heat pump", qty: 1, unit: "ea", unitPrice: 6200 },
      { description: "Installation labour", qty: 12, unit: "hr", unitPrice: 115 },
      { description: "Electrical + disconnect", qty: 1, unit: "lot", unitPrice: 520 },
      { description: "Smart thermostat + setup", qty: 1, unit: "ea", unitPrice: 395 },
      { description: "Commissioning & rebate paperwork", qty: 1, unit: "ea", unitPrice: 240 },
    ],
  },
  {
    id: "seasonal-tuneup",
    trade: "HVAC",
    label: "Seasonal tune-up",
    hint: "Spring / fall maintenance visit",
    lineItems: [
      { description: "Maintenance visit — inspection & clean", qty: 1, unit: "ea", unitPrice: 189 },
      { description: "Standard filter (16×25×1)", qty: 1, unit: "ea", unitPrice: 28 },
    ],
  },
  {
    id: "duct-clean",
    trade: "HVAC",
    label: "Duct cleaning",
    hint: "Whole home, up to 12 vents",
    lineItems: [
      { description: "Duct cleaning — up to 12 vents", qty: 1, unit: "ea", unitPrice: 420 },
      { description: "Additional vents", qty: 0, unit: "ea", unitPrice: 25 },
      { description: "Standard filter (16×25×1)", qty: 1, unit: "ea", unitPrice: 28 },
    ],
  },
  {
    id: "move-1bed",
    trade: "MOVING",
    label: "1-bedroom move",
    hint: "Crew of 2, ~4 hours",
    lineItems: [
      { description: "Crew of 2 + 20ft truck", qty: 4, unit: "hr", unitPrice: 135 },
      { description: "Travel time (yard to yard)", qty: 1, unit: "hr", unitPrice: 135 },
      { description: "Packing materials kit", qty: 1, unit: "lot", unitPrice: 140 },
    ],
  },
  {
    id: "move-3bed",
    trade: "MOVING",
    label: "3-bedroom house move",
    hint: "Crew of 3, ~8 hours",
    lineItems: [
      { description: "Crew of 3 + 26ft truck", qty: 8, unit: "hr", unitPrice: 165 },
      { description: "Travel time (yard to yard)", qty: 1, unit: "hr", unitPrice: 165 },
      { description: "Packing materials kit", qty: 2, unit: "lot", unitPrice: 140 },
      { description: "Stair carry surcharge (per flight)", qty: 2, unit: "ea", unitPrice: 45 },
    ],
  },
  {
    id: "move-office",
    trade: "MOVING",
    label: "Office / commercial move",
    hint: "Crew of 4, after-hours",
    lineItems: [
      { description: "Crew of 4 + 26ft truck", qty: 10, unit: "hr", unitPrice: 205 },
      { description: "Travel time (yard to yard)", qty: 2, unit: "hr", unitPrice: 205 },
      { description: "Packing materials kit", qty: 4, unit: "lot", unitPrice: 140 },
      { description: "Disposal / dump run", qty: 1, unit: "ea", unitPrice: 120 },
    ],
  },
];

/**
 * The moving calculator. Movers quote by volume and access, not by line items —
 * this turns "3 bedrooms, 2 flights, 40 minutes away" into a priced crew.
 */
export interface MoveInputs {
  bedrooms: number;
  flights: number;
  travelHours: number;
  packing: boolean;
}

export function crewFor(bedrooms: number) {
  if (bedrooms <= 1) return { size: 2, truck: "20ft", rate: 135 };
  if (bedrooms <= 3) return { size: 3, truck: "26ft", rate: 165 };
  return { size: 4, truck: "26ft", rate: 205 };
}

/** Loading + unloading hours, before travel and stairs. */
export function baseHoursFor(bedrooms: number) {
  return Math.max(3, Math.round(bedrooms * 2.5 + 1));
}

export function quoteMove(input: MoveInputs): PriceItem[] {
  const crew = crewFor(input.bedrooms);
  const hours = baseHoursFor(input.bedrooms);
  const items: PriceItem[] = [
    {
      description: `Crew of ${crew.size} + ${crew.truck} truck`,
      qty: hours,
      unit: "hr",
      unitPrice: crew.rate,
    },
  ];
  if (input.travelHours > 0) {
    items.push({
      description: "Travel time (yard to yard)",
      qty: input.travelHours,
      unit: "hr",
      unitPrice: crew.rate,
    });
  }
  if (input.flights > 0) {
    items.push({
      description: "Stair carry surcharge (per flight)",
      qty: input.flights,
      unit: "ea",
      unitPrice: 45,
    });
  }
  if (input.packing) {
    items.push({
      description: "Packing materials kit",
      qty: Math.max(1, Math.ceil(input.bedrooms / 2)),
      unit: "lot",
      unitPrice: 140,
    });
  }
  return items;
}
