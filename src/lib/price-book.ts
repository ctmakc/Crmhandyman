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

/** A rate without a quantity — what the book holds before anyone measures anything. */
export type PriceLine = Omit<PriceItem, "qty">;

/** The verticals the book covers. Order is the order the picker shows them in. */
export const TRADES = ["HVAC", "MOVING", "RENOVATION", "GENERAL"] as const;
export type Trade = (typeof TRADES)[number];

export interface JobTemplate {
  id: string;
  trade: Trade;
  label: string;
  hint: string;
  lineItems: PriceItem[];
}

/** Put a quantity on a book rate. Keeps templates and take-offs on one set of prices. */
export function at(line: PriceLine, qty: number): PriceItem {
  return { ...line, qty };
}

/**
 * Renovation rates, keyed so templates and the take-off (src/lib/renovation.ts) reference
 * them by name instead of retyping a string the owner might later edit.
 *
 * STARTING VALUES for Ottawa 2026, sell price with labour and standard material unless the
 * line says otherwise. Every shop's numbers differ by supplier deal, crew and season — the
 * owner edits these to match his own estimate sheet, and the line stays editable in the
 * estimate anyway. Nothing here is a quote.
 */
export const RENO_LINES = {
  // Demolition and disposal
  demoStrip: { description: "Demolition — walls, floors, fixtures", unit: "sq ft", unitPrice: 3.25 },
  demoBathroom: { description: "Bathroom strip-out to studs", unit: "ea", unitPrice: 950 },
  demoKitchen: { description: "Kitchen tear-out", unit: "ea", unitPrice: 1150 },
  demoFloor: { description: "Existing floor removal", unit: "sq ft", unitPrice: 1.85 },
  binHaul: { description: "Debris bin (14 yd) — drop & haul", unit: "ea", unitPrice: 720 },
  dumpRun: { description: "Dump run — cube van load", unit: "ea", unitPrice: 220 },

  // Framing, board and finishing levels
  framing: { description: "Interior partition framing 2×4", unit: "lf", unitPrice: 24 },
  insulation: { description: "Insulation & vapour barrier", unit: "sq ft", unitPrice: 3.1 },
  drywallL4: { description: "Drywall — hang & finish, Level 4", unit: "sq ft", unitPrice: 4.2 },
  drywallL5: { description: "Drywall — hang & finish, Level 5 smooth", unit: "sq ft", unitPrice: 5.4 },
  boardWet: { description: "Moisture-resistant board — wet areas", unit: "sq ft", unitPrice: 5.2 },
  skimPrep: { description: "Skim coat & prep over existing", unit: "sq ft", unitPrice: 1.6 },
  ceilingSmooth: { description: "Popcorn ceiling removal & smooth", unit: "sq ft", unitPrice: 3.8 },

  // Paint
  primer: { description: "Primer coat on new board", unit: "sq ft", unitPrice: 0.95 },
  paintWalls: { description: "Paint — walls, two coats", unit: "sq ft", unitPrice: 2.1 },
  paintCeiling: { description: "Paint — ceiling, two coats", unit: "sq ft", unitPrice: 1.65 },
  paintDoor: { description: "Paint — door & casing, both sides", unit: "ea", unitPrice: 130 },
  paintTrim: { description: "Paint — trim & baseboard", unit: "lf", unitPrice: 3.9 },

  // Floors
  floorPrep: { description: "Floor prep — level & underlay", unit: "sq ft", unitPrice: 2.1 },
  subfloor: { description: "Subfloor replacement", unit: "sq ft", unitPrice: 5.4 },
  laminate: { description: "Laminate — supply & install", unit: "sq ft", unitPrice: 6.5 },
  vinylPlank: { description: "Luxury vinyl plank — supply & install", unit: "sq ft", unitPrice: 7.8 },
  tileFloor: { description: "Porcelain tile floor — supply & install", unit: "sq ft", unitPrice: 14.5 },

  // Bathroom
  waterproofing: { description: "Shower waterproofing membrane", unit: "sq ft", unitPrice: 16.5 },
  tileSurround: { description: "Tub / shower surround tile", unit: "sq ft", unitPrice: 22 },
  tub: { description: "Bathtub — supply & install", unit: "ea", unitPrice: 1250 },
  showerBase: { description: "Shower base + glass door", unit: "ea", unitPrice: 1850 },
  toilet: { description: "Toilet — supply & install", unit: "ea", unitPrice: 620 },
  vanity: { description: "Vanity + top — supply & install", unit: "ea", unitPrice: 1450 },
  bathFan: { description: "Bathroom fan vented to exterior", unit: "ea", unitPrice: 480 },

  // Plumbing and electrical, counted in points the way the sub bills them
  plumbRough: { description: "Plumbing rough-in point", unit: "ea", unitPrice: 480 },
  plumbFinal: { description: "Plumbing fixture — final connect", unit: "ea", unitPrice: 260 },
  elecPoint: { description: "Outlet / switch point", unit: "ea", unitPrice: 195 },
  potLight: { description: "Pot light — supply & install", unit: "ea", unitPrice: 220 },
  fixtureInstall: { description: "Light fixture install (owner supplied)", unit: "ea", unitPrice: 130 },
  circuit: { description: "New 15A circuit from panel", unit: "ea", unitPrice: 420 },
  esaPermit: { description: "ESA permit & inspection", unit: "ea", unitPrice: 385 },

  // Kitchen
  cabinets: { description: "Kitchen cabinet installation", unit: "lf", unitPrice: 145 },
  counterQuartz: { description: "Quartz countertop — template & install", unit: "sq ft", unitPrice: 118 },
  sinkFaucet: { description: "Sink + faucet install", unit: "ea", unitPrice: 340 },
  backsplash: { description: "Backsplash tile", unit: "sq ft", unitPrice: 26 },
  applianceHookup: { description: "Appliance hookup", unit: "ea", unitPrice: 180 },

  // Doors and trim
  doorPrehung: { description: "Interior door — prehung, supply & install", unit: "ea", unitPrice: 480 },
  doorHardware: { description: "Door hardware set", unit: "ea", unitPrice: 95 },
  casing: { description: "Casing & trim — supply & install", unit: "lf", unitPrice: 9.5 },
  baseboard: { description: "Baseboard — supply & install", unit: "lf", unitPrice: 8.5 },

  // Crew, permits, housekeeping
  carpenterDay: { description: "Carpenter — day rate", unit: "day", unitPrice: 720 },
  labourerDay: { description: "Labourer — day rate", unit: "day", unitPrice: 420 },
  supervision: { description: "Site supervision & coordination", unit: "day", unitPrice: 320 },
  buildingPermit: { description: "City building permit — application & fees", unit: "lot", unitPrice: 520 },
  protection: { description: "Dust protection & floor masking", unit: "lot", unitPrice: 340 },
  finalClean: { description: "Final construction clean", unit: "sq ft", unitPrice: 0.9 },
  roomClean: { description: "Post-reno deep clean — single room", unit: "ea", unitPrice: 260 },
} satisfies Record<string, PriceLine>;

/** Single lines a dispatcher drops into any estimate. */
export const PRICE_ITEMS: Array<PriceItem & { trade: Trade }> = [
  { trade: "HVAC", description: "Service call — diagnostic", qty: 1, unit: "ea", unitPrice: 149 },
  { trade: "HVAC", description: "Technician labour", qty: 1, unit: "hr", unitPrice: 115 },
  { trade: "HVAC", description: "After-hours / emergency surcharge", qty: 1, unit: "ea", unitPrice: 180 },
  { trade: "HVAC", description: "Refrigerant R-410A", qty: 1, unit: "lb", unitPrice: 85 },
  { trade: "HVAC", description: "Standard filter (16×25×1)", qty: 1, unit: "ea", unitPrice: 28 },
  { trade: "HVAC", description: "Media filter cabinet", qty: 1, unit: "ea", unitPrice: 340 },
  { trade: "HVAC", description: "Smart thermostat + setup", qty: 1, unit: "ea", unitPrice: 395 },
  { trade: "HVAC", description: "Old unit removal & disposal", qty: 1, unit: "ea", unitPrice: 175 },
  { trade: "HVAC", description: "Venting + fittings", qty: 1, unit: "lot", unitPrice: 380 },
  /**
   * Crew and travel hours come from the calculator's own tiers rather than a second
   * copy of the rates. The travel line used to be a single flat $135 — the two-man
   * rate — so a dispatcher who added drive time by hand to a three- or four-man job
   * billed $30–70 an hour less than the calculator quoted for the same truck.
   */
  ...[1, 3, 4].flatMap((bedrooms) => {
    const crew = crewFor(bedrooms);
    return [
      {
        trade: "MOVING" as const,
        description: `Crew of ${crew.size} + ${crew.truck} truck`,
        qty: 1,
        unit: "hr",
        unitPrice: crew.rate,
      },
      {
        trade: "MOVING" as const,
        description: `Travel time — crew of ${crew.size} (yard to yard)`,
        qty: 1,
        unit: "hr",
        unitPrice: crew.rate,
      },
    ];
  }),
  { trade: "MOVING", description: "Packing materials kit", qty: 1, unit: "lot", unitPrice: 140 },
  { trade: "MOVING", description: "Wardrobe box rental", qty: 1, unit: "ea", unitPrice: 12 },
  { trade: "MOVING", description: "Piano / safe handling", qty: 1, unit: "ea", unitPrice: 320 },
  { trade: "MOVING", description: "Stair carry surcharge (per flight)", qty: 1, unit: "ea", unitPrice: 45 },
  // Renovation ships the whole book: a reno estimate is forty lines, and the picker is
  // the only place the estimator gets them without typing.
  ...Object.values(RENO_LINES).map((line) => ({ trade: "RENOVATION" as const, qty: 1, ...line })),
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
  /**
   * The residential move templates are GENERATED by the calculator. Typed out by hand,
   * the 3-bedroom sheet quoted 8 hours while the calculator quoted 9 for the same
   * house — the price of a job depended on which screen the estimator opened first.
   */
  {
    id: "move-1bed",
    trade: "MOVING",
    label: "1-bedroom move",
    hint: `Crew of ${crewFor(1).size}, ~${baseHoursFor(1)} hours`,
    lineItems: quoteMove({ bedrooms: 1, flights: 0, travelHours: 1, packing: true }),
  },
  {
    id: "move-3bed",
    trade: "MOVING",
    label: "3-bedroom house move",
    hint: `Crew of ${crewFor(3).size}, ~${baseHoursFor(3)} hours`,
    lineItems: quoteMove({ bedrooms: 3, flights: 2, travelHours: 1, packing: true }),
  },
  {
    id: "move-office",
    trade: "MOVING",
    label: "Office / commercial move",
    // Bespoke on purpose: an office is quoted by floor and lift access, not bedrooms.
    hint: "Crew of 4, after-hours",
    lineItems: [
      { description: "Crew of 4 + 26ft truck", qty: 10, unit: "hr", unitPrice: 205 },
      { description: "Travel time (yard to yard)", qty: 2, unit: "hr", unitPrice: 205 },
      { description: "Packing materials kit", qty: 4, unit: "lot", unitPrice: 140 },
      { description: "Disposal / dump run", qty: 1, unit: "ea", unitPrice: 120 },
    ],
  },
  {
    id: "reno-repaint",
    trade: "RENOVATION",
    label: "Apartment repaint",
    hint: "2-bed, ~850 sq ft — walls, ceilings, trim",
    lineItems: [
      at(RENO_LINES.protection, 1),
      at(RENO_LINES.skimPrep, 420),
      at(RENO_LINES.paintWalls, 1870),
      at(RENO_LINES.paintCeiling, 850),
      at(RENO_LINES.paintDoor, 6),
      at(RENO_LINES.paintTrim, 230),
      at(RENO_LINES.finalClean, 850),
    ],
  },
  {
    id: "reno-bathroom",
    trade: "RENOVATION",
    label: "Bathroom — full gut",
    hint: "5×8, tub-shower, tile to ceiling",
    lineItems: [
      at(RENO_LINES.demoBathroom, 1),
      at(RENO_LINES.dumpRun, 2),
      at(RENO_LINES.plumbRough, 4),
      at(RENO_LINES.elecPoint, 3),
      at(RENO_LINES.bathFan, 1),
      at(RENO_LINES.boardWet, 220),
      at(RENO_LINES.waterproofing, 60),
      at(RENO_LINES.tileSurround, 90),
      at(RENO_LINES.tileFloor, 40),
      at(RENO_LINES.tub, 1),
      at(RENO_LINES.toilet, 1),
      at(RENO_LINES.vanity, 1),
      at(RENO_LINES.plumbFinal, 3),
      at(RENO_LINES.paintWalls, 200),
      at(RENO_LINES.roomClean, 1),
    ],
  },
  {
    id: "reno-basement",
    trade: "RENOVATION",
    label: "Basement finishing",
    hint: "~700 sq ft, open plan, no wet rooms",
    lineItems: [
      at(RENO_LINES.buildingPermit, 1),
      at(RENO_LINES.framing, 130),
      at(RENO_LINES.insulation, 900),
      at(RENO_LINES.elecPoint, 14),
      at(RENO_LINES.potLight, 12),
      at(RENO_LINES.circuit, 3),
      at(RENO_LINES.esaPermit, 1),
      at(RENO_LINES.drywallL4, 2100),
      at(RENO_LINES.primer, 2100),
      at(RENO_LINES.paintWalls, 1400),
      at(RENO_LINES.paintCeiling, 700),
      at(RENO_LINES.floorPrep, 700),
      at(RENO_LINES.vinylPlank, 700),
      at(RENO_LINES.doorPrehung, 3),
      at(RENO_LINES.baseboard, 260),
      at(RENO_LINES.finalClean, 700),
    ],
  },
  {
    id: "reno-kitchen",
    trade: "RENOVATION",
    label: "Kitchen renovation",
    hint: "18 lf of cabinets, quartz, same layout",
    lineItems: [
      at(RENO_LINES.demoKitchen, 1),
      at(RENO_LINES.dumpRun, 2),
      at(RENO_LINES.plumbRough, 2),
      at(RENO_LINES.elecPoint, 8),
      at(RENO_LINES.circuit, 2),
      at(RENO_LINES.skimPrep, 300),
      at(RENO_LINES.cabinets, 18),
      at(RENO_LINES.counterQuartz, 38),
      at(RENO_LINES.sinkFaucet, 1),
      at(RENO_LINES.backsplash, 34),
      at(RENO_LINES.applianceHookup, 4),
      at(RENO_LINES.floorPrep, 180),
      at(RENO_LINES.vinylPlank, 180),
      at(RENO_LINES.paintWalls, 320),
      at(RENO_LINES.roomClean, 1),
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
