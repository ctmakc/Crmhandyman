import nodemailer from "nodemailer";
import { formatCurrency } from "@/lib/utils";

/**
 * Overdue reminders.
 *
 * The tone escalates with the age of the debt because a shop's does: a nudge at a
 * week, a phone-call warning at two, a stop-work notice at a month. Sending the same
 * polite paragraph forever is why invoices go unpaid.
 *
 * Delivery is best-effort: if SMTP is not configured the reminder is still recorded
 * against the invoice and reported as `sent: false`, so the desk shows the truth
 * rather than pretending an email went out.
 */

export interface ReminderTarget {
  number: string;
  clientName: string;
  email?: string | null;
  total: number;
  amountPaid: number;
  dueDate: Date | string | null;
  daysOverdue: number;
  businessName: string;
}

export function smtpConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

export function reminderCopy(t: ReminderTarget) {
  const owing = t.total - t.amountPaid;
  const due = t.dueDate ? new Date(t.dueDate).toLocaleDateString("en-CA") : "on receipt";
  const money = formatCurrency(owing);

  if (t.daysOverdue >= 30) {
    return {
      stage: "final" as const,
      subject: `Final notice — ${t.number} is ${t.daysOverdue} days overdue`,
      body: [
        `Hi ${t.clientName},`,
        `Invoice ${t.number} for ${money} was due ${due} and is now ${t.daysOverdue} days overdue.`,
        `We have paused further work on this account until it is settled. Please arrange payment this week, or reply to this email if there is a problem with the invoice we should know about.`,
        `— ${t.businessName}`,
      ],
    };
  }
  if (t.daysOverdue >= 14) {
    return {
      stage: "call" as const,
      subject: `${t.number} — ${money} outstanding, ${t.daysOverdue} days past due`,
      body: [
        `Hi ${t.clientName},`,
        `Invoice ${t.number} for ${money} was due ${due} and is now two weeks past due.`,
        `Could you let us know when we can expect payment? If it is easier, reply here and we will call you.`,
        `— ${t.businessName}`,
      ],
    };
  }
  return {
    stage: "nudge" as const,
    subject: `Reminder — invoice ${t.number} (${money})`,
    body: [
      `Hi ${t.clientName},`,
      `A quick reminder that invoice ${t.number} for ${money} was due ${due}.`,
      `If it has already been sent, thank you and please ignore this note.`,
      `— ${t.businessName}`,
    ],
  };
}

export async function sendReminder(t: ReminderTarget) {
  const copy = reminderCopy(t);

  if (!t.email) {
    return { sent: false, reason: "no email on file", ...copy };
  }
  if (!smtpConfigured()) {
    return { sent: false, reason: "SMTP not configured", ...copy };
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });

  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM || `${t.businessName} <noreply@example.com>`,
      to: t.email,
      subject: copy.subject,
      text: copy.body.join("\n\n"),
      html: copy.body.map((p) => `<p>${p}</p>`).join(""),
    });
    return { sent: true, ...copy };
  } catch (e) {
    return { sent: false, reason: (e as Error).message, ...copy };
  }
}
