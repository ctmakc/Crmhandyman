import { mailer, smtpConfigured, smtpFrom } from "@/lib/mailer";

/**
 * The estimate, as a PDF, to the client.
 *
 * With SMTP unset this used to build a transport anyway and hang on a host that does not
 * exist. The caller gets a plain false instead, which is what the screen already knows
 * how to say.
 */
export async function sendEstimateEmail(
  to: string,
  clientName: string,
  estimateId: string,
  pdfBuffer: Buffer
): Promise<boolean> {
  if (!smtpConfigured()) return false;

  // The name reached this shop through a public quiz form; it is escaped before it is
  // put in markup, exactly as the printed document does it.
  const name = clientName.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  await mailer().sendMail({
    from: smtpFrom(),
    to,
    subject: `Your Estimate from HandymanPro`,
    html: `
      <p>Hi ${name},</p>
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
  return true;
}
