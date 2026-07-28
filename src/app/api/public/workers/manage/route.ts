import { NextRequest, NextResponse } from "next/server";
import { SERVICE_CATALOG, slugify } from "@/lib/marketplace-config";
import { prisma } from "@/lib/prisma";
import { verifySignedToken } from "@/lib/signed-token";

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

export async function PUT(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const token = cleanText(body.token, 4000);
  const payload = verifySignedToken(token);
  if (
    !payload ||
    payload.purpose !== "worker-profile-manage" ||
    typeof payload.profileId !== "string" ||
    typeof payload.email !== "string"
  ) {
    return NextResponse.json({ error: "Management link is invalid or expired." }, { status: 401 });
  }

  const profile = await prisma.workerProfile.findFirst({
    where: {
      id: payload.profileId,
      email: payload.email.toLowerCase(),
      verificationStatus: { not: "SUSPENDED" },
    },
    select: { id: true, slug: true },
  });
  if (!profile) return NextResponse.json({ error: "Worker profile not found." }, { status: 404 });

  const action = cleanText(body.action, 20).toUpperCase() || "PUBLISH";
  if (!new Set(["PUBLISH", "HIDE"]).has(action)) {
    return NextResponse.json({ error: "Unsupported profile action." }, { status: 422 });
  }

  if (action === "HIDE") {
    await prisma.workerProfile.update({
      where: { id: profile.id },
      data: {
        profileStatus: "HIDDEN",
        consentToPublic: false,
      },
    });
    return NextResponse.json({
      ok: true,
      profile: { slug: profile.slug, status: "HIDDEN" },
      message: "Worker profile hidden from the public directory.",
    });
  }

  const fullName = cleanText(body.fullName, 120);
  const publicName = cleanText(body.publicName, 100);
  const phone = cleanText(body.phone, 40) || null;
  const city = cleanText(body.city, 100);
  const province = cleanText(body.province, 100);
  const headline = cleanText(body.headline, 180);
  const summary = cleanText(body.summary, 3000);
  const skillsText = cleanText(body.skills, 1000);
  const parsedSkills = parseSkills(skillsText);
  const yearsExperience = optionalNumber(body.yearsExperience, 0, 80);
  const hourlyRateMin = optionalNumber(body.hourlyRateMin, 0, 1000);
  const hourlyRateMax = optionalNumber(body.hourlyRateMax, 0, 1000);
  const languages = cleanText(body.languages, 300) || "English";
  const availability = cleanText(body.availability, 500) || null;
  const resumeUrl = cleanText(body.resumeUrl, 500) || null;
  const employmentTypes = parseEmploymentTypes(body.employmentTypes);
  const hasVehicle = body.hasVehicle === true;
  const hasTools = body.hasTools === true;
  const consentToPublic = body.consentToPublic === true;
  const consentToContact = body.consentToContact === true;
  const validResumeUrl =
    !resumeUrl || /^https:\/\/[a-z0-9.-]+(?:\/[^\s]*)?$/i.test(resumeUrl);

  const errors: string[] = [];
  if (fullName.length < 2) errors.push("Full name is required.");
  if (publicName.length < 2) errors.push("Public name is required.");
  if (city.length < 2) errors.push("City is required.");
  if (province.length < 2) errors.push("Province is required.");
  if (headline.length < 5) errors.push("Headline must contain at least 5 characters.");
  if (summary.length < 20) errors.push("Summary must contain at least 20 characters.");
  if (parsedSkills.length === 0) errors.push("List at least one skill.");
  if (employmentTypes.length === 0) errors.push("Select at least one work type.");
  if (!validResumeUrl) errors.push("Resume link must use HTTPS.");
  if (!consentToPublic) errors.push("Public visibility consent is required.");
  if (!consentToContact) errors.push("Private introduction consent is required.");
  if (hourlyRateMin != null && hourlyRateMax != null && hourlyRateMin > hourlyRateMax) {
    errors.push("Minimum hourly rate cannot exceed maximum hourly rate.");
  }

  if (errors.length > 0) {
    return NextResponse.json({ error: "Validation failed.", details: errors }, { status: 422 });
  }

  const saved = await prisma.$transaction(async (tx) => {
    const updated = await tx.workerProfile.update({
      where: { id: profile.id },
      data: {
        fullName,
        publicName,
        phone,
        city,
        province,
        headline,
        summary,
        yearsExperience: yearsExperience == null ? null : Math.round(yearsExperience),
        employmentTypes: employmentTypes.join(","),
        hourlyRateMin,
        hourlyRateMax,
        hasVehicle,
        hasTools,
        languages,
        availability,
        resumeUrl,
        consentToPublic: true,
        consentToContact: true,
        profileStatus: "PUBLISHED",
      },
      select: { slug: true, profileStatus: true },
    });

    await tx.workerSkill.deleteMany({ where: { profileId: profile.id } });
    await tx.workerSkill.createMany({
      data: parsedSkills.map((skill) => ({
        profileId: profile.id,
        slug: skill.slug,
        name: skill.name,
        yearsExperience: yearsExperience == null ? null : Math.round(yearsExperience),
      })),
    });

    return updated;
  });

  return NextResponse.json({
    ok: true,
    profile: { slug: saved.slug, status: saved.profileStatus },
    message: "Worker profile updated and published.",
  });
}
