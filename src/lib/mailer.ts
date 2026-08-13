import nodemailer from "nodemailer";

/**
 * The one SMTP transport in the product.
 *
 * Three files built their own: the estimate mailer made one at import time with no
 * timeout and `secure: false` hard-coded, the reminder mailer made a second, the lead
 * alerts a third with timeouts. Same credentials, three behaviours — and the estimate
 * one would happily try to send with an unconfigured host and hang the request. One
 * builder, one set of rules.
 *
 * Nothing is constructed at import time: with SMTP unset there is no transport to make,
 * and `smtpConfigured()` is what every caller asks first.
 */

export function smtpConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

/** Who the client sees the mail from. */
export function smtpFrom(businessName?: string): string {
  return process.env.SMTP_FROM || `${businessName ?? "HandymanPro"} <noreply@example.com>`;
}

/**
 * A transport with a deadline. Every send here happens while somebody is waiting — a
 * visitor on a thank-you page, an owner watching a button — so an SMTP host that accepts
 * the connection and then says nothing must not hold the request open.
 */
export function mailer(timeoutMs = 10_000) {
  const port = Number(process.env.SMTP_PORT) || 587;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    // 465 is implicit TLS; 587 upgrades with STARTTLS.
    secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    connectionTimeout: timeoutMs,
    greetingTimeout: timeoutMs,
    socketTimeout: timeoutMs,
  });
}
