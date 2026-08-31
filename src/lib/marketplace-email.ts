import crypto from "crypto";

export type InboundEmailSource =
  | "GOOGLE"
  | "GOOGLE_LSA"
  | "HOMESTARS"
  | "KIJIJI"
  | "BARK"
  | "URBANTASKER"
  | "MOVINGWALDO"
  | "EMAIL";

export interface ParsedInboundLeadEmail {
  source: InboundEmailSource;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  jobType?: string;
  providerLeadId?: string;
  sourceLeadId: string;
}

const LABELS: Record<string, readonly string[]> = {
  name: [
    "customer name",
    "homeowner name",
    "client name",
    "contact name",
    "customer",
    "homeowner",
    "client",
    "name",
  ],
  firstName: ["first name", "firstname"],
  lastName: ["last name", "lastname", "surname"],
  email: [
    "email address",
    "e-mail address",
    "customer email",
    "contact email",
    "email",
    "e-mail",
  ],
  phone: [
    "phone number",
    "telephone number",
    "mobile number",
    "customer phone",
    "contact phone",
    "phone",
    "telephone",
    "mobile",
    "tel",
  ],
  address: ["moving from", "from address", "service address", "street address", "address"],
  city: ["city", "town", "location", "service area"],
  jobType: [
    "service requested",
    "service needed",
    "job type",
    "project type",
    "category",
    "service",
    "project",
  ],
  leadId: [
    "lead id",
    "lead #",
    "request id",
    "request #",
    "enquiry id",
    "inquiry id",
    "reference id",
    "reference #",
  ],
};

const PLATFORM_DOMAINS = [
  "homestars.com",
  "bark.com",
  "urbantasker.com",
  "google.com",
  "googlemail.com",
  "kijiji.ca",
  "kijiji.com",
  "movingwaldo.com",
];

const SOURCE_LABELS: Record<InboundEmailSource, string> = {
  GOOGLE: "Google",
  GOOGLE_LSA: "Google LSA",
  HOMESTARS: "HomeStars",
  KIJIJI: "Kijiji",
  BARK: "Bark",
  URBANTASKER: "UrbanTasker",
  MOVINGWALDO: "MovingWaldo",
  EMAIL: "Email",
};

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function cleanValue(value: string | undefined): string | undefined {
  const cleaned = value
    ?.replace(/^\s*[•*-]\s*/, "")
    .replace(/^['\"]|['\"]$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || undefined;
}

function labeledValue(text: string, labels: readonly string[]): string | undefined {
  const names = labels.map(escapeRegex).join("|");
  const match = text.match(new RegExp(`^\\s*(?:${names})\\s*[:=\\-–—]\\s*(.+?)\\s*$`, "im"));
  return cleanValue(match?.[1]);
}

function senderEmail(from: string): string | undefined {
  return from.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/)?.[0]?.toLowerCase();
}

function senderName(from: string): string | undefined {
  const angle = from.match(/^\s*["']?(.+?)["']?\s*<[^>]+>\s*$/);
  if (angle?.[1]) return cleanValue(angle[1]);
  const local = from.match(/^\s*([^@<]+)@/);
  return cleanValue(local?.[1]);
}

function isPlatformEmail(value: string, from: string): boolean {
  const email = value.toLowerCase();
  if (email === senderEmail(from)) return true;
  const domain = email.split("@")[1] ?? "";
  return PLATFORM_DOMAINS.some((known) => domain === known || domain.endsWith(`.${known}`));
}

function customerEmail(body: string, from: string): string | undefined {
  const labeled = labeledValue(body, LABELS.email);
  if (labeled) {
    const exact = labeled.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/)?.[0];
    if (exact && !isPlatformEmail(exact, from)) return exact.toLowerCase();
  }

  const candidates = body.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) ?? [];
  return candidates.map((v) => v.toLowerCase()).find((v) => !isPlatformEmail(v, from));
}

function customerPhone(body: string): string | undefined {
  const labeled = labeledValue(body, LABELS.phone);
  const fromLabel = labeled?.match(
    /(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}/
  )?.[0];
  if (fromLabel) return cleanValue(fromLabel);

  return cleanValue(
    body.match(/(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}/)?.[0]
  );
}

export function detectInboundEmailSource(
  from: string,
  subject: string,
  body = ""
): InboundEmailSource {
  const head = `${from}\n${subject}\n${body.slice(0, 2500)}`.toLowerCase();

  if (head.includes("movingwaldo")) return "MOVINGWALDO";
  if (head.includes("urbantasker")) return "URBANTASKER";
  if (head.includes("homestars")) return "HOMESTARS";
  if (/\bbark\b/.test(head) || head.includes("bark.com")) return "BARK";
  if (head.includes("kijiji")) return "KIJIJI";

  const google = head.includes("google");
  if (
    google &&
    (head.includes("local services") ||
      head.includes("local service ad") ||
      head.includes("local services ad") ||
      head.includes("google guaranteed") ||
      /\blsa\b/.test(head))
  ) {
    return "GOOGLE_LSA";
  }
  if (google) return "GOOGLE";

  return "EMAIL";
}

/**
 * Mailgun normally gives us the RFC Message-ID. That is the best replay key: one provider
 * notification can hit the webhook twice without becoming two sales calls. Some forwarded
 * mail loses the header, so the fallback hashes the immutable notification itself rather
 * than deduping every request from the same customer for thirty days.
 */
export function inboundEmailSourceLeadId(input: {
  messageId?: string;
  from: string;
  subject: string;
  body: string;
}): string {
  const messageId = input.messageId?.trim().replace(/^<|>$/g, "");
  if (messageId) return `email:${messageId.slice(0, 500)}`;

  const digest = crypto
    .createHash("sha256")
    .update(input.from)
    .update("\n")
    .update(input.subject)
    .update("\n")
    .update(input.body)
    .digest("hex");
  return `email-sha256:${digest}`;
}

export function parseInboundLeadEmail(input: {
  from: string;
  subject: string;
  body: string;
  messageId?: string;
}): ParsedInboundLeadEmail {
  const { from, subject, body } = input;
  const source = detectInboundEmailSource(from, subject, body);

  const explicitName = labeledValue(body, LABELS.name);
  const firstName = labeledValue(body, LABELS.firstName);
  const lastName = labeledValue(body, LABELS.lastName);
  const splitName = cleanValue([firstName, lastName].filter(Boolean).join(" "));

  const providerLeadId = labeledValue(body, LABELS.leadId);
  const address = labeledValue(body, LABELS.address);
  const city = labeledValue(body, LABELS.city);
  const jobType = labeledValue(body, LABELS.jobType);
  const bodyCustomerEmail = customerEmail(body, from);

  // A marketplace's display name is not a customer. Only generic email falls back to the
  // sender's identity; platform notifications use a truthful placeholder when the
  // provider withholds the homeowner's details until the lead is purchased/unlocked.
  const name =
    explicitName ??
    splitName ??
    (source === "EMAIL" ? senderName(from) : undefined) ??
    `${SOURCE_LABELS[source]} lead`;

  return {
    source,
    name,
    email: bodyCustomerEmail ?? (source === "EMAIL" ? senderEmail(from) : undefined),
    phone: customerPhone(body),
    address,
    city,
    jobType,
    providerLeadId,
    sourceLeadId: inboundEmailSourceLeadId(input),
  };
}
