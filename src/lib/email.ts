import "server-only";

import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import nodemailer from "nodemailer";
import { prisma } from "@/lib/prisma";

export type OutboundEmail = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
  idempotencyKey?: string;
};

type EmailOutboxRow = {
  id: string;
  idempotencyKey: string;
  toEmail: string;
  replyTo: string | null;
  subject: string;
  textBody: string;
  htmlBody: string | null;
  status: string;
  attempts: number | bigint;
  maxAttempts: number | bigint;
  nextAttemptAt: Date | string;
  lockedAt: Date | string | null;
  providerMessageId: string | null;
};

export type EmailDeliveryResult = {
  sent: boolean;
  queued: boolean;
  outboxId: string;
  replayed: boolean;
  reason?: string;
};

export function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function smtpConfig() {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM;
  const port = Number(process.env.SMTP_PORT || 587);

  if (!host || !user || !pass || !from || !Number.isFinite(port)) return null;
  return { host, user, pass, from, port };
}

function createTransport() {
  const config = smtpConfig();
  if (!config) return null;

  return {
    config,
    transporter: nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.port === 465,
      auth: {
        user: config.user,
        pass: config.pass,
      },
    }),
  };
}

function clean(value: string | undefined, maxLength: number) {
  return (value ?? "").trim().slice(0, maxLength);
}

function validateOutboundEmail(message: OutboundEmail) {
  const to = clean(message.to, 320).toLowerCase();
  const replyTo = clean(message.replyTo, 320).toLowerCase() || null;
  const subject = clean(message.subject, 300);
  const text = (message.text ?? "").slice(0, 100_000);
  const html = message.html ? message.html.slice(0, 200_000) : null;
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!validEmail.test(to)) throw new Error("A valid outbound email recipient is required.");
  if (replyTo && !validEmail.test(replyTo)) throw new Error("A valid reply-to email is required.");
  if (!subject) throw new Error("Outbound email subject is required.");
  if (!text) throw new Error("Outbound email text body is required.");

  return { to, replyTo, subject, text, html };
}

function retryDelayMs(attempts: number) {
  return Math.min(60_000 * 2 ** Math.max(attempts - 1, 0), 6 * 60 * 60 * 1000);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 2000) : "Unknown email delivery error";
}

async function getOutboxByKey(idempotencyKey: string) {
  const rows = await prisma.$queryRaw<EmailOutboxRow[]>(Prisma.sql`
    SELECT
      "id", "idempotencyKey", "toEmail", "replyTo", "subject", "textBody", "htmlBody",
      "status", "attempts", "maxAttempts", "nextAttemptAt", "lockedAt", "providerMessageId"
    FROM EmailOutbox
    WHERE "idempotencyKey" = ${idempotencyKey}
    LIMIT 1
  `);
  return rows[0] ?? null;
}

async function enqueueOutboundEmail(message: OutboundEmail) {
  const normalized = validateOutboundEmail(message);
  const requestedKey = clean(message.idempotencyKey, 240);
  const idempotencyKey = requestedKey || `email:${randomUUID()}`;
  const id = randomUUID();
  const now = new Date();

  const inserted = await prisma.$executeRaw(Prisma.sql`
    INSERT OR IGNORE INTO EmailOutbox (
      "id", "idempotencyKey", "toEmail", "replyTo", "subject", "textBody", "htmlBody",
      "status", "attempts", "maxAttempts", "nextAttemptAt", "createdAt", "updatedAt"
    ) VALUES (
      ${id}, ${idempotencyKey}, ${normalized.to}, ${normalized.replyTo}, ${normalized.subject},
      ${normalized.text}, ${normalized.html}, 'PENDING', 0, 8, ${now}, ${now}, ${now}
    )
  `);

  const row = await getOutboxByKey(idempotencyKey);
  if (!row) throw new Error("Unable to persist outbound email.");
  return { row, replayed: inserted === 0 };
}

async function releaseWithoutSmtp(row: EmailOutboxRow) {
  const nextAttemptAt = new Date(Date.now() + 15 * 60 * 1000);
  await prisma.$executeRaw(Prisma.sql`
    UPDATE EmailOutbox
    SET "status" = 'PENDING', "lockedAt" = NULL, "lastError" = 'SMTP_NOT_CONFIGURED',
        "nextAttemptAt" = ${nextAttemptAt}, "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = ${row.id} AND "status" != 'SENT'
  `);
}

async function attemptOutboxDelivery(row: EmailOutboxRow): Promise<EmailDeliveryResult> {
  if (row.status === "SENT") {
    return {
      sent: true,
      queued: false,
      outboxId: row.id,
      replayed: true,
    };
  }

  const staleLockBefore = new Date(Date.now() - 10 * 60 * 1000);
  const claimed = await prisma.$executeRaw(Prisma.sql`
    UPDATE EmailOutbox
    SET "status" = 'SENDING', "lockedAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = ${row.id}
      AND "status" = 'PENDING'
      AND ("lockedAt" IS NULL OR "lockedAt" < ${staleLockBefore})
  `);

  if (claimed !== 1) {
    const current = await getOutboxByKey(row.idempotencyKey);
    return {
      sent: current?.status === "SENT",
      queued: current?.status !== "SENT",
      outboxId: row.id,
      replayed: true,
      reason: current?.status === "SENT" ? undefined : "DELIVERY_ALREADY_CLAIMED",
    };
  }

  const mail = createTransport();
  if (!mail) {
    await releaseWithoutSmtp(row);
    return {
      sent: false,
      queued: true,
      outboxId: row.id,
      replayed: false,
      reason: "SMTP_NOT_CONFIGURED",
    };
  }

  const attempts = Number(row.attempts) + 1;
  const maxAttempts = Number(row.maxAttempts);

  try {
    const delivery = await mail.transporter.sendMail({
      from: mail.config.from,
      to: row.toEmail,
      subject: row.subject,
      text: row.textBody,
      html: row.htmlBody ?? undefined,
      replyTo: row.replyTo ?? undefined,
    });

    await prisma.$executeRaw(Prisma.sql`
      UPDATE EmailOutbox
      SET "status" = 'SENT', "attempts" = ${attempts}, "lockedAt" = NULL,
          "lastError" = NULL, "providerMessageId" = ${String(delivery.messageId ?? "").slice(0, 500)},
          "sentAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${row.id}
    `);

    return {
      sent: true,
      queued: false,
      outboxId: row.id,
      replayed: false,
    };
  } catch (error) {
    const exhausted = attempts >= maxAttempts;
    const nextAttemptAt = new Date(Date.now() + retryDelayMs(attempts));
    await prisma.$executeRaw(Prisma.sql`
      UPDATE EmailOutbox
      SET "status" = ${exhausted ? "FAILED" : "PENDING"}, "attempts" = ${attempts},
          "lockedAt" = NULL, "lastError" = ${errorMessage(error)},
          "nextAttemptAt" = ${nextAttemptAt}, "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${row.id}
    `);

    return {
      sent: false,
      queued: !exhausted,
      outboxId: row.id,
      replayed: false,
      reason: exhausted ? "DELIVERY_EXHAUSTED" : "QUEUED_FOR_RETRY",
    };
  }
}

export async function sendOutboundEmail(message: OutboundEmail): Promise<EmailDeliveryResult> {
  const { row, replayed } = await enqueueOutboundEmail(message);
  const result = await attemptOutboxDelivery(row);
  return { ...result, replayed: replayed || result.replayed };
}

export async function processDueOutboundEmails(limit = 25) {
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 100);
  const staleLockBefore = new Date(Date.now() - 10 * 60 * 1000);
  await prisma.$executeRaw(Prisma.sql`
    UPDATE EmailOutbox
    SET "status" = 'PENDING', "lockedAt" = NULL, "updatedAt" = CURRENT_TIMESTAMP
    WHERE "status" = 'SENDING' AND "lockedAt" < ${staleLockBefore}
  `);

  const due = await prisma.$queryRaw<EmailOutboxRow[]>(Prisma.sql`
    SELECT
      "id", "idempotencyKey", "toEmail", "replyTo", "subject", "textBody", "htmlBody",
      "status", "attempts", "maxAttempts", "nextAttemptAt", "lockedAt", "providerMessageId"
    FROM EmailOutbox
    WHERE "status" = 'PENDING' AND "nextAttemptAt" <= CURRENT_TIMESTAMP
    ORDER BY "nextAttemptAt" ASC, "createdAt" ASC
    LIMIT ${safeLimit}
  `);

  const results = [];
  for (const row of due) {
    results.push(await attemptOutboxDelivery(row));
  }

  return {
    selected: due.length,
    sent: results.filter((result) => result.sent).length,
    queued: results.filter((result) => result.queued).length,
    failed: results.filter((result) => !result.sent && !result.queued).length,
  };
}

export async function sendEstimateEmail(
  to: string,
  clientName: string,
  estimateId: string,
  pdfBuffer: Buffer
) {
  const mail = createTransport();
  if (!mail) throw new Error("SMTP is not configured.");

  await mail.transporter.sendMail({
    from: mail.config.from,
    to,
    subject: "Your Estimate from HandymanPro",
    text: `Hi ${clientName},\n\nPlease find your estimate attached. To accept or decline, please reply to this email.\n\nThank you for your business!`,
    html: `
      <p>Hi ${escapeHtml(clientName)},</p>
      <p>Please find your estimate attached. To accept or decline, please reply to this email.</p>
      <p>Thank you for your business!</p>
    `,
    attachments: [
      {
        filename: `estimate-${estimateId}.pdf`,
        content: pdfBuffer,
        contentType: "application/pdf",
      },
    ],
  });
}
