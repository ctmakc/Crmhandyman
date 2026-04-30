import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export async function sendEstimateEmail(
  to: string,
  clientName: string,
  estimateId: string,
  pdfBuffer: Buffer
) {
  await transporter.sendMail({
    from: process.env.SMTP_FROM || "HandymanCRM <noreply@example.com>",
    to,
    subject: `Your Estimate from HandymanPro`,
    html: `
      <p>Hi ${clientName},</p>
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
