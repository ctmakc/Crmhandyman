import crypto from "crypto";
import { defangStamps } from "@/lib/lead-notes";

/**
 * Public lead intake from a contractor's own landing page.
 *
 * The endpoint is unauthenticated by design — a quiz on a marketing site cannot hold a
 * session — so the URL segment IS the credential. Only its digest is stored, the same
 * way a password is, because a leaked database must not hand an attacker the write
 * endpoints of every customer's landing page.
 */

/** Marks our keys in a log or a PHP config, and keeps them out of the path-segment soup. */
const KEY_PREFIX = "wo_";

/** 24 random bytes → 32 url-safe characters. Fits in a path segment untouched. */
export function generateIntakeKey(): string {
  return KEY_PREFIX + crypto.randomBytes(24).toString("base64url");
}

export function hashIntakeKey(key: string): string {
  return crypto.createHash("sha256").update(key, "utf8").digest("hex");
}

/**
 * Digest comparison that takes the same time whether the first byte differs or the last.
 * The lookup already happens on the hash column, so this guards the tail of the check:
 * a collation that considers two hex strings equal case-insensitively would otherwise
 * let a mangled key through.
 */
export function digestsMatch(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

/** The lead a landing page describes, once the payload has been cleaned up. */
export type IntakeLead = {
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  jobType?: string;
  /** The landing's own submission id (`event_id`), used to survive its retries. */
  externalId?: string;
  /** Quiz transcript in the order the visitor answered it. */
  answers: { label: string; value: string }[];
};

export type ParsedIntake = { ok: true; lead: IntakeLead } | { ok: false; error: string };

/** Fields the CRM stores in its own columns, plus the ad-tracking noise nobody reads. */
const CONSUMED = new Set([
  "name",
  "full_name",
  "phone",
  "phone_e164",
  "email",
  "address",
  "street",
  "city",
  "job_type",
  "jobtype",
  "event_id",
  "fbp",
  "fbc",
  "fbclid",
  "user_agent",
  "ua",
  "ip",
  "ts",
  "test_event_code",
]);

/** Question wording for the keys both live quizzes send. Anything else is humanised. */
const LABELS: Record<string, string> = {
  // Korvex renovation quiz
  service: "Service",
  scope: "Scope of work",
  property: "Property type",
  timing: "Timing",
  budget: "Budget",
  area: "Area",
  contact_pref: "Prefers contact by",
  // Beaver Movers quiz
  q_from: "Moving from",
  q_to: "Moving to",
  q_when: "When",
  q_size: "Home size",
  q_packing: "Packing",
  q_heavy: "Heavy items",
  // Common
  page: "Page",
  event_source_url: "Page",
  comment: "Comment",
  message: "Message",
  utm_source: "UTM source",
  utm_campaign: "UTM campaign",
};

function labelFor(key: string): string {
  const known = LABELS[key.toLowerCase()];
  if (known) return known;
  const words = key.replace(/^q[_-]/i, "").replace(/[_-]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Control characters would break the notes block and the Telegram-style copy-paste. */
function clean(value: string, max: number): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\x00-\x1F\x7F]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function scalar(value: unknown, max = 500): string {
  if (typeof value === "string") return clean(value, max);
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (Array.isArray(value)) {
    const parts = value.filter((v) => typeof v === "string" || typeof v === "number");
    return clean(parts.join(", "), max);
  }
  return "";
}

function pick(body: Record<string, unknown>, keys: string[], max: number): string {
  for (const key of keys) {
    const value = scalar(body[key], max);
    if (value) return value;
  }
  return "";
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function parseIntakePayload(body: unknown): ParsedIntake {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Expected a JSON object" };
  }
  const raw = body as Record<string, unknown>;

  const name = pick(raw, ["name", "full_name"], 120);
  if (!name) return { ok: false, error: "name is required" };

  const phone = pick(raw, ["phone", "phone_e164"], 40);
  const emailValue = pick(raw, ["email"], 200).toLowerCase();
  const email = EMAIL_RE.test(emailValue) ? emailValue : "";

  // One way to call back is the whole point of a lead. A row with neither is a bot
  // filling the form for the exercise.
  if (!phone && !email) return { ok: false, error: "phone or email is required" };

  const answers: { label: string; value: string }[] = [];
  for (const [key, value] of Object.entries(raw)) {
    if (CONSUMED.has(key.toLowerCase())) continue;
    const text = scalar(value);
    if (!text) continue;
    answers.push({ label: labelFor(key), value: text });
    if (answers.length >= 40) break;
  }

  return {
    ok: true,
    lead: {
      name,
      phone: phone || undefined,
      email: email || undefined,
      address: pick(raw, ["address", "street"], 200) || undefined,
      city: pick(raw, ["city"], 80) || undefined,
      jobType: pick(raw, ["job_type", "jobType", "service"], 80) || undefined,
      externalId: pick(raw, ["event_id"], 100) || undefined,
      answers,
    },
  };
}

/**
 * The owner reads this with his eyes in the lead card, so it is a transcript rather than
 * a JSON dump. Unanswered questions stay in: they tell him what to ask on the call.
 */
export function renderIntakeNotes(channel: string, lead: IntakeLead): string {
  const lines = [channel, ""];
  for (const answer of lead.answers) lines.push(`${answer.label}: ${answer.value}`);
  // The desk's call-log stamp is defanged out of visitor text: it shares this column,
  // and the response clock reads it as «somebody has already called this person».
  return defangStamps(lines.join("\n").trim().slice(0, 4000));
}

/**
 * Digits only, NANP numbers carrying their country code. The landing sends
 * «613-555-0100» and the desk stores «+1 613 555 0100» — string equality would call
 * those two different people.
 */
export function phoneDigits(value: string | null | undefined): string {
  if (!value) return "";
  const digits = value.replace(/\D+/g, "");
  return digits.length === 10 ? `1${digits}` : digits;
}
