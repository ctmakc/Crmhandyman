/**
 * Proves the mail → webhook path without Cloudflare in the loop.
 *
 * Builds a realistic raw MIME message (multipart/alternative, quoted-printable,
 * RFC 2047 subject), runs it through the worker's own parseMail/mailgunSignature
 * — the very functions that run in production — and POSTs the resulting signed
 * form to a locally running CRM.
 *
 * Usage:
 *   SIGNING_KEY=<key> node test-local.mjs [url] [recipient]
 *   node test-local.mjs http://localhost:3001/api/webhooks/email leads-demo@agintent.com <key>
 *
 * The CRM must run with MAILGUN_WEBHOOK_SIGNING_KEY=<same key>, and a tenant
 * must have the email channel configured with the recipient address — otherwise
 * the CRM answers { routed: false }, which this script reports as such.
 */
import { parseMail, mailgunSignature } from "./worker.js";

const url = process.argv[2] || process.env.CRM_WEBHOOK_URL || "http://localhost:3001/api/webhooks/email";
const recipient = process.argv[3] || process.env.RECIPIENT || "leads-demo@agintent.com";
const key = process.argv[4] || process.env.SIGNING_KEY;

if (!key) {
  console.error("SIGNING_KEY missing. Usage: SIGNING_KEY=<key> node test-local.mjs [url] [recipient]");
  process.exit(1);
}

// Quoted-printable body with an accent and a soft break, so a decoder that only
// handles 7bit ASCII fails here instead of on the first real enquiry.
const rawEmail = [
  `From: =?utf-8?Q?Ren=C3=A9_Tremblay?= <rene.tremblay@example.com>`,
  `To: ${recipient}`,
  `Subject: =?utf-8?Q?Furnace_repair_=E2=80=94_no_heat?=`,
  `MIME-Version: 1.0`,
  `Content-Type: multipart/alternative; boundary="deadbeefcafe"`,
  ``,
  `preamble to be ignored`,
  `--deadbeefcafe`,
  `Content-Type: text/plain; charset=utf-8`,
  `Content-Transfer-Encoding: quoted-printable`,
  ``,
  `Hi, my furnace stopped working last night and the house is at 12=C2=B0C. Ca=`,
  `n someone come today? Call me at (416) 555-0182.`,
  ``,
  `Ren=C3=A9`,
  `--deadbeefcafe`,
  `Content-Type: text/html; charset=utf-8`,
  ``,
  `<html><body><p>Hi, my furnace stopped working.</p></body></html>`,
  `--deadbeefcafe--`,
  ``,
].join("\r\n");

const mail = parseMail(new TextEncoder().encode(rawEmail));
console.log("parsed From:   ", mail.fromHeader);
console.log("parsed subject:", mail.subject);
console.log("parsed body:   ", JSON.stringify(mail.body.slice(0, 120)) + "…");

const timestamp = Math.floor(Date.now() / 1000).toString();
const token = [...crypto.getRandomValues(new Uint8Array(16))]
  .map((b) => b.toString(16).padStart(2, "0"))
  .join("");
const signature = await mailgunSignature(key, timestamp, token);

const form = new URLSearchParams({
  timestamp,
  token,
  signature,
  recipient,
  sender: "rene.tremblay@example.com",
  From: mail.fromHeader,
  subject: mail.subject,
  "body-plain": mail.body,
});

console.log(`POST ${url} (recipient=${recipient})`);
const res = await fetch(url, {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: form.toString(),
});

const body = await res.text();
console.log(`→ ${res.status} ${body}`);

if (!res.ok) {
  console.error("Webhook refused the POST — check that MAILGUN_WEBHOOK_SIGNING_KEY matches SIGNING_KEY.");
  process.exit(1);
}
if (body.includes('"routed":false')) {
  console.error(
    `Signature accepted, but no tenant has ${recipient} configured — add it in Settings → Integrations → Email.`,
  );
  process.exit(2);
}
console.log("Lead accepted. Check the CRM leads list.");
