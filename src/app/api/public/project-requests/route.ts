import { NextRequest, NextResponse } from "next/server";
import { SERVICE_CATALOG, slugify } from "@/lib/marketplace";
import { prisma } from "@/lib/prisma";
import { consumeRateLimit, rateLimitHeaders } from "@/lib/rate-limit";

const allowedUrgencies = new Set([
  "EMERGENCY",
  "WITHIN_48_HOURS",
  "THIS_WEEK",
  "FLEXIBLE",
]);

function readString(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function readOptionalNumber(value: unknown): number | null {
  if (value === "" || value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  if (readString(body.companyWebsite, 200)) {
    return NextResponse.json({ ok: true }, { status: 202 });
  }

  const customerName = readString(body.customerName, 100);
  const customerEmail = readString(body.customerEmail, 160).toLowerCase();
  const customerPhone = readString(body.customerPhone, 40) || null;
  const title = readString(body.title, 140);
  const description = readString(body.description, 4000);
  const serviceSlug = readString(body.serviceSlug, 80);
  const city = readString(body.city, 100);
  const province = readString(body.province, 100);
  const postalCode = readString(body.postalCode, 16).toUpperCase() || null;
  const urgency = readString(body.urgency, 40) || "FLEXIBLE";
  const preferredContractor = readString(body.preferredContractor, 100) || null;
  const consentToShare = body.consentToShare === true;
  const budgetMin = readOptionalNumber(body.budgetMin);
  const budgetMax = readOptionalNumber(body.budgetMax);

  const validService = SERVICE_CATALOG.some((service) => service.slug === serviceSlug);
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail);

  const errors: string[] = [];
  if (customerName.length < 2) errors.push("Name is required.");
  if (!validEmail) errors.push("A valid email is required.");
  if (title.length < 5) errors.push("Project title must be at least 5 characters.");
  if (description.length < 20) errors.push("Project description must be at least 20 characters.");
  if (!validService) errors.push("Select a supported service.");
  if (city.length < 2) errors.push("City is required.");
  if (province.length < 2) errors.push("Province is required.");
  if (!allowedUrgencies.has(urgency)) errors.push("Invalid urgency.");
  if (!consentToShare) errors.push("Consent is required before matching contractors.");
  if (budgetMin != null && budgetMax != null && budgetMin > budgetMax) {
    errors.push("Minimum budget cannot exceed maximum budget.");
  }

  if (errors.length > 0) {
    return NextResponse.json({ error: "Validation failed.", details: errors }, { status: 422 });
  }

  try {
    const ipLimit = await consumeRateLimit({
      scope: "project-request-ip",
      identifier: ip,
      limit: 5,
      windowMs: 60 * 60 * 1000,
    });
    if (!ipLimit.allowed) {
      return NextResponse.json(
        { error: "Too many project requests. Please try again later." },
        { status: 429, headers: rateLimitHeaders(ipLimit) }
      );
    }

    const emailLimit = await consumeRateLimit({
      scope: "project-request-email",
      identifier: customerEmail,
      limit: 3,
      windowMs: 60 * 60 * 1000,
    });
    if (!emailLimit.allowed) {
      return NextResponse.json(
        { error: "Too many project requests. Please try again later." },
        { status: 429, headers: rateLimitHeaders(emailLimit) }
      );
    }
  } catch (error) {
    console.error("Project request rate limiter failed", error);
    return NextResponse.json(
      { error: "Request protection is temporarily unavailable." },
      { status: 503 }
    );
  }

  const slugBase = slugify(`${title}-${city}`) || "project";
  const slug = `${slugBase}-${Date.now().toString(36)}`;
  const descriptionWithPreference = preferredContractor
    ? `${description}\n\nPreferred contractor profile: ${preferredContractor}`
    : description;

  const job = await prisma.marketplaceJob.create({
    data: {
      slug,
      customerName,
      customerEmail,
      customerPhone,
      title,
      description: descriptionWithPreference,
      serviceSlug,
      city,
      province,
      postalCode,
      budgetMin,
      budgetMax,
      urgency: urgency as "EMERGENCY" | "WITHIN_48_HOURS" | "THIS_WEEK" | "FLEXIBLE",
      consentToShare,
      status: "OPEN",
    },
    select: {
      slug: true,
      status: true,
      createdAt: true,
    },
  });

  return NextResponse.json(
    {
      ok: true,
      project: job,
      message: "Project request received. Matching can now begin.",
    },
    { status: 201 }
  );
}
