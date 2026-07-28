import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const applicationLog = new Map<string, number[]>();
const WINDOW_MS = 60 * 60 * 1000;
const MAX_APPLICATIONS_PER_HOUR = 8;

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function isRateLimited(ip: string) {
  const now = Date.now();
  const recent = (applicationLog.get(ip) ?? []).filter((timestamp) => now - timestamp < WINDOW_MS);
  if (recent.length >= MAX_APPLICATIONS_PER_HOUR) {
    applicationLog.set(ip, recent);
    return true;
  }
  recent.push(now);
  applicationLog.set(ip, recent);
  return false;
}

export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";

  if (isRateLimited(ip)) {
    return NextResponse.json(
      { error: "Too many applications. Please try again later." },
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

  const vacancy = await prisma.vacancy.findFirst({
    where: {
      slug: params.slug,
      status: "PUBLISHED",
      OR: [{ validThrough: null }, { validThrough: { gt: new Date() } }],
    },
    include: {
      profile: {
        select: {
          tenantId: true,
          displayName: true,
        },
      },
    },
  });

  if (!vacancy) {
    return NextResponse.json({ error: "This vacancy is no longer accepting applications." }, { status: 404 });
  }

  const name = cleanText(body.name, 120);
  const email = cleanText(body.email, 160).toLowerCase();
  const phone = cleanText(body.phone, 40) || null;
  const city = cleanText(body.city, 100) || null;
  const province = cleanText(body.province, 100) || null;
  const skills = cleanText(body.skills, 1000);
  const experience = cleanText(body.experience, 2000);
  const availability = cleanText(body.availability, 500);
  const coverNote = cleanText(body.coverNote, 3000);
  const resumeUrl = cleanText(body.resumeUrl, 500);
  const hasVehicle = body.hasVehicle === true;
  const hasTools = body.hasTools === true;
  const consentToContact = body.consentToContact === true;
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const validResumeUrl =
    !resumeUrl || /^https:\/\/[a-z0-9.-]+(?:\/[^\s]*)?$/i.test(resumeUrl);

  const errors: string[] = [];
  if (name.length < 2) errors.push("Name is required.");
  if (!validEmail) errors.push("A valid email is required.");
  if (skills.length < 3) errors.push("List at least one relevant skill.");
  if (experience.length < 20) errors.push("Describe your relevant experience.");
  if (coverNote.length < 20) errors.push("Add a short application note.");
  if (!validResumeUrl) errors.push("Resume link must use HTTPS.");
  if (!consentToContact) errors.push("Consent to employer contact is required.");

  if (errors.length > 0) {
    return NextResponse.json({ error: "Validation failed.", details: errors }, { status: 422 });
  }

  const sourceLeadId = `vacancy:${vacancy.id}:${email}`;
  const duplicate = await prisma.lead.findFirst({
    where: {
      tenantId: vacancy.profile.tenantId,
      source: "JOB_BOARD",
      sourceLeadId,
    },
    select: { id: true },
  });

  if (duplicate) {
    return NextResponse.json(
      { error: "An application from this email already exists for this vacancy." },
      { status: 409 }
    );
  }

  const notes = [
    `VACANCY: ${vacancy.title}`,
    `COMPANY: ${vacancy.profile.displayName}`,
    `SKILLS: ${skills}`,
    `EXPERIENCE: ${experience}`,
    availability ? `AVAILABILITY: ${availability}` : null,
    `VEHICLE: ${hasVehicle ? "Yes" : "No"}`,
    `OWN TOOLS: ${hasTools ? "Yes" : "No"}`,
    resumeUrl ? `RESUME: ${resumeUrl}` : null,
    `APPLICATION NOTE: ${coverNote}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const lead = await prisma.lead.create({
    data: {
      tenantId: vacancy.profile.tenantId,
      name,
      email,
      phone,
      city,
      address: [city, province].filter(Boolean).join(", ") || null,
      source: "JOB_BOARD",
      sourceLeadId,
      jobType: `Candidate: ${vacancy.title}`,
      notes,
      status: "NEW",
    },
    select: {
      id: true,
      createdAt: true,
    },
  });

  return NextResponse.json(
    {
      ok: true,
      applicationId: lead.id,
      createdAt: lead.createdAt,
      message: `Application sent privately to ${vacancy.profile.displayName}.`,
    },
    { status: 201 }
  );
}
