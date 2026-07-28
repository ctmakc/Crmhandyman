import { NextRequest, NextResponse } from "next/server";
import { escapeHtml, sendOutboundEmail } from "@/lib/email";
import { SERVICE_CATALOG, slugify } from "@/lib/marketplace-config";
import { prisma } from "@/lib/prisma";
import { createSignedToken } from "@/lib/signed-token";

const requestLog = new Map<string, number[]>();
const WINDOW_MS = 60 * 60 * 1000;
const MAX_REQUESTS_PER_HOUR = 5;
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
          const match = SERVICE_CATALOG.find(
            (service) =>
              service.slug === slugify(name) || service.name.toLowerCase() === name.toLowerCase()
          );
          const normalizedName = match?.name ?? name.slice(0, 100);
          const normalizedSlug = match?.slug ?? slugify(name).slice(0, 80);
          return [normalizedSlug, { slug: normalizedSlug, name: normalizedName }] as const;
        })
        .filter(([skillSlug]) => Boolean(skillSlug))
    ).values()
  );
}

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  if (rateLimited(ip)) {
    return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
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

  const fullName = cleanText(body.fullName, 120);
  const publicName = cleanText(body.publicName, 100);
  const email = cleanText(body.email, 160).toLowerCase();
  const phone = cleanText(body.phone, 40) || null;
  const city = cleanText(body.city, 100);
  const province = cleanText(body.province, 100);
  const headline = cleanText(body.headline, 180);
  const summary = cleanText(body.summary, 3000);
  const skillsText = cleanText(body.skills, 1000);
  const skills = parseSkills(skillsText);
  const yearsExperience = optionalNumber(body.yearsExperience, 0, 80);
  const employmentTypes = parseEmploymentTypes(body.employmentTypes);
  const hourlyRateMin = optionalNumber(body.hourlyRateMin, 0, 1000);
  const hourlyRateMax = optionalNumber(body.hourlyRateMax, 0, 1000);
  const hasVehicle = body.hasVehicle === true;
  const hasTools = body.hasTools === true;
  const languages = cleanText(body.languages, 300) || "English";
  const availability = cleanText(body.availability, 500) || null;
  const resumeUrl = cleanText(body.resumeUrl, 500) || null;
  const consentToPublic = body.consentToPublic === true;
  const consentToContact = body.consentToContact === true;
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const validResumeUrl =
    !resumeUrl || /^https:\/\/[a-z0-9.-]+(?:\/[^\s]*)?$/i.test(resumeUrl);

  const errors: string[] = [];
  if (fullName.length < 2) errors.push("Full name is required.");
  if (publicName.length < 2) errors.push("Public name is required.");
  if (!validEmail) errors.push("A valid private email is required.");
  if (city.length < 2) errors.push("City is required.");
  if (province.length < 2) errors.push("Province is required.");
  if (headline.length < 5) errors.push("Headline must contain at least 5 characters.");
  if (summary.length < 20) errors.push("Summary must contain at least 20 characters.");
  if (skills.length === 0) errors.push("List at least one skill.");
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

  const existing = await prisma.workerProfile.findUnique({
    where: { email },
    select: {
      id: true,
      slug: true,
      publicName: true,
      profileStatus: true,
      verificationStatus: true,
    },
  });

  if (existing?.verificationStatus === "SUSPENDED") {
    return NextResponse.json({ error: "This worker profile is suspended." }, { status: 403 });
  }

  if (existing && existing.profileStatus !== "DRAFT") {
    const token = createSignedToken(
      { purpose: "worker-profile-manage", profileId: existing.id, email },
      30 * 60
    );
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://handymanpro.ca";
    const manageUrl = `${baseUrl}/workers/manage?token=${encodeURIComponent(token)}`;
    try {
      await sendOutboundEmail({
        to: email,
        subject: "Manage your existing HandymanPro worker profile",
        text: `A worker profile already exists for this email. Use this 30-minute link to manage it:\n\n${manageUrl}`,
        html: `<p>A worker profile already exists for this email.</p><p><a href="${escapeHtml(manageUrl)}">Manage worker profile</a></p><p><small>This link expires in 30 minutes.</small></p>`,
      });
    } catch (error) {
      console.error("Existing worker management email failed", error);
    }

    return NextResponse.json({
      ok: true,
      existing: true,
      message: "A profile already exists for this email. A private management link has been sent if email delivery is configured.",
    });
  }

  const slug =
    existing?.slug ||
    `${slugify(`${publicName}-${city}`) || "worker"}-${Date.now().toString(36)}`.slice(0, 100);

  const saved = await prisma.$transaction(async (tx) => {
    const profile = await tx.workerProfile.upsert({
      where: { email },
      update: {
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
        profileStatus: "DRAFT",
      },
      create: {
        slug,
        email,
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
        profileStatus: "DRAFT",
      },
      select: { id: true, slug: true },
    });

    await tx.workerSkill.deleteMany({ where: { profileId: profile.id } });
    await tx.workerSkill.createMany({
      data: skills.map((skill) => ({
        profileId: profile.id,
        slug: skill.slug,
        name: skill.name,
        yearsExperience: yearsExperience == null ? null : Math.round(yearsExperience),
      })),
    });

    return profile;
  });

  const token = createSignedToken(
    { purpose: "worker-profile-verification", profileId: saved.id, email },
    24 * 60 * 60
  );
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://handymanpro.ca";
  const verifyUrl = `${baseUrl}/api/public/workers/verify?token=${encodeURIComponent(token)}`;
  let verificationSent = false;

  try {
    const delivery = await sendOutboundEmail({
      to: email,
      subject: "Verify your HandymanPro worker profile",
      text: [
        `Hello ${fullName},`,
        "",
        `Public name: ${publicName}`,
        `Headline: ${headline}`,
        `Location: ${city}, ${province}`,
        `Skills: ${skills.map((skill) => skill.name).join(", ")}`,
        "",
        "Verify and publish the profile using this 24-hour link:",
        verifyUrl,
        "",
        "If you did not request this, ignore the email. Nothing will be published.",
      ].join("\n"),
      html: `
        <p>Hello ${escapeHtml(fullName)},</p>
        <p>You requested an opt-in HandymanPro worker profile.</p>
        <p><strong>Public name:</strong> ${escapeHtml(publicName)}<br>
        <strong>Headline:</strong> ${escapeHtml(headline)}<br>
        <strong>Location:</strong> ${escapeHtml(`${city}, ${province}`)}<br>
        <strong>Skills:</strong> ${escapeHtml(skills.map((skill) => skill.name).join(", "))}</p>
        <p><a href="${escapeHtml(verifyUrl)}">Verify and publish worker profile</a></p>
        <p><small>This link expires in 24 hours. If you did not request this, ignore the email; nothing will be published.</small></p>
      `,
    });
    verificationSent = delivery.sent;
  } catch (error) {
    console.error("Worker profile verification email failed", error);
  }

  return NextResponse.json(
    {
      ok: true,
      verificationSent,
      message: verificationSent
        ? "Draft saved. Check your email to verify and publish the worker profile."
        : "Draft saved, but verification email delivery is not currently available.",
    },
    { status: 201 }
  );
}
