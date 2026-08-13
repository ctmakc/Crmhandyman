import { formatCents } from "@/lib/money";
import { CHASE_DAYS } from "@/lib/invoice-state";
import { mailer, smtpConfigured, smtpFrom } from "@/lib/mailer";

/**
 * Overdue reminders.
 *
 * The tone climbs the ladder in `invoice-state` because a shop's does: a plain notice
 * while the first week runs out, a nudge at seven days, a "when can we expect it" at
 * fourteen, a stop-work notice at thirty. Sending the same polite paragraph forever is
 * why invoices go unpaid; opening with "you are overdue" on day one is why clients feel
 * hounded over a cheque that was already in the post.
 *
 * Delivery is best-effort: if SMTP is not configured the reminder is still recorded
 * against the invoice and reported as `sent: false`, so the desk shows the truth
 * rather than pretending an email went out. With no address on file at all the invoice
 * is handed to the phone instead — every lead from the two quiz landings arrives with a
 * number and nothing else, so that is the main road, not an edge case.
 */

export interface ReminderTarget {
  number: string;
  clientName: string;
  email?: string | null;
  /** The number the desk would dial when there is nothing to write to. */
  phone?: string | null;
  totalCents: number;
  amountPaidCents: number;
  dueDate: Date | string | null;
  daysOverdue: number;
  businessName: string;
}

/** Re-exported so the chase code reads in one place; the transport lives in `@/lib/mailer`. */
export { smtpConfigured };

export function reminderCopy(t: ReminderTarget) {
  const owingCents = t.totalCents - t.amountPaidCents;
  const due = t.dueDate ? new Date(t.dueDate).toLocaleDateString("en-CA") : "on receipt";
  const money = formatCents(owingCents);

  if (t.daysOverdue >= CHASE_DAYS.final) {
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
  if (t.daysOverdue >= CHASE_DAYS.call) {
    return {
      stage: "call" as const,
      subject: `${t.number} — ${money} outstanding, ${t.daysOverdue} days past due`,
      body: [
        `Hi ${t.clientName},`,
        // The real count, not the name of the rung. The rung runs from day 14 to day 29,
        // and a client 29 days late reading «two weeks» is handed the one number in the
        // letter he can prove wrong.
        `Invoice ${t.number} for ${money} was due ${due} and is now ${t.daysOverdue} days past due.`,
        `Could you let us know when we can expect payment? If it is easier, reply here and we will call you.`,
        `— ${t.businessName}`,
      ],
    };
  }
  if (t.daysOverdue >= CHASE_DAYS.nudge) {
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
  /**
   * The first week. A copy of the paper and an open door — the word "overdue" does not
   * appear, because at three days late it is usually true that nothing is wrong yet.
   */
  return {
    stage: "notice" as const,
    subject: `Invoice ${t.number} — ${money} due ${due}`,
    body: [
      `Hi ${t.clientName},`,
      `Here is invoice ${t.number} for ${money} again, for your records — it came due ${due}.`,
      `If it is already paid or on its way, thank you. If anything on it needs changing, reply here and we will sort it out.`,
      `— ${t.businessName}`,
    ],
  };
}

export type ReminderResult = ReturnType<typeof reminderCopy> & {
  sent: boolean;
  /** How this one actually reaches the client — the desk shows the truth either way. */
  channel: "email" | "phone";
  reason?: string;
  phone?: string | null;
};

export async function sendReminder(t: ReminderTarget): Promise<ReminderResult> {
  const copy = reminderCopy(t);

  // No address means the chase moves to the phone rather than stopping. The number
  // travels with the answer so the desk can dial without opening another screen.
  if (!t.email) {
    return { sent: false, channel: "phone", reason: "no email on file", phone: t.phone, ...copy };
  }
  if (!smtpConfigured()) {
    return { sent: false, channel: "email", reason: "SMTP not configured", ...copy };
  }

  try {
    await mailer().sendMail({
      from: smtpFrom(t.businessName),
      to: t.email,
      subject: copy.subject,
      text: copy.body.join("\n\n"),
      html: copy.body.map((p) => `<p>${p}</p>`).join(""),
    });
    return { sent: true, channel: "email", ...copy };
  } catch (e) {
    return { sent: false, channel: "email", reason: (e as Error).message, ...copy };
  }
}
