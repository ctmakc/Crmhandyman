export const LEAD_OUTCOMES = [
  "NO_ANSWER",
  "CONNECTED",
  "CALL_BACK",
  "QUALIFIED",
  "QUOTE_SENT",
  "BOOKED",
  "NOT_INTERESTED",
  "BAD_LEAD",
] as const;

export type LeadOutcome = (typeof LEAD_OUTCOMES)[number];

export type LeadOutcomePlan = {
  status: "CONTACTED" | "VERIFIED" | "REJECTED";
  label: string;
  terminal: boolean;
};

const PLANS: Record<LeadOutcome, LeadOutcomePlan> = {
  NO_ANSWER: { status: "CONTACTED", label: "no answer", terminal: false },
  CONNECTED: { status: "CONTACTED", label: "connected", terminal: false },
  CALL_BACK: { status: "CONTACTED", label: "call back", terminal: false },
  QUALIFIED: { status: "VERIFIED", label: "qualified", terminal: false },
  QUOTE_SENT: { status: "VERIFIED", label: "quote sent", terminal: false },
  // BOOKED is deliberately not CONVERTED. A booked move still needs the job's date,
  // address and crew; /convert creates that Project and is the one door allowed to set
  // CONVERTED. This outcome only records the sales result until the dispatcher opens it.
  BOOKED: { status: "VERIFIED", label: "booked — open the job", terminal: false },
  NOT_INTERESTED: { status: "REJECTED", label: "not interested", terminal: true },
  BAD_LEAD: { status: "REJECTED", label: "bad lead", terminal: true },
};

export function leadOutcome(raw: unknown): LeadOutcome | null {
  if (typeof raw !== "string") return null;
  return (LEAD_OUTCOMES as readonly string[]).includes(raw) ? (raw as LeadOutcome) : null;
}

export function outcomePlan(outcome: LeadOutcome): LeadOutcomePlan {
  return PLANS[outcome];
}

/**
 * A follow-up timestamp arrives from a browser or automation as ISO text. Invalid dates
 * are refused before Prisma sees them; a date in the past is still allowed because a
 * dispatcher may be entering an already-overdue promise from a phone call.
 */
export function followUpDate(raw: unknown): Date | null | undefined {
  if (raw === undefined || raw === null || raw === "") return undefined;
  if (typeof raw !== "string") return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function leadTaskMarker(leadId: string): string {
  return `[[LEAD:${leadId}]]`;
}
