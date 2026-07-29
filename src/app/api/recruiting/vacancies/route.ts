import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSessionUser } from "@/lib/session";
import { SERVICE_CATALOG, slugify } from "@/lib/marketplace-config";

const EMPLOYMENT_TYPES = new Set(["FULL_TIME", "PART_TIME", "CONTRACT", "TEMPORARY", "GIG", "SUBCONTRACT"]);
const COMPENSATION_UNITS = new Set(["HOUR", "DAY", "PROJECT", "YEAR"]);
const VACANCY_STATUSES = new Set(["DRAFT", "PUBLISHED"]);

function text(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function money(value: unknown) {
  if (value === "" || value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 10_000_000 ? parsed : null;
}

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getAppSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await prisma.contractorProfile.findUnique({
    where: { tenantId: user.tenantId },
    include: {
      services: { orderBy: [{ isPrimary: "desc" }, { name: "asc" }] },
      vacancies: { orderBy: { createdAt: "desc" } },
    },
  });

  return NextResponse.json({ profile });
}

export async function POST(req: NextRequest) {
  const user = await getAppSessionUser();
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const profile = await prisma.contractorProfile.findUnique({
    where: { tenantId: user.tenantId },
    include: { services: { select: { slug: true } } },
  });
  if (!profile) {
    return NextResponse.json({ error: "Create a contractor profile before posting jobs." }, { status: 409 });
  }

  const title = text(body.title, 140);
  const description = text(body.description, 6000);
  const serviceSlug = text(body.serviceSlug, 80);
  const employmentType = text(body.employmentType, 40).toUpperCase();
  const city = text(body.city, 100);
  const province = text(body.province, 100);
  const compensationUnit = text(body.compensationUnit, 20).toUpperCase() || "HOUR";
  const compensationMin = money(body.compensationMin);
  const compensationMax = money(body.compensationMax);
  const isRemote = body.isRemote === true;
  const status = text(body.status, 20).toUpperCase() || "DRAFT";
  const validThroughRaw = text(body.validThrough, 40);
  const validThrough = validThroughRaw ? new Date(validThroughRaw) : null;

  const errors: string[] = [];
  if (title.length < 5) errors.push("Title must contain at least 5 characters.");
  if (description.length < 40) errors.push("Description must contain at least 40 characters.");
  if (!SERVICE_CATALOG.some((service) => service.slug === serviceSlug)) errors.push("Select a supported trade.");
  if (!profile.services.some((service) => service.slug === serviceSlug)) errors.push("The selected trade must be enabled on your directory profile.");
  if (!EMPLOYMENT_TYPES.has(employmentType)) errors.push("Invalid employment type.");
  if (!COMPENSATION_UNITS.has(compensationUnit)) errors.push("Invalid compensation unit.");
  if (!VACANCY_STATUSES.has(status)) errors.push("Invalid initial status.");
  if (!city && !isRemote) errors.push("City is required for on-site work.");
  if (!province && !isRemote) errors.push("Province is required for on-site work.");
  if (compensationMin != null && compensationMax != null && compensationMin > compensationMax) {
    errors.push("Minimum compensation cannot exceed maximum compensation.");
  }
  if (validThrough && Number.isNaN(validThrough.getTime())) errors.push("Invalid closing date.");
  if (status === "PUBLISHED" && profile.profileStatus !== "PUBLISHED") {
    errors.push("Publish the contractor profile before publishing a vacancy.");
  }

  if (errors.length > 0) {
    return NextResponse.json({ error: "Validation failed.", details: errors }, { status: 422 });
  }

  const slug = `${slugify(`${title}-${city || "remote"}`)}-${Date.now().toString(36)}`;
  const vacancy = await prisma.vacancy.create({
    data: {
      profileId: profile.id,
      slug,
      title,
      description,
      serviceSlug,
      employmentType: employmentType as "FULL_TIME" | "PART_TIME" | "CONTRACT" | "TEMPORARY" | "GIG" | "SUBCONTRACT",
      city: city || "Remote",
      province: province || "Canada",
      compensationMin,
      compensationMax,
      compensationUnit: compensationUnit as "HOUR" | "DAY" | "PROJECT" | "YEAR",
      isRemote,
      status: status as "DRAFT" | "PUBLISHED",
      validThrough,
    },
  });

  return NextResponse.json({ vacancy }, { status: 201 });
}
