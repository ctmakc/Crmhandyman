import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { escapeHtml, sendOutboundEmail } from "@/lib/email";
import { getAppSessionUser } from "@/lib/session";

const inquiryLog = new Map<string, number[]>();
const WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_INQUIRIES_PER_DAY = 15;

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function isRateLimited(tenantId: string) {
  const now = Date.now();
  const recent = (inquiryLog.get(tenantId) ?? []).filter((timestamp) => now - timestamp < WINDOW_MS);
  if (recent.length >= MAX_INQUIRIES_PER_DAY) {
    inquiryLog.set(tenantId, recent);
    return true;
  }
  recent.push(now);
  inquiryLog.set(tenantId, recent);
  return false;
}

export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const user = await getAppSessionUser();
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "A contractor admin account is required." }, { status: 403 });
  }

  if (isRateLimited(user.tenantId)) {
    return NextResponse.json(
      { error: "Daily worker introduction limit reached." },
      { status: 429 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const worker = await prisma.workerProfile.findFirst({
    where: {
      slug: params.slug,
      profileStatus: "PUBLISHED",
      consentToPublic: true,
      consentToContact: true,
      verificationStatus: { not: "SUSPENDED" },
    },
    select: {
      id: true,
      email: true,
      publicName: true,
      city: true,
      province: true,
      headline: true,
    },
  });

  if (!worker) {
    return NextResponse.json(
      { error: "This worker profile is not accepting introductions." },
      { status: 404 }
    );
  }

  const employer = await prisma.tenant.findUnique({
    where: { id: user.tenantId },
    select: {
      businessName: true,
      ownerEmail: true,
      contractorProfile: {
        select: {
          slug: true,
          displayName: true,
          phone: true,
          publicEmail: true,
          profileStatus: true,
        },
      },
    },
  });

  if (!employer) return NextResponse.json({ error: "Workspace not found." }, { status: 404 });

  const opportunityTitle = cleanText(body.opportunityTitle, 160);
  const message = cleanText(body.message, 3000);
  const contactName = cleanText(body.contactName, 120) || user.name || employer.businessName;
  const contactEmail = cleanText(body.contactEmail, 160).toLowerCase() || user.email || employer.ownerEmail;
  const contactPhone = cleanText(body.contactPhone, 40) || employer.contractorProfile?.phone || "";
  const consent = body.consent === true;
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail);

  const errors: string[] = [];
  if (opportunityTitle.length < 5) errors.push("Opportunity title must contain at least 5 characters.");
  if (message.length < 30) errors.push("Message must contain at least 30 characters.");
  if (contactName.length < 2) errors.push("Contact name is required.");
  if (!validEmail) errors.push("A valid reply email is required.");
  if (!consent) errors.push("Confirm that this is a genuine work opportunity.");

  if (errors.length > 0) {
    return NextResponse.json({ error: "Validation failed.", details: errors }, { status: 422 });
  }

  const employerName = employer.contractorProfile?.displayName || employer.businessName;
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://handymanpro.ca";
  const companyProfileUrl =
    employer.contractorProfile?.profileStatus === "PUBLISHED" && employer.contractorProfile.slug
      ? `${baseUrl}/pro/${employer.contractorProfile.slug}`
      : null;

  const lead = await prisma.lead.create({
    data: {
      tenantId: user.tenantId,
      name: `Recruiting: ${worker.publicName}`,
      city: worker.city,
      address: `${worker.city}, ${worker.province}`,
      source: "DIRECTORY",
      sourceLeadId: `worker-intro:${worker.id}:${Date.now()}`,
      jobType: `Worker introduction: ${opportunityTitle}`,
      notes: [
        `WORKER PROFILE: ${baseUrl}/worker/${params.slug}`,
        `WORKER HEADLINE: ${worker.headline}`,
        `OPPORTUNITY: ${opportunityTitle}`,
        `MESSAGE: ${message}`,
        `EMPLOYER CONTACT: ${contactName} · ${contactEmail}${contactPhone ? ` · ${contactPhone}` : ""}`,
        companyProfileUrl ? `COMPANY PROFILE: ${companyProfileUrl}` : null,
        "The worker's private email and phone remain hidden from this tenant until the worker replies directly.",
      ]
        .filter(Boolean)
        .join("\n\n"),
      status: "NEW",
    },
    select: { id: true },
  });

  let delivery: { sent: boolean; reason?: string } = { sent: false };
  try {
    const sent = await sendOutboundEmail({
      to: worker.email,
      replyTo: contactEmail,
      subject: `${employerName} would like to discuss: ${opportunityTitle}`,
      text: [
        `Hello ${worker.publicName},`,
        "",
        `${employerName} found your opt-in HandymanPro worker profile and would like to discuss a work opportunity.`,
        "",
        `Opportunity: ${opportunityTitle}`,
        "",
        message,
        "",
        `Contact: ${contactName}`,
        `Email: ${contactEmail}`,
        contactPhone ? `Phone: ${contactPhone}` : null,
        companyProfileUrl ? `Company profile: ${companyProfileUrl}` : null,
        "",
        "Replying to this email sends your response directly to the employer. HandymanPro did not disclose your private email address to them.",
      ]
        .filter(Boolean)
        .join("\n"),
      html: `
        <p>Hello ${escapeHtml(worker.publicName)},</p>
        <p><strong>${escapeHtml(employerName)}</strong> found your opt-in HandymanPro worker profile and would like to discuss a work opportunity.</p>
        <p><strong>Opportunity:</strong> ${escapeHtml(opportunityTitle)}</p>
        <p style="white-space:pre-line">${escapeHtml(message)}</p>
        <p><strong>Contact:</strong> ${escapeHtml(contactName)}<br>
        <strong>Email:</strong> ${escapeHtml(contactEmail)}${contactPhone ? `<br><strong>Phone:</strong> ${escapeHtml(contactPhone)}` : ""}</p>
        ${companyProfileUrl ? `<p><a href="${escapeHtml(companyProfileUrl)}">View company profile</a></p>` : ""}
        <p><small>Replying to this email sends your response directly to the employer. HandymanPro did not disclose your private email address to them.</small></p>
      `,
    });
    delivery = sent.sent ? { sent: true } : { sent: false, reason: sent.reason };
  } catch (error) {
    console.error("Worker introduction email failed", error);
    delivery = { sent: false, reason: "DELIVERY_FAILED" };
  }

  return NextResponse.json(
    {
      ok: true,
      leadId: lead.id,
      delivery,
      message: delivery.sent
        ? "Introduction sent privately to the worker."
        : "Introduction saved in CRM, but SMTP delivery is not currently available.",
    },
    { status: delivery.sent ? 201 : 202 }
  );
}
