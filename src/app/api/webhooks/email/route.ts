import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

/**
 * Fails closed. This used to return true when the signing key was absent, so a
 * deployment that simply forgot the variable accepted invented leads from anyone.
 */
function verifyMailgunSignature(timestamp: string, token: string, signature: string): boolean {
  const key = process.env.MAILGUN_WEBHOOK_SIGNING_KEY;
  if (!key) return false;

  const hmac = crypto.createHmac("sha256", key);
  hmac.update(timestamp.concat(token));
  const digest = Buffer.from(hmac.digest("hex"));
  const given = Buffer.from(signature || "");

  return digest.length === given.length && crypto.timingSafeEqual(digest, given);
}

/** The configured inbox, however the settings form happened to store it. */
function configuredAddress(config: string | null): string | null {
  if (!config) return null;
  let value: unknown = config;
  try {
    value = JSON.parse(config);
  } catch {
    /* stored as a bare string */
  }
  if (typeof value === "string") return value.trim().toLowerCase() || null;
  if (value && typeof value === "object") {
    const address = (value as { address?: string; email?: string }).address ??
      (value as { email?: string }).email;
    return address ? address.trim().toLowerCase() : null;
  }
  return null;
}

/** A repeat enquiry inside this window is the same lead; after it, it is new work. */
const DEDUP_WINDOW_DAYS = Number(process.env.LEAD_DEDUP_DAYS || 30);

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

  // Route by the address the mail was sent to. Taking the first active integration
  // meant that with two customers on the email channel, every lead landed in whichever
  // workspace happened to be created first.
  const recipient = (formData.get("recipient")?.toString() ||
    formData.get("To")?.toString() ||
    "")
    .toLowerCase();
  const recipientAddress = extractEmailFromText(recipient)?.toLowerCase();

  const candidates = await prisma.channelIntegration.findMany({
    where: { channel: "EMAIL", isActive: true },
  });
  const emailIntegration = recipientAddress
    ? candidates.find((c) => configuredAddress(c.config) === recipientAddress)
    : undefined;

  // Unroutable mail is dropped, and answered 200 so Mailgun stops retrying it.
  if (!emailIntegration) {
    console.warn(`Inbound lead for an unconfigured address: ${recipientAddress ?? "unknown"}`);
    return NextResponse.json({ ok: true, routed: false });
  }

  const tenantId = emailIntegration.tenantId;

  // Same sender inside a short window is the same enquiry arriving twice. Beyond it,
  // a returning customer is a new job — an unbounded dedup silently swallowed those.
  if (email) {
    const since = new Date(Date.now() - DEDUP_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const existing = await prisma.lead.findFirst({
      where: { email, tenantId, createdAt: { gte: since } },
    });
    if (existing) return NextResponse.json({ ok: true, deduped: true });
  }

  await prisma.lead.create({
    data: {
      tenantId,
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
