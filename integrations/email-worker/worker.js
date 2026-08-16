/**
 * Cloudflare Email Worker: inbound mail → CRM lead webhook, without Mailgun.
 *
 * Email Routing hands us the raw RFC 822 message. We pull out the sender, the
 * routed recipient, the subject and a plain-text body, then POST them to the
 * CRM's /api/webhooks/email in the exact shape Mailgun's inbound parse would
 * have used — including a freshly minted Mailgun-style signature (HMAC-SHA256
 * hex over timestamp+token). The CRM route verifies that signature against the
 * same shared secret, so swapping providers costs zero changes on the CRM side.
 *
 * Env this worker needs:
 *   SIGNING_KEY      — secret; must equal MAILGUN_WEBHOOK_SIGNING_KEY on the CRM
 *   CRM_WEBHOOK_URL  — var; e.g. https://handymanpro.ca/api/webhooks/email
 *
 * Failure policy: a message we cannot parse is rejected (permanent bounce, the
 * sender learns immediately) — posting half-decoded bytes would create a lead
 * whose notes are garbage and whose phone extraction matched noise. A CRM that
 * is down or misconfigured env throws instead, which tempfails the delivery so
 * the sending server retries once we are healthy again.
 */

/* ------------------------------------------------------------------ MIME --- */

// Bytes ↔ string with byte fidelity. latin1 maps every byte to the same code
// point, so structural parsing (boundaries, headers) can happen on a string
// while the payload bytes survive untouched for the real charset decode later.
const LATIN1 = new TextDecoder("latin1");

function bytesToLatin1(bytes) {
  return LATIN1.decode(bytes);
}

function latin1ToBytes(str) {
  const out = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) out[i] = str.charCodeAt(i) & 0xff;
  return out;
}

// The charset label comes from the wire, so it is hostile input; an unknown
// label falls back to utf-8 rather than killing the whole message.
function decodeCharset(bytes, charset) {
  try {
    return new TextDecoder(charset || "utf-8").decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

/** First blank line separates headers from body; both CRLF and bare LF mail exists. */
function splitHeadersFromBody(raw) {
  const m = raw.match(/\r?\n\r?\n/);
  if (!m) return { headerBlock: raw, body: "" };
  return {
    headerBlock: raw.slice(0, m.index),
    body: raw.slice(m.index + m[0].length),
  };
}

/** Unfolds continuation lines and lowercases names; last occurrence wins. */
function parseHeaders(headerBlock) {
  const headers = {};
  const unfolded = headerBlock.replace(/\r?\n[ \t]+/g, " ");
  for (const line of unfolded.split(/\r?\n/)) {
    const colon = line.indexOf(":");
    if (colon < 1) continue;
    headers[line.slice(0, colon).trim().toLowerCase()] = line.slice(colon + 1).trim();
  }
  return headers;
}

function headerParam(headerValue, param) {
  // boundary="ab c" | boundary=abc — the quoted form may hold spaces and semicolons.
  const re = new RegExp(param + '\\s*=\\s*(?:"([^"]+)"|([^;\\s]+))', "i");
  const m = (headerValue || "").match(re);
  return m ? m[1] || m[2] : null;
}

/** Undoes Content-Transfer-Encoding, staying in latin1-string space. */
function decodeTransfer(body, encoding) {
  const enc = (encoding || "").toLowerCase().trim();
  if (enc === "base64") {
    // Stray whitespace/newlines are normal in wrapped base64; anything else
    // non-alphabet means a corrupt part, and atob throwing surfaces that.
    return atob(body.replace(/[^A-Za-z0-9+/=]/g, ""));
  }
  if (enc === "quoted-printable") {
    return body
      .replace(/=\r?\n/g, "") // soft line breaks
      .replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  }
  return body; // 7bit / 8bit / binary / absent
}

/**
 * HTML is the fallback, never the preference: marketplaces (HomeStars, Kijiji)
 * all ship a text/plain alternative, but a bare-HTML enquiry still deserves to
 * become a lead instead of a bounce.
 */
function stripHtml(html) {
  return html
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Walks the MIME tree looking for text. Returns { plain, html } where either
 * may be null — the caller prefers plain. Depth-capped because a boundary that
 * quotes itself can otherwise recurse forever on crafted mail.
 */
function findTextParts(raw, headers, depth) {
  const contentType = headers["content-type"] || "text/plain";
  const mediaType = contentType.split(";")[0].trim().toLowerCase();

  if (mediaType.startsWith("multipart/") && depth < 5) {
    const boundary = headerParam(contentType, "boundary");
    if (!boundary) return { plain: null, html: null };
    const found = { plain: null, html: null };
    const segments = raw.split("--" + boundary);
    // segments[0] is the preamble; a segment starting with "--" is the terminator.
    for (let i = 1; i < segments.length; i++) {
      if (segments[i].startsWith("--")) break;
      const part = splitHeadersFromBody(segments[i].replace(/^\r?\n/, ""));
      const partHeaders = parseHeaders(part.headerBlock);
      // Attachments are never the enquiry text, whatever their declared type.
      if (/attachment/i.test(partHeaders["content-disposition"] || "")) continue;
      const inner = findTextParts(part.body, partHeaders, depth + 1);
      found.plain = found.plain ?? inner.plain;
      found.html = found.html ?? inner.html;
      if (found.plain) break; // multipart/alternative lists plain first; done
    }
    return found;
  }

  if (mediaType === "text/plain" || mediaType === "text/html") {
    const decoded = decodeTransfer(raw, headers["content-transfer-encoding"]);
    const text = decodeCharset(latin1ToBytes(decoded), headerParam(contentType, "charset"));
    return mediaType === "text/plain"
      ? { plain: text, html: null }
      : { plain: null, html: text };
  }

  return { plain: null, html: null };
}

/** RFC 2047 encoded-words in Subject/From: =?utf-8?B?...?= and the Q form. */
function decodeEncodedWords(value) {
  return (value || "")
    // Adjacent encoded words are joined without the separating whitespace.
    .replace(/(=\?[^?]+\?[BbQq]\?[^?]*\?=)\s+(?==\?)/g, "$1")
    .replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (whole, charset, kind, data) => {
      try {
        const raw = kind.toUpperCase() === "B"
          ? atob(data.replace(/[^A-Za-z0-9+/=]/g, ""))
          : data
              .replace(/_/g, " ")
              .replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
        return decodeCharset(latin1ToBytes(raw), charset);
      } catch {
        return whole; // a broken word stays visible instead of vanishing
      }
    });
}

/**
 * Raw message bytes → { fromHeader, subject, body }. Throws when no text part
 * can be extracted — that throw is the worker's "this is not parseable mail".
 * Exported so test-local.mjs exercises the identical parser off-platform.
 */
export function parseMail(rawBytes) {
  const raw = bytesToLatin1(rawBytes);
  const { headerBlock, body } = splitHeadersFromBody(raw);
  const headers = parseHeaders(headerBlock);

  const { plain, html } = findTextParts(body, headers, 0);
  const text = plain ?? (html !== null ? stripHtml(html) : null);
  if (text === null) throw new Error("no text/plain or text/html part found");

  return {
    fromHeader: decodeEncodedWords(headers["from"] || ""),
    subject: decodeEncodedWords(headers["subject"] || ""),
    body: text,
  };
}

/* ------------------------------------------------------------- signature --- */

function toHex(bytes) {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** The exact digest the CRM recomputes: HMAC-SHA256(key, timestamp + token), hex. */
export async function mailgunSignature(key, timestamp, token) {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(timestamp + token));
  return toHex(digest);
}

/* ---------------------------------------------------------------- worker --- */

// The CRM keeps only the first 500 chars in the lead's notes and scans the body
// for a phone number; shipping a megabyte of newsletter past that is pure cost.
const MAX_BODY_CHARS = 64 * 1024;

export default {
  async email(message, env) {
    // Missing config is our fault, not the sender's — tempfail so the mail
    // comes back after the secret is set, instead of bouncing real enquiries.
    if (!env.SIGNING_KEY || !env.CRM_WEBHOOK_URL) {
      throw new Error("email-worker: SIGNING_KEY / CRM_WEBHOOK_URL not configured");
    }

    const rawBytes = new Uint8Array(await new Response(message.raw).arrayBuffer());

    let mail;
    try {
      mail = parseMail(rawBytes);
    } catch (err) {
      console.error(
        `email-worker: unparseable message from=${message.from} to=${message.to}: ${err.message}`,
      );
      message.setReject("Message could not be parsed");
      return;
    }

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const token = toHex(crypto.getRandomValues(new Uint8Array(16)));
    const signature = await mailgunSignature(env.SIGNING_KEY, timestamp, token);

    const form = new URLSearchParams({
      timestamp,
      token,
      signature,
      // The envelope recipient is the address Email Routing actually matched —
      // the CRM routes to a tenant by it, so it must win over any To: header.
      recipient: message.to,
      sender: message.from,
      // Full From: header keeps the display name; the CRM extracts the lead's
      // name from "Name <email>" and falls back to sender when it is absent.
      From: mail.fromHeader || message.from,
      subject: mail.subject,
      "body-plain": mail.body.slice(0, MAX_BODY_CHARS),
    });

    const res = await fetch(env.CRM_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });

    if (!res.ok) {
      // Tempfail: the sending server retries, and the lead survives CRM downtime.
      const detail = await res.text().catch(() => "");
      console.error(`email-worker: CRM answered ${res.status} for ${message.to}: ${detail.slice(0, 300)}`);
      throw new Error(`CRM webhook returned ${res.status}`);
    }
  },
};
