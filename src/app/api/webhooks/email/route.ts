import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

function verifyMailgunSignature(timestamp: string, token: string, signature: string): boolean {
  const key = process.env.MAILGUN_WEBHOOK_SIGNING_KEY;
  if (!key) return true; // Skip verification if not configured

  const hmac = crypto.createHmac("sha256", key);
  hmac.update(timestamp.concat(token));
  const digest = hmac.digest("hex");
  return digest === signature;
}

function detectSource(from: string, subject: string): string {
  const combined = `${from} ${subject}`.toLowerCase();
  if (combined.includes("homestars")) return "HOMESTARS";
  if (combined.includes("kijiji")) return "KIJIJI";
  if (combined.includes("google")) return "GOOGLE";
  return "EMAIL";
}

function extractEmailFromText(text: string): string | undefined {
  const match = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  return match?.[0];
}

function extractPhoneFromText(text: string): string | undefined {
  const match = text.match(/(\+?1[-.\s]?)?(\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/);
  return match?.[0];
}

// Mailgun inbound parse webhook
export async function POST(req: NextRequest) {
  const formData = await req.formData();

  const timestamp = formData.get("timestamp")?.toString() || "";
  const token = formData.get("token")?.toString() || "";
  const signature = formData.get("signature")?.toString() || "";

  if (!verifyMailgunSignature(timestamp, token, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const from = formData.get("From")?.toString() || formData.get("sender")?.toString() || "";
  const subject = formData.get("Subject")?.toString() || formData.get("subject")?.toString() || "";
  const bodyText = formData.get("body-plain")?.toString() || formData.get("stripped-text")?.toString() || "";

  // Extract name from "Name <email>" format
  const nameMatch = from.match(/^(.+?)\s*<.+>$/) || from.match(/^(.+?)@/);
  const name = nameMatch?.[1]?.trim() || "Email Lead";
  const email = extractEmailFromText(from) || undefined;
  const phone = extractPhoneFromText(bodyText) || undefined;
  const source = detectSource(from, subject);

  // Dedup by email
  if (email) {
    const existing = await prisma.lead.findFirst({ where: { email } });
    if (existing) return NextResponse.json({ ok: true });
  }

  await prisma.lead.create({
    data: {
      name,
      email,
      phone,
      source: source as never,
      notes: `Subject: ${subject}\n\n${bodyText.slice(0, 500)}`,
      status: "NEW",
    },
  });

  return NextResponse.json({ ok: true });
}
