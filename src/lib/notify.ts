import { prisma } from "@/lib/prisma";
import { record } from "@/lib/audit";
import { mailer, smtpConfigured, smtpFrom } from "@/lib/mailer";
import { tokenHint } from "@/lib/secrets";

/**
 * NEW-LEAD ALERTS (ROADMAP: speed of response).
 *
 * A contractor who pays for traffic wins the job by calling first. The lead is already
 * safe in the database the moment it arrives; this file exists so the owner learns about
 * it without watching a screen, and can dial from the message itself.
 *
 * Three rules shape everything below:
 *
 *   1. Delivery never gates intake. Every path here is caught, and the caller ignores
 *      the result — losing the alert is a bad day, losing the lead is a lost customer.
 *   2. What happened is written into the journal, including failure. Silence about a
 *      broken bot token is worse than the broken token: the owner would go on believing
 *      the channel works.
 *   3. The Telegram bot belongs to the contractor, not to the platform. It is tenant
 *      data, it lives with his other channel credentials, and it never leaves the
 *      server — the API answers with a hint, never with the token.
 */

/**
 * Where the settings live. `ChannelIntegration` already is the shelf for a workspace's
 * channel credentials, and the phase after «Cents» froze the schema — so no migration.
 *
 * The mixed case started as a hiding place: the generic channel route served whole rows,
 * tokens included, to anyone signed in, and could only ever address a channel spelled in
 * capitals. That route is now admin-only and answers with a hint instead of a secret, so
 * the spelling is no longer load-bearing — it stays as written because rows in live
 * databases carry it.
 */
const CHANNEL = "Notify";

/**
 * An ad burst must not become a hundred messages in a row. The first lead of a quiet
 * stretch goes out at once — that is the whole point — and anything arriving inside the
 * next minute is collected into one follow-up message.
 */
const THROTTLE_MS = 60_000;

/** A message a person reads on a phone. Past this the digest counts the rest. */
const MAX_LEADS_IN_MESSAGE = 12;

/** Ceiling on one sweep, so a forgotten workspace cannot build an unbounded query. */
const PENDING_LIMIT = 60;

/**
 * The first alert of a freshly configured workspace covers the last quarter hour only.
 * Without this the watermark would start at zero and the owner's first message would be
 * his entire lead history.
 */
const FIRST_RUN_LOOKBACK_MS = 15 * 60_000;

/** Neither channel may hold the visitor's thank-you page hostage. */
const CHANNEL_TIMEOUT_MS = 4_000;

/**
 * Telegram refuses a message over 4096 characters outright. The quiz transcript rides
 * inside a single-lead alert and the notes column holds 4000 of its own, so a long
 * enough questionnaire produced no message at all — and the watermark had already moved,
 * so that lead never got a second chance at a ping. Trimmed to fit instead, with the
 * phone number and the link kept, because those are what the message is FOR.
 */
const TELEGRAM_MAX = 4096;

/** A timer this long re-checks and re-arms rather than sleeping through a day. */
const MAX_TIMER_MS = 6 * 60 * 60 * 1000;

const DEFAULT_TIMEZONE = "America/Toronto";

/* ==========================================================================
   Settings
   ========================================================================== */

/** What the owner's screen sees. The token is represented, never returned. */
export type NotificationSettings = {
  isActive: boolean;
  /** Empty means «send to the workspace owner's address». */
  email: string;
  telegramChatId: string;
  /** `""` when no token is stored, otherwise `••••1234`. */
  telegramTokenHint: string;
  /** `HH:MM`, both empty when the owner wants alerts at any hour. */
  quietFrom: string;
  quietTo: string;
  timezone: string;
  /** Last attempt, as the owner would describe it. */
  lastSentAt: string | null;
  lastResult: string;
  lastDelivered: boolean;
};

export type SettingsInput = {
  isActive?: unknown;
  email?: unknown;
  telegramChatId?: unknown;
  /** Absent or `""` keeps the stored token; `null` deletes it. */
  telegramToken?: unknown;
  quietFrom?: unknown;
  quietTo?: unknown;
  timezone?: unknown;
};

type StoredConfig = {
  email?: string;
  quietFrom?: string;
  quietTo?: string;
  timezone?: string;
  lastSentAt?: string;
  lastResult?: string;
  lastDelivered?: boolean;
  /**
   * The end of the quiet window the journal has already been told about. While now is
   * before this, a fresh lead is held silently — the batch is written down in full when
   * it actually goes out.
   */
  heldNotedUntil?: string;
};

type Row = {
  id: string;
  isActive: boolean;
  accessToken: string | null;
  pageId: string | null;
  config: string | null;
  lastSyncAt: Date | null;
};

function loadRow(tenantId: string): Promise<Row | null> {
  return prisma.channelIntegration.findUnique({
    where: { tenantId_channel: { tenantId, channel: CHANNEL } },
    select: { id: true, isActive: true, accessToken: true, pageId: true, config: true, lastSyncAt: true },
  });
}

function parseConfig(raw: string | null): StoredConfig {
  if (!raw) return {};
  try {
    const value = JSON.parse(raw);
    return value && typeof value === "object" ? (value as StoredConfig) : {};
  } catch {
    return {};
  }
}

/** Masking lives in `@/lib/secrets` — one answer for every credential on every screen. */
export { tokenHint };

function settingsOf(row: Row | null): NotificationSettings {
  const config = parseConfig(row?.config ?? null);
  return {
    isActive: Boolean(row?.isActive),
    email: config.email ?? "",
    telegramChatId: row?.pageId ?? "",
    telegramTokenHint: tokenHint(row?.accessToken),
    quietFrom: config.quietFrom ?? "",
    quietTo: config.quietTo ?? "",
    timezone: config.timezone || DEFAULT_TIMEZONE,
    lastSentAt: config.lastSentAt ?? null,
    lastResult: config.lastResult ?? "",
    lastDelivered: Boolean(config.lastDelivered),
  };
}

export async function readNotificationSettings(tenantId: string): Promise<NotificationSettings> {
  return settingsOf(await loadRow(tenantId));
}

/* ==========================================================================
   Validation — the owner types all of this by hand
   ========================================================================== */

/** `"21:30"` → minutes past local midnight; anything else → null. */
export function parseClock(value: string): number | null {
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

export function validTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** `123456:AA…` as BotFather issues it. Checked so a pasted half-token fails loudly. */
const TOKEN_RE = /^\d{5,}:[A-Za-z0-9_-]{30,}$/;

/** A numeric chat id (groups are negative) or an @channel name. */
const CHAT_ID_RE = /^(-?\d{5,20}|@[A-Za-z][A-Za-z0-9_]{4,31})$/;

export type WriteResult =
  | { ok: true; settings: NotificationSettings; changed: string[] }
  | { ok: false; error: string };

/**
 * Saves what the owner typed. Missing keys are left alone, so the screen can send one
 * field without wiping the rest, and the token has three states rather than two:
 * absent keeps it, `null` removes it, a string replaces it.
 */
export async function writeNotificationSettings(
  tenantId: string,
  input: SettingsInput
): Promise<WriteResult> {
  const row = await loadRow(tenantId);
  const current = settingsOf(row);
  const config = parseConfig(row?.config ?? null);
  const changed: string[] = [];

  const text = (value: unknown, max: number) => String(value ?? "").trim().slice(0, max);

  if (input.email !== undefined) {
    const email = text(input.email, 200).toLowerCase();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      return { ok: false, error: "That email address does not look right" };
    }
    if (email !== current.email) changed.push("email");
    config.email = email;
  }

  if (input.timezone !== undefined) {
    const timezone = text(input.timezone, 60) || DEFAULT_TIMEZONE;
    if (!validTimezone(timezone)) return { ok: false, error: "Unknown time zone" };
    if (timezone !== current.timezone) changed.push("time zone");
    config.timezone = timezone;
  }

  for (const key of ["quietFrom", "quietTo"] as const) {
    if (input[key] === undefined) continue;
    const clock = text(input[key], 5);
    if (clock && parseClock(clock) === null) {
      return { ok: false, error: "Quiet hours are two times of day, like 21:00 and 07:30" };
    }
    if (clock !== current[key]) changed.push("quiet hours");
    config[key] = clock;
  }

  // Both ends or neither: one lonely bound is an ambiguous window, and guessing at the
  // other end would silence the shop's phone on a hunch.
  const from = config.quietFrom ?? "";
  const to = config.quietTo ?? "";
  if (Boolean(from) !== Boolean(to)) {
    return { ok: false, error: "Set both ends of the quiet window, or clear both" };
  }

  const data: Record<string, unknown> = {};

  if (input.telegramChatId !== undefined) {
    const chatId = text(input.telegramChatId, 40);
    if (chatId && !CHAT_ID_RE.test(chatId)) {
      return { ok: false, error: "Chat id is a number from the bot, like 123456789" };
    }
    if (chatId !== current.telegramChatId) changed.push("Telegram chat");
    data.pageId = chatId || null;
  }

  if (input.telegramToken === null) {
    data.accessToken = null;
    changed.push("Telegram token removed");
  } else if (typeof input.telegramToken === "string" && input.telegramToken.trim()) {
    const token = input.telegramToken.trim();
    if (!TOKEN_RE.test(token)) {
      return { ok: false, error: "That is not a bot token — BotFather issues 123456:AA…" };
    }
    data.accessToken = token;
    changed.push("Telegram token");
  }

  const turningOn = input.isActive !== undefined && Boolean(input.isActive) && !current.isActive;
  if (input.isActive !== undefined) {
    if (Boolean(input.isActive) !== current.isActive) {
      changed.push(Boolean(input.isActive) ? "alerts on" : "alerts off");
    }
    data.isActive = Boolean(input.isActive);
  }

  data.config = JSON.stringify(config);

  // Switching alerts on draws a line under everything that came before: the owner asked
  // to hear about the next lead, not about last month's. A save that leaves them on
  // keeps the watermark, so fixing a wrong token still delivers what is waiting.
  if (turningOn || !row) data.lastSyncAt = new Date();

  const saved = await prisma.channelIntegration.upsert({
    where: { tenantId_channel: { tenantId, channel: CHANNEL } },
    update: data,
    create: {
      tenantId,
      channel: CHANNEL,
      isActive: Boolean(data.isActive ?? false),
      accessToken: (data.accessToken as string | null) ?? null,
      pageId: (data.pageId as string | null) ?? null,
      config: data.config as string,
      lastSyncAt: new Date(),
    },
    select: { id: true, isActive: true, accessToken: true, pageId: true, config: true, lastSyncAt: true },
  });

  return { ok: true, settings: settingsOf(saved), changed };
}

/* ==========================================================================
   Quiet hours — the mover at 23:40 does not want a call from a robot
   ========================================================================== */

/** Minutes past midnight where the shop actually is, not where the server is. */
export function minutesInZone(at: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(at);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0") % 24;
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return hour * 60 + minute;
}

type Window = { from: number; to: number };

function quietWindow(settings: NotificationSettings): Window | null {
  const from = parseClock(settings.quietFrom || "");
  const to = parseClock(settings.quietTo || "");
  // Equal ends would mean silence around the clock — that is a mistake, not a policy.
  if (from === null || to === null || from === to) return null;
  return { from, to };
}

/** The window wraps midnight far more often than not: 21:00 → 07:30. */
export function isQuiet(at: Date, settings: NotificationSettings): boolean {
  const window = quietWindow(settings);
  if (!window) return false;
  const now = minutesInZone(at, settings.timezone);
  return window.from < window.to
    ? now >= window.from && now < window.to
    : now >= window.from || now < window.to;
}

/** Half a minute past the end, so the timer lands inside the morning, never on its edge. */
export function msUntilQuietEnds(at: Date, settings: NotificationSettings): number {
  const window = quietWindow(settings);
  if (!window) return 0;
  const now = minutesInZone(at, settings.timezone);
  const delta = (window.to - now + 1440) % 1440 || 1440;
  return delta * 60_000 + 30_000;
}

/* ==========================================================================
   The message — written to be dialled from, without opening the CRM
   ========================================================================== */

export type LeadLine = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  city: string | null;
  jobType: string | null;
  source: string;
  notes: string | null;
  createdAt: Date;
};

export type Shop = { businessName: string; slug: string; ownerEmail: string };

function clockAt(at: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(at);
}

/**
 * The number, written so the phone will dial it.
 *
 * Telegram only turns a number into a tap target when it is in international form, and
 * the landings send «613-555-0231». Without the country code the owner's move was long
 * press → copy → open dialler → paste, on the one message whose entire purpose is to be
 * called back from — while a competitor is dialling. Ten digits is a North American
 * number; eleven starting with 1 is the same number already carrying its code. Anything
 * else is left exactly as the customer wrote it, because a guess about a foreign number
 * is worse than no formatting.
 */
export function dialable(phone: string | null | undefined): string {
  const raw = (phone ?? "").trim();
  if (!raw) return "";
  if (raw.startsWith("+")) return raw;

  const digits = raw.replace(/\D+/g, "");
  if (digits.length === 10) return `+1 ${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
  if (digits.length === 11 && digits.startsWith("1"))
    return `+1 ${digits.slice(1, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
  return raw;
}

/** «14 min», «2 h 05 min», «3 d» — the wait, in words a person says out loud. */
export function waitedText(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ${String(minutes % 60).padStart(2, "0")} min ago`;
  return `${Math.floor(hours / 24)} d ${hours % 24} h ago`;
}

/**
 * The card's address. `?tenant=` wins over the host everywhere in the middleware, so one
 * form of this link works on localhost, on the apex and on a workspace subdomain alike.
 * With NEXTAUTH_URL unset there is no honest origin to build from, and the message goes
 * out with the phone number and no link rather than with a broken one.
 */
function leadUrl(slug: string, id: string): string {
  let origin = "";
  try {
    origin = new URL(process.env.NEXTAUTH_URL ?? "").origin;
  } catch {
    return "";
  }
  return `${origin}/leads/${id}?tenant=${encodeURIComponent(slug)}`;
}

/**
 * Quiz answers as the visitor gave them. The first line of an intake note is the channel
 * label, which the header already carries, so it is dropped here.
 *
 * Bounded in characters as well as in lines: the notes column holds 4000 and Telegram
 * refuses anything over 4096, so a long questionnaire used to produce no message at all
 * — and the watermark had already moved past that lead, so no later message carried it
 * either. The name, the number and the link are what the alert is for; the transcript
 * gives way first.
 */
const TRANSCRIPT_MAX_CHARS = 1_200;

function transcript(notes: string | null, limit: number): string[] {
  const lines = (notes ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(1, 1 + limit);

  const kept: string[] = [];
  let budget = TRANSCRIPT_MAX_CHARS;
  for (const line of lines) {
    if (line.length + 1 > budget) {
      kept.push("…");
      break;
    }
    kept.push(line);
    budget -= line.length + 1;
  }
  return kept;
}

export type Message = { subject: string; text: string };

export function composeMessage(
  shop: Shop,
  leads: LeadLine[],
  settings: NotificationSettings,
  opts: { heldForQuietHours?: boolean; now?: Date } = {}
): Message {
  const now = opts.now ?? new Date();
  const zone = settings.timezone;

  if (leads.length === 1) {
    const lead = leads[0];
    const detail = [lead.jobType, lead.city].filter(Boolean).join(" · ");
    const lines = [
      `NEW LEAD · ${shop.businessName}`,
      "",
      lead.name,
      dialable(lead.phone) || "no phone given",
    ];
    if (lead.email) lines.push(lead.email);
    if (detail) lines.push(detail);
    lines.push(
      `Came in ${clockAt(lead.createdAt, zone)} · ${waitedText(now.getTime() - lead.createdAt.getTime())} · via ${lead.source}`
    );

    const answers = transcript(lead.notes, 10);
    if (answers.length) lines.push("", ...answers);

    const url = leadUrl(shop.slug, lead.id);
    if (url) lines.push("", url);

    return {
      subject: `New lead · ${lead.name}${lead.phone ? ` · ${dialable(lead.phone)}` : ""}`,
      text: lines.join("\n"),
    };
  }

  const shown = leads.slice(0, MAX_LEADS_IN_MESSAGE);
  const header = opts.heldForQuietHours
    ? `${leads.length} NEW LEADS WHILE YOU SLEPT · ${shop.businessName}`
    : `${leads.length} NEW LEADS · ${shop.businessName}`;
  const lines = [header, ""];

  shown.forEach((lead, i) => {
    const detail = [lead.jobType, lead.city].filter(Boolean).join(" · ");
    lines.push(
      `${i + 1}. ${lead.name} · ${dialable(lead.phone) || "no phone"} · ${clockAt(lead.createdAt, zone)}`
    );
    if (detail) lines.push(`   ${detail} · via ${lead.source}`);
    const url = leadUrl(shop.slug, lead.id);
    if (url) lines.push(`   ${url}`);
  });

  if (leads.length > shown.length) {
    lines.push("", `…and ${leads.length - shown.length} more waiting on the sheet.`);
  }

  return {
    subject: `${leads.length} new leads · ${shop.businessName}`,
    text: lines.join("\n"),
  };
}

/* ==========================================================================
   Delivery
   ========================================================================== */

type Delivery = { ok: boolean; detail: string };

async function sendTelegram(token: string, chatId: string, message: string): Promise<Delivery> {
  // Backstop. `composeMessage` already bounds the transcript, so reaching this means the
  // message is long for some other reason — and a trimmed alert beats a refused one.
  const text =
    message.length <= TELEGRAM_MAX
      ? message
      : `${message.slice(0, TELEGRAM_MAX - 20)}\n… trimmed`;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
      signal: AbortSignal.timeout(CHANNEL_TIMEOUT_MS),
    });
    const body = (await res.json().catch(() => ({}))) as { ok?: boolean; description?: string };
    if (res.ok && body.ok) return { ok: true, detail: "Telegram delivered" };
    // Telegram says exactly what is wrong («chat not found», «Unauthorized»). Carry its
    // own words into the journal — a status code teaches the owner nothing.
    return { ok: false, detail: `Telegram refused it (${body.description || res.status})` };
  } catch (e) {
    const reason = (e as Error).name === "TimeoutError" ? "no answer in 4s" : (e as Error).message;
    return { ok: false, detail: `Telegram unreachable (${reason})` };
  }
}

async function sendEmail(to: string, message: Message): Promise<Delivery> {
  if (!smtpConfigured()) return { ok: false, detail: "email skipped (SMTP not configured)" };

  try {
    await mailer(CHANNEL_TIMEOUT_MS).sendMail({
      from: smtpFrom(),
      to,
      subject: message.subject,
      text: message.text,
      html: message.text
        .split("\n")
        .map((line) => (line ? `<p style="margin:0 0 6px">${escapeHtml(line)}</p>` : "<p>&nbsp;</p>"))
        .join(""),
    });
    return { ok: true, detail: `email delivered to ${to}` };
  } catch (e) {
    return { ok: false, detail: `email failed (${(e as Error).message})` };
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Both channels at once: two seconds of SMTP must not delay the Telegram ping. */
async function deliver(
  row: Row,
  settings: NotificationSettings,
  shop: Shop,
  message: Message
): Promise<{ ok: boolean; detail: string }> {
  const jobs: Promise<Delivery>[] = [];

  if (row.accessToken && row.pageId) {
    jobs.push(sendTelegram(row.accessToken, row.pageId, message.text));
  }
  const address = settings.email || shop.ownerEmail;
  if (address) jobs.push(sendEmail(address, message));

  if (!jobs.length) {
    return { ok: false, detail: "no channel is configured (add a Telegram bot or an email address)" };
  }

  const results = await Promise.all(jobs);
  return {
    ok: results.some((r) => r.ok),
    detail: results.map((r) => r.detail).join("; "),
  };
}

/* ==========================================================================
   The queue: a watermark, not a table
   ========================================================================== */

/**
 * `lastSyncAt` holds the creation time of the newest lead already accounted for. Anything
 * newer is waiting. That makes the queue a property of the lead list itself — it survives
 * a restart, it cannot drift out of step with the data, and it needed no migration.
 */

/** One flush per workspace at a time; two intakes a millisecond apart must not both send. */
const inFlight = new Map<string, Promise<void>>();

function serialize(tenantId: string, work: () => Promise<void>): Promise<void> {
  const previous = inFlight.get(tenantId) ?? Promise.resolve();
  const next = previous.then(work, work);
  inFlight.set(tenantId, next);
  next.catch(() => {}).then(() => {
    if (inFlight.get(tenantId) === next) inFlight.delete(tenantId);
  });
  return next;
}

/**
 * A held batch needs something to wake it up. In a single long-running container a timer
 * is that something: quiet hours end, or the throttle window closes, and the pending
 * leads go out. If the process restarts while a timer is pending nothing is lost — the
 * watermark never moved, so the next lead (or the next save on the settings screen)
 * carries the whole batch. It is late in that case, and that is the honest trade for a
 * queue with no scheduler.
 */
const timers = new Map<string, NodeJS.Timeout>();

function armTimer(tenantId: string, delayMs: number) {
  if (timers.has(tenantId)) return;
  const delay = Math.min(Math.max(delayMs, 1_000), MAX_TIMER_MS);
  const timer = setTimeout(() => {
    timers.delete(tenantId);
    void flushPending(tenantId);
  }, delay);
  // A pending alert must never be the reason a process refuses to exit.
  timer.unref?.();
  timers.set(tenantId, timer);
}

async function pendingLeads(tenantId: string, since: Date): Promise<LeadLine[]> {
  return prisma.lead.findMany({
    // A lead typed in by hand is excluded here as well as at the call site: the digest
    // must not tell the owner about the row he entered himself an hour ago.
    where: { tenantId, createdAt: { gt: since }, source: { not: "MANUAL" } },
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      city: true,
      jobType: true,
      source: true,
      notes: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
    take: PENDING_LIMIT,
  });
}

async function stamp(row: Row, config: StoredConfig, patch: Partial<StoredConfig>) {
  await prisma.channelIntegration.update({
    where: { id: row.id },
    data: { config: JSON.stringify({ ...config, ...patch }) },
  });
}

/**
 * Sends everything waiting, or explains why it is not sending it. Never throws: the
 * caller has a lead in hand and a visitor on a thank-you page.
 */
export async function flushPending(tenantId: string, opts: { force?: boolean } = {}): Promise<void> {
  return serialize(tenantId, async () => {
    try {
      const row = await loadRow(tenantId);
      if (!row?.isActive) return;

      const settings = settingsOf(row);
      const config = parseConfig(row.config);
      const now = new Date();

      if (!opts.force && isQuiet(now, settings)) {
        armTimer(tenantId, msUntilQuietEnds(now, settings));
        return;
      }

      const lastSentAt = config.lastSentAt ? new Date(config.lastSentAt).getTime() : 0;
      const sinceLastSend = now.getTime() - lastSentAt;
      if (!opts.force && lastSentAt && sinceLastSend < THROTTLE_MS) {
        // Inside the coalescing window: the batch waits and leaves as one message.
        armTimer(tenantId, THROTTLE_MS - sinceLastSend);
        return;
      }

      const since = row.lastSyncAt ?? new Date(now.getTime() - FIRST_RUN_LOOKBACK_MS);
      const leads = await pendingLeads(tenantId, since);
      if (!leads.length) return;

      const shop = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { businessName: true, slug: true, ownerEmail: true },
      });
      if (!shop) return;

      // The watermark moves before the send, not after. A message that fails is written
      // into the journal and the owner can read the leads on the sheet; a message that
      // repeats every earlier lead on each retry is how a working channel gets muted.
      const watermark = leads[leads.length - 1].createdAt;
      await prisma.channelIntegration.update({
        where: { id: row.id },
        data: { lastSyncAt: watermark },
      });

      const heldForQuietHours = isQuiet(leads[0].createdAt, settings);
      const message = composeMessage(shop, leads, settings, { heldForQuietHours, now });
      const result = await deliver(row, settings, shop, message);

      await stamp(row, config, {
        lastSentAt: now.toISOString(),
        lastResult: result.detail,
        lastDelivered: result.ok,
      });

      const subject =
        leads.length === 1
          ? `New lead ${leads[0].name}${leads[0].phone ? ` (${leads[0].phone})` : ""}`
          : `${leads.length} new leads`;
      await record({
        tenantId,
        actor: { id: "system", name: "System" },
        action: "lead.notify",
        entity: "Lead",
        entityId: leads[leads.length - 1].id,
        summary: result.ok
          ? `${subject} — owner alerted: ${result.detail}`
          : `${subject} — alert NOT delivered: ${result.detail}`,
        meta: { leads: leads.length, delivered: result.ok },
      });
    } catch (e) {
      // Same contract as the journal: an alert is a courtesy, never a gate.
      console.error(`[notify] flush for tenant ${tenantId} failed:`, e);
    }
  });
}

/**
 * Called wherever a lead is born. Awaited by the caller so the journal line exists before
 * the response goes out, and bounded by the per-channel timeouts above.
 */
export async function notifyNewLead(tenantId: string, leadId: string): Promise<void> {
  try {
    const row = await loadRow(tenantId);
    // Nothing configured, or alerts switched off: the owner never asked to be told, and
    // a journal line per lead saying so would be noise in the book he reads for disputes.
    if (!row?.isActive) return;

    const settings = settingsOf(row);
    const now = new Date();

    if (isQuiet(now, settings)) {
      armTimer(tenantId, msUntilQuietEnds(now, settings));

      /**
       * ONE line per quiet window, not one per lead. The journal is what the owner reads
       * to settle an argument with a client; a night of paid traffic wrote sixty
       * identical «held» lines into it and buried everything that mattered. The first
       * lead of the window says the queue is holding and until when — the batch itself
       * is written down in full when it goes out at the far end.
       *
       * The marker is the END of this window rather than the moment it was written, so
       * tonight's line cannot silence tomorrow night's.
       */
      const config = parseConfig(row.config);
      const noted = config.heldNotedUntil ? new Date(config.heldNotedUntil).getTime() : 0;
      if (noted > now.getTime()) return;

      const endsAt = new Date(now.getTime() + msUntilQuietEnds(now, settings));
      await stamp(row, config, { heldNotedUntil: endsAt.toISOString() });

      const lead = await prisma.lead.findFirst({
        where: { id: leadId, tenantId },
        select: { name: true },
      });
      await record({
        tenantId,
        actor: { id: "system", name: "System" },
        action: "lead.notify",
        entity: "Lead",
        entityId: leadId,
        summary: `New lead ${lead?.name ?? ""} held for quiet hours — goes out at ${settings.quietTo}`.replace(
          /\s+/g,
          " "
        ),
        meta: { held: true, until: settings.quietTo },
      });
      return;
    }

    await flushPending(tenantId);
  } catch (e) {
    console.error(`[notify] lead ${leadId} alert failed:`, e);
  }
}

/**
 * «Does this actually reach me?» — asked from the settings screen while the owner has his
 * phone in his hand. It ignores quiet hours and the throttle on purpose: he is standing
 * there waiting for it.
 */
export async function sendTestNotification(
  tenantId: string
): Promise<{ ok: boolean; detail: string }> {
  const row = await loadRow(tenantId);
  if (!row) return { ok: false, detail: "nothing is configured yet" };

  const settings = settingsOf(row);
  const shop = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { businessName: true, slug: true, ownerEmail: true },
  });
  if (!shop) return { ok: false, detail: "workspace not found" };

  const message: Message = {
    subject: `Test alert · ${shop.businessName}`,
    text: [
      `TEST ALERT · ${shop.businessName}`,
      "",
      "If you can read this, a new lead will reach you here within seconds of landing.",
      `Sent ${clockAt(new Date(), settings.timezone)} from your CRM.`,
    ].join("\n"),
  };

  return deliver(row, settings, shop, message);
}
