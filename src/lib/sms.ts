import crypto from "node:crypto";

/**
 * Provider-neutral SMS edge. The rest of the CRM knows about a message, a phone number
 * and a provider id; Twilio-specific credentials and request shapes stop here so Telnyx
 * can be added later without rewriting lead routes or the sales desk.
 */

export type SmsIntegrationLike = {
  accessToken?: string | null;
  pageId?: string | null;
  config?: string | null;
  isActive?: boolean;
  normalizedAddress?: string | null;
};

export type TwilioSmsConfig = {
  provider: "TWILIO";
  accountSid: string;
  authToken: string;
  fromNumber: string;
};

export type SmsSendResult = {
  provider: "TWILIO";
  id: string;
  status: string;
};

export class SmsProviderError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string | number,
  ) {
    super(message);
    this.name = "SmsProviderError";
  }
}

/**
 * Canadian/US leads very often arrive as ten naked digits while Twilio requires E.164.
 * We intentionally do not try to guess a country for any other length: a bad guess can
 * text the wrong human, which is worse than refusing the send.
 */
export function normalizeSmsPhone(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  let value = raw.trim();
  if (!value) return null;

  value = value.replace(/^00/, "+");
  const digits = value.replace(/[^\d+]/g, "");

  if (/^\+\d{8,15}$/.test(digits)) return digits;

  const bare = value.replace(/\D/g, "");
  if (/^\d{10}$/.test(bare)) return `+1${bare}`;
  if (/^1\d{10}$/.test(bare)) return `+${bare}`;
  return null;
}

function readConfig(raw: unknown): unknown {
  if (typeof raw !== "string") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/** The phone number is routing data, not a credential, and may be stored as old bare text. */
export function smsFromNumber(config: unknown): string | null {
  const value = readConfig(config);
  if (typeof value === "string") return normalizeSmsPhone(value);
  if (!value || typeof value !== "object") return null;

  const obj = value as { fromNumber?: unknown; phone?: unknown; address?: unknown };
  const candidate =
    typeof obj.fromNumber === "string"
      ? obj.fromNumber
      : typeof obj.phone === "string"
        ? obj.phone
        : typeof obj.address === "string"
          ? obj.address
          : null;
  return normalizeSmsPhone(candidate);
}

export function twilioConfig(row: SmsIntegrationLike | null | undefined): TwilioSmsConfig | null {
  if (!row?.isActive) return null;
  const accountSid = row.pageId?.trim() || "";
  const authToken = row.accessToken?.trim() || "";
  const fromNumber = row.normalizedAddress || smsFromNumber(row.config);
  if (!accountSid || !authToken || !fromNumber) return null;
  return { provider: "TWILIO", accountSid, authToken, fromNumber };
}

function trimBase(base: string) {
  return base.replace(/\/+$/, "");
}

/**
 * Calls Twilio's Messages resource directly. No SDK is needed for one HTTP operation,
 * which keeps the provider swappable and avoids placing another credential-reading
 * dependency in the app bundle.
 */
export async function sendSms(
  config: TwilioSmsConfig,
  toRaw: string,
  messageRaw: string,
  options: { fetcher?: typeof fetch; baseUrl?: string } = {},
): Promise<SmsSendResult> {
  const to = normalizeSmsPhone(toRaw);
  const message = messageRaw.trim();
  if (!to) throw new SmsProviderError("The customer phone number is not valid for SMS", 400);
  if (!message) throw new SmsProviderError("The SMS is empty", 400);
  if (message.length > 1600) throw new SmsProviderError("The SMS is longer than 1600 characters", 400);

  const fetcher = options.fetcher ?? fetch;
  const baseUrl = trimBase(options.baseUrl || "https://api.twilio.com");
  const endpoint = `${baseUrl}/2010-04-01/Accounts/${encodeURIComponent(config.accountSid)}/Messages.json`;
  const form = new URLSearchParams({ To: to, From: config.fromNumber, Body: message });
  const auth = Buffer.from(`${config.accountSid}:${config.authToken}`).toString("base64");

  let response: Response;
  try {
    response = await fetcher(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      },
      body: form.toString(),
    });
  } catch {
    throw new SmsProviderError("The SMS provider could not be reached", 502);
  }

  const payload = (await response.json().catch(() => null)) as
    | { sid?: string; status?: string; code?: string | number; message?: string }
    | null;

  if (!response.ok || !payload?.sid) {
    throw new SmsProviderError(
      payload?.message || `The SMS provider refused the message (${response.status})`,
      response.status || 502,
      payload?.code,
    );
  }

  return {
    provider: "TWILIO",
    id: payload.sid,
    status: payload.status || "queued",
  };
}

/** Twilio signs the exact public URL plus alphabetically sorted form parameters. */
export function twilioSignature(url: string, params: URLSearchParams, authToken: string): string {
  let data = url;
  const keys = Array.from(new Set(Array.from(params.keys()))).sort();
  for (const key of keys) {
    for (const value of params.getAll(key)) data += `${key}${value}`;
  }
  return crypto.createHmac("sha1", authToken).update(data).digest("base64");
}

export function verifyTwilioSignature(
  url: string,
  params: URLSearchParams,
  given: string | null,
  authToken: string | null | undefined,
): boolean {
  if (!given || !authToken) return false;
  const expected = twilioSignature(url, params, authToken);
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export type SmsConsentCommand = "STOP" | "START" | null;

/** Provider opt-out handling is backed up in our own lead history, not merely trusted. */
export function smsConsentCommand(body: unknown): SmsConsentCommand {
  if (typeof body !== "string") return null;
  const word = body.trim().toUpperCase();
  if (["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"].includes(word)) return "STOP";
  if (["START", "UNSTOP", "YES"].includes(word)) return "START";
  return null;
}
