import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SERVICE_CATALOG, slugify } from "@/lib/marketplace";

function text(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function optionalText(value: unknown, maxLength: number): string | null {
  return text(value, maxLength) || null;
}

function optionalNumber(value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): number | null {
  if (value === "" || value == null) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) return null;
  return parsed;
}

function sessionTenantId(session: Awaited<ReturnType<typeof getServerSession>>) {
  return (session?.user as { tenantId?: string } | undefined)?.tenantId;
}

export async function GET() {
  const session = await getServerSession(authOptions);
  const tenantId = sessionTenantId(session);
  if (!session || !tenantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { businessName: true, slug: true },
  });
  const profile = await prisma.contractorProfile.findUnique({
    where: { tenantId },
    include: {
      services: { orderBy: [{ isPrimary: "desc" }, { name: "asc" }] },
      serviceAreas: { orderBy: [{ province: "asc" }, { city: "asc" }] },
    },
  });

  return NextResponse.json({ tenant, profile });
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const tenantId = sessionTenantId(session);
  if (
    !session ||
    !tenantId ||
    (session.user as { role?: string } | undefined)?.role !== "ADMIN"
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) return NextResponse.json({ error: "Tenant not found." }, { status: 404 });

  const displayName = text(body.displayName, 140) || tenant.businessName;
  const slug = slugify(text(body.slug, 100) || displayName);
  const city = text(body.city, 100);
  const province = text(body.province, 100);
  const description = optionalText(body.description, 5000);
  const headline = optionalText(body.headline, 180);
  const phone = optionalText(body.phone, 40);
  const publicEmail = optionalText(body.publicEmail, 160);
  const website = optionalText(body.website, 300);
  const postalCode = optionalText(body.postalCode, 16);
  const languages = text(body.languages, 300) || "English";
  const serviceRadiusKm = Math.round(optionalNumber(body.serviceRadiusKm, 1, 500) ?? 30);
  const yearsInBusiness = optionalNumber(body.yearsInBusiness, 0, 150);
  const minimumJobValue = optionalNumber(body.minimumJobValue, 0, 10_000_000);
  const emergencyService = body.emergencyService === true;
  const requestedStatus = body.profileStatus === "PUBLISHED" ? "PUBLISHED" : "DRAFT";

  const serviceSlugs = Array.isArray(body.serviceSlugs)
    ? Array.from(
        new Set(
          body.serviceSlugs
            .map((value) => text(value, 80))
            .filter((value) => SERVICE_CATALOG.some((service) => service.slug === value))
        )
      )
    : [];

  const rawAreas = Array.isArray(body.serviceAreas) ? body.serviceAreas : [];
  const serviceAreas = rawAreas
    .map((area) => {
      if (!area || typeof area !== "object") return null;
      const record = area as Record<string, unknown>;
      const areaCity = text(record.city, 100);
      const areaProvince = text(record.province, 100);
      if (!areaCity || !areaProvince) return null;
      return {
        city: areaCity,
        province: areaProvince,
        postalPrefix: optionalText(record.postalPrefix, 8),
        radiusKm: Math.round(optionalNumber(record.radiusKm, 1, 500) ?? serviceRadiusKm),
      };
    })
    .filter(
      (
        area
      ): area is {
        city: string;
        province: string;
        postalPrefix: string | null;
        radiusKm: number;
      } => Boolean(area)
    );

  const errors: string[] = [];
  if (!displayName) errors.push("Business name is required.");
  if (!slug) errors.push("A valid public slug is required.");
  if (!city) errors.push("City is required.");
  if (!province) errors.push("Province is required.");
  if (requestedStatus === "PUBLISHED" && serviceSlugs.length === 0) {
    errors.push("Select at least one service before publishing.");
  }

  if (errors.length > 0) {
    return NextResponse.json({ error: "Validation failed.", details: errors }, { status: 422 });
  }

  const slugOwner = await prisma.contractorProfile.findUnique({
    where: { slug },
    select: { tenantId: true },
  });
  if (slugOwner && slugOwner.tenantId !== tenantId) {
    return NextResponse.json({ error: "This public slug is already in use." }, { status: 409 });
  }

  const selectedServices = SERVICE_CATALOG.filter((service) =>
    serviceSlugs.includes(service.slug)
  );

  const profile = await prisma.$transaction(async (tx) => {
    const saved = await tx.contractorProfile.upsert({
      where: { tenantId },
      update: {
        slug,
        displayName,
        headline,
        description,
        phone,
        publicEmail,
        website,
        city,
        province,
        postalCode,
        serviceRadiusKm,
        yearsInBusiness: yearsInBusiness == null ? null : Math.round(yearsInBusiness),
        emergencyService,
        minimumJobValue,
        languages,
        profileStatus: requestedStatus,
        seoTitle: `${displayName} | Contractor in ${city}, ${province}`,
        seoDescription: description?.slice(0, 155) || headline?.slice(0, 155) || null,
      },
      create: {
        tenantId,
        slug,
        displayName,
        headline,
        description,
        phone,
        publicEmail,
        website,
        city,
        province,
        postalCode,
        serviceRadiusKm,
        yearsInBusiness: yearsInBusiness == null ? null : Math.round(yearsInBusiness),
        emergencyService,
        minimumJobValue,
        languages,
        profileStatus: requestedStatus,
        seoTitle: `${displayName} | Contractor in ${city}, ${province}`,
        seoDescription: description?.slice(0, 155) || headline?.slice(0, 155) || null,
      },
    });

    await tx.contractorService.deleteMany({ where: { profileId: saved.id } });
    if (selectedServices.length > 0) {
      await tx.contractorService.createMany({
        data: selectedServices.map((service, index) => ({
          profileId: saved.id,
          slug: service.slug,
          name: service.name,
          category: service.category,
          isPrimary: index === 0,
        })),
      });
    }

    await tx.serviceArea.deleteMany({ where: { profileId: saved.id } });
    if (serviceAreas.length > 0) {
      await tx.serviceArea.createMany({
        data: serviceAreas.map((area) => ({ profileId: saved.id, ...area })),
      });
    }

    return tx.contractorProfile.findUnique({
      where: { id: saved.id },
      include: { services: true, serviceAreas: true },
    });
  });

  return NextResponse.json({ profile });
}
