import { mailer, smtpConfigured, smtpFrom } from "@/lib/mailer";

/**
 * The estimate, as a PDF, to the client.
 *
 * With SMTP unset this used to build a transport anyway and hang on a host that does not
 * exist. The caller gets a plain false instead, which is what the screen already knows
 * how to say.
 *
 * Every word here is read by the CONTRACTOR'S customer, so none of it may name this
 * product. The subject used to say «Your Estimate from HandyCRM» — a company the
 * customer has never dealt with — and the body opened «Please find your estimate
 * attached» and closed «Thank you for your business!» without naming the sum, the
 * number or the sender. The attachment went out as `estimate-cms3jnlyt0000h67g.pdf`.
 */
export async function sendEstimateEmail(
  to: string,
  clientName: string,
  /** `EST-2026-0004` — the number printed on the sheet, not the database id. */
  estimateRef: string,
  /** The contractor's own name, as it stands on the paper. */
  businessName: string,
  /** Already formatted for the reader: `$4,820.00`. */
  total: string,
  pdfBuffer: Buffer
): Promise<boolean> {
  if (!smtpConfigured()) return false;

  // The name reached this shop through a public quiz form; it is escaped before it is
  // put in markup, exactly as the printed document does it.
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const name = esc(clientName);
  const from = esc(businessName);

  await mailer().sendMail({
    from: smtpFrom(),
    to,
    subject: `Estimate ${estimateRef} — ${businessName}`,
    html: `
      <p>Hi ${name},</p>
      <p>Your estimate is attached — ${esc(estimateRef)}, ${esc(total)}.</p>
      <p>Reply to this email to accept it, or to ask for a change.</p>
      <p>— ${from}</p>
    `,
    attachments: [
      {
        filename: `${estimateRef}.pdf`,
        content: pdfBuffer,
        contentType: "application/pdf",
      },
    ],
  });
  return true;
}
