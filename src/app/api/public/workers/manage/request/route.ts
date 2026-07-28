import { NextRequest, NextResponse } from "next/server";
import { escapeHtml, sendOutboundEmail } from "@/lib/email";
import { prisma } from "@/lib/prisma";
import { createSignedToken } from "@/lib/signed-token";

const requestLog = new Map<string, number[]>();
const WINDOW_MS = 60 * 60 * 1000;
const MAX_REQUESTS_PER_HOUR = 5;

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function rateLimited(ip: string) {
  const now = Date.now();
  const recent = (requestLog.get(ip) ?? []).filter((timestamp) => now - timestamp < WINDOW_MS);
  if (recent.length >= MAX_REQUESTS_PER_HOUR) {
    requestLog.set(ip, recent);
    return true;
  }
  recent.push(now);
  requestLog.set(ip, recent);
  return false;
}

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";

  if (rateLimited(ip)) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  if (cleanText(body.companyWebsite, 200)) {
    return NextResponse.json({ ok: true }, { status: 202 });
  }

  const email = cleanText(body.email, 160).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "A valid email is required." }, { status: 422 });
  }

  const genericResponse = NextResponse.json({
    ok: true,
    message: "If a worker profile exists for this email, a management link has been sent.",
  });

  const profile = await prisma.workerProfile.findFirst({
    where: {
      email,
      verificationStatus: { not: "SUSPENDED" },
    },
    select: {
      id: true,
      publicName: true,
    },
  });

  if (!profile) return genericResponse;

  const token = createSignedToken(
    {
      purpose: "worker-profile-manage",
      profileId: profile.id,
      email,
    },
    30 * 60
  );
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://handymanpro.ca";
  const manageUrl = `${baseUrl}/workers/manage?token=${encodeURIComponent(token)}`;

  try {
    await sendOutboundEmail({
      to: email,
      subject: "Manage your HandymanPro worker profile",
      text: [
        `Hello ${profile.publicName},`,
        "",
        "Use the private link below to update or hide your worker profile:",
        manageUrl,
        "",
        "This link expires in 30 minutes. If you did not request it, ignore this email.",
      ].join("\n"),
      html: `
        <p>Hello ${escapeHtml(profile.publicName)},</p>
        <p>Use the private link below to update or hide your worker profile:</p>
        <p><a href="${escapeHtml(manageUrl)}">Manage worker profile</a></p>
        <p><small>This link expires in 30 minutes. If you did not request it, ignore this email.</small></p>
      `,
    });
  } catch (error) {
    console.error("Worker management email failed", error);
  }

  return genericResponse;
}
