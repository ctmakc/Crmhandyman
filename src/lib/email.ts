import "server-only";

import nodemailer from "nodemailer";

export type OutboundEmail = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
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

export async function sendOutboundEmail(message: OutboundEmail) {
  const mail = createTransport();
  if (!mail) return { sent: false as const, reason: "SMTP_NOT_CONFIGURED" as const };

  await mail.transporter.sendMail({
    from: mail.config.from,
    to: message.to,
    subject: message.subject,
    text: message.text,
    html: message.html,
    replyTo: message.replyTo,
  });

  return { sent: true as const };
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
