import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { SERVICE_CATALOG, slugify } from "@/lib/marketplace-config";

const applicationLog = new Map<string, number[]>();
const WINDOW_MS = 60 * 60 * 1000;
const MAX_APPLICATIONS_PER_HOUR = 8;
const EMPLOYMENT_TYPES = new Set([
  "FULL_TIME",
  "PART_TIME",
  "CONTRACT",
  "TEMPORARY",
  "GIG",
  "SUBCONTRACT",
]);

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function optionalNumber(value: unknown, min: number, max: number) {
  if (value === "" || value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : null;
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

function parseEmploymentTypes(value: unknown) {
  const values = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];

  return Array.from(
    new Set(
      values
        .map((item) => cleanText(item, 40).toUpperCase())
        .filter((item) => EMPLOYMENT_TYPES.has(item))
    )
  );
}

function parseSkills(value: string) {
  return Array.from(
    new Map(
      value
        .split(/[\n,;]+/)
        .map((item) => item.trim())
        .filter((item) => item.length >= 2)
        .slice(0, 20)
        .map((name) => {
          const catalogMatch = SERVICE_CATALOG.find(
            (service) =>
              service.slug === slugify(name) || service.name.toLowerCase() === name.toLowerCase()
          );
          const normalizedName = catalogMatch?.name ?? name.slice(0, 100);
          const normalizedSlug = catalogMatch?.slug ?? slugify(name).slice(0, 80);
          return [normalizedSlug, { slug: normalizedSlug, name: normalizedName }] as const;
        })
        .filter(([skillSlug]) => Boolean(skillSlug))
    ).values()
  );
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
    return NextResponse.json(
      { error: "This vacancy is no longer accepting applications." },
      { status: 404 }
    );
  }

  const name = cleanText(body.name, 120);
  const email = cleanText(body.email, 160).toLowerCase();
  const phone = cleanText(body.phone, 40) || null;
  const city = cleanText(body.city, 100);
  const province = cleanText(body.province, 100);
  const skills = cleanText(body.skills, 1000);
  const experience = cleanText(body.experience, 3000);
  const availability = cleanText(body.availability, 500);
  const coverNote = cleanText(body.coverNote, 3000);
  const resumeUrl = cleanText(body.resumeUrl, 500);
  const hasVehicle = body.hasVehicle === true;
  const hasTools = body.hasTools === true;
  const consentToContact = body.consentToContact === true;
  const publishProfile = body.publishProfile === true;
  const consentToPublic = body.consentToPublic === true;

  const publicName = cleanText(body.publicName, 100);
  const headline = cleanText(body.headline, 180);
  const languages = cleanText(body.languages, 300) || "English";
  const yearsExperience = optionalNumber(body.yearsExperience, 0, 80);
  const hourlyRateMin = optionalNumber(body.hourlyRateMin, 0, 1000);
  const hourlyRateMax = optionalNumber(body.hourlyRateMax, 0, 1000);
  const employmentTypes = parseEmploymentTypes(body.employmentTypes);
  const parsedSkills = parseSkills(skills);

  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const validResumeUrl =
    !resumeUrl || /^https:\/\/[a-z0-9.-]+(?:\/[^\s]*)?$/i.test(resumeUrl);

  const errors: string[] = [];
  if (name.length < 2) errors.push("Name is required.");
  if (!validEmail) errors.push("A valid email is required.");
  if (parsedSkills.length === 0) errors.push("List at least one relevant skill.");
  if (experience.length < 20) errors.push("Describe your relevant experience.");
  if (coverNote.length < 20) errors.push("Add a short application note.");
  if (!validResumeUrl) errors.push("Resume link must use HTTPS.");
  if (!consentToContact) errors.push("Consent to employer contact is required.");

  if (publishProfile) {
    if (!consentToPublic) errors.push("Public profile consent is required.");
    if (publicName.length < 2) errors.push("Public profile name is required.");
    if (headline.length < 5) errors.push("Public headline must contain at least 5 characters.");
    if (city.length < 2) errors.push("City is required for the worker directory.");
    if (province.length < 2) errors.push("Province is required for the worker directory.");
    if (employmentTypes.length === 0) errors.push("Select at least one preferred work type.");
    if (hourlyRateMin != null && hourlyRateMax != null && hourlyRateMin > hourlyRateMax) {
      errors.push("Minimum hourly rate cannot exceed maximum hourly rate.");
    }
  }

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

  const existingWorker = publishProfile
    ? await prisma.workerProfile.findUnique({
        where: { email },
        select: { id: true, slug: true },
      })
    : null;
  const workerSlug =
    existingWorker?.slug ||
    `${slugify(`${publicName}-${city}`) || "worker"}-${Date.now().toString(36)}`.slice(0, 100);

  const notes = [
    `VACANCY: ${vacancy.title}`,
    `COMPANY: ${vacancy.profile.displayName}`,
    `SKILLS: ${skills}`,
    `EXPERIENCE: ${experience}`,
    availability ? `AVAILABILITY: ${availability}` : null,
    `VEHICLE: ${hasVehicle ? "Yes" : "No"}`,
    `OWN TOOLS: ${hasTools ? "Yes" : "No"}`,
    resumeUrl ? `RESUME: ${resumeUrl}` : null,
    publishProfile ? `PUBLIC WORKER PROFILE: /worker/${workerSlug}` : null,
    `APPLICATION NOTE: ${coverNote}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const result = await prisma.$transaction(async (tx) => {
    const lead = await tx.lead.create({
      data: {
        tenantId: vacancy.profile.tenantId,
        name,
        email,
        phone,
        city: city || null,
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

    let workerProfile: { id: string; slug: string } | null = null;
    if (publishProfile) {
      workerProfile = await tx.workerProfile.upsert({
        where: { email },
        update: {
          fullName: name,
          publicName,
          phone,
          city,
          province,
          headline,
          summary: experience,
          yearsExperience: yearsExperience == null ? null : Math.round(yearsExperience),
          employmentTypes: employmentTypes.join(","),
          hourlyRateMin,
          hourlyRateMax,
          hasVehicle,
          hasTools,
          languages,
          availability: availability || null,
          resumeUrl: resumeUrl || null,
          consentToContact: true,
          consentToPublic: true,
          profileStatus: "PUBLISHED",
        },
        create: {
          slug: workerSlug,
          email,
          fullName: name,
          publicName,
          phone,
          city,
          province,
          headline,
          summary: experience,
          yearsExperience: yearsExperience == null ? null : Math.round(yearsExperience),
          employmentTypes: employmentTypes.join(","),
          hourlyRateMin,
          hourlyRateMax,
          hasVehicle,
          hasTools,
          languages,
          availability: availability || null,
          resumeUrl: resumeUrl || null,
          consentToContact: true,
          consentToPublic: true,
          profileStatus: "PUBLISHED",
        },
        select: { id: true, slug: true },
      });

      await tx.workerSkill.deleteMany({ where: { profileId: workerProfile.id } });
      await tx.workerSkill.createMany({
        data: parsedSkills.map((skill) => ({
          profileId: workerProfile!.id,
          slug: skill.slug,
          name: skill.name,
          yearsExperience: yearsExperience == null ? null : Math.round(yearsExperience),
        })),
      });
    }

    return { lead, workerProfile };
  });

  return NextResponse.json(
    {
      ok: true,
      applicationId: result.lead.id,
      createdAt: result.lead.createdAt,
      workerProfile: result.workerProfile
        ? { slug: result.workerProfile.slug, published: true }
        : null,
      message: `Application sent privately to ${vacancy.profile.displayName}.`,
    },
    { status: 201 }
  );
}
