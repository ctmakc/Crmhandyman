import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSessionUser } from "@/lib/session";
import { SERVICE_CATALOG } from "@/lib/marketplace-config";

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function optionalMoney(value: unknown) {
  if (value === "" || value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 10_000_000 ? parsed : null;
}

function publicOwner(tenant: {
  businessName: string;
  contractorProfile: {
    slug: string;
    displayName: string;
    verificationStatus: string;
  } | null;
}) {
  return {
    businessName: tenant.contractorProfile?.displayName || tenant.businessName,
    profileSlug: tenant.contractorProfile?.slug ?? null,
    verificationStatus: tenant.contractorProfile?.verificationStatus ?? "UNVERIFIED",
  };
}

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getAppSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const now = new Date();
  const [tenant, eligibleLeads, availableRows, ownedRows, claimRows] = await Promise.all([
    prisma.tenant.findUnique({
      where: { id: user.tenantId },
      select: {
        id: true,
        businessName: true,
        plan: true,
        contractorProfile: {
          select: { slug: true, displayName: true, profileStatus: true },
        },
      },
    }),
    prisma.lead.findMany({
      where: {
        tenantId: user.tenantId,
        status: { in: ["NEW", "CONTACTED", "VERIFIED"] },
        leadListing: null,
      },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        name: true,
        city: true,
        jobType: true,
        status: true,
        createdAt: true,
      },
    }),
    prisma.leadListing.findMany({
      where: {
        tenantId: { not: user.tenantId },
        status: "OPEN",
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      include: {
        tenant: {
          select: {
            businessName: true,
            contractorProfile: {
              select: { slug: true, displayName: true, verificationStatus: true },
            },
          },
        },
        claims: {
          select: { tenantId: true, status: true },
        },
        _count: { select: { claims: true } },
      },
      orderBy: [{ exclusive: "desc" }, { createdAt: "desc" }],
      take: 100,
    }),
    prisma.leadListing.findMany({
      where: { tenantId: user.tenantId },
      include: {
        lead: {
          select: {
            id: true,
            name: true,
            phone: true,
            email: true,
            address: true,
            city: true,
            jobType: true,
            status: true,
          },
        },
        claims: {
          include: {
            claimedBy: {
              select: {
                businessName: true,
                contractorProfile: {
                  select: { slug: true, displayName: true, verificationStatus: true },
                },
              },
            },
          },
          orderBy: { createdAt: "desc" },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.leadClaim.findMany({
      where: { tenantId: user.tenantId },
      include: {
        listing: {
          include: {
            tenant: {
              select: {
                businessName: true,
                contractorProfile: {
                  select: { slug: true, displayName: true, verificationStatus: true },
                },
              },
            },
            lead: {
              select: {
                name: true,
                phone: true,
                email: true,
                address: true,
                city: true,
                jobType: true,
                notes: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);

  const available = availableRows
    .filter((row) => {
      if (row.exclusive && row.claims.some((claim) => claim.status !== "REJECTED")) return false;
      const activeClaims = row.claims.filter((claim) => claim.status !== "REJECTED").length;
      return activeClaims < row.maxClaims || row.claims.some((claim) => claim.tenantId === user.tenantId);
    })
    .map((row) => ({
      id: row.id,
      title: row.title,
      summary: row.summary,
      serviceSlug: row.serviceSlug,
      city: row.city,
      province: row.province,
      budgetMin: row.budgetMin,
      budgetMax: row.budgetMax,
      exclusive: row.exclusive,
      maxClaims: row.maxClaims,
      claimCount: row._count.claims,
      contactUnlockPriceCredits: row.contactUnlockPriceCredits,
      expiresAt: row.expiresAt,
      createdAt: row.createdAt,
      owner: publicOwner(row.tenant),
      myClaim: row.claims.find((claim) => claim.tenantId === user.tenantId) ?? null,
    }));

  const owned = ownedRows.map((row) => ({
    id: row.id,
    title: row.title,
    summary: row.summary,
    serviceSlug: row.serviceSlug,
    city: row.city,
    province: row.province,
    budgetMin: row.budgetMin,
    budgetMax: row.budgetMax,
    status: row.status,
    exclusive: row.exclusive,
    maxClaims: row.maxClaims,
    contactUnlockPriceCredits: row.contactUnlockPriceCredits,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
    lead: row.lead,
    claims: row.claims.map((claim) => ({
      id: claim.id,
      status: claim.status,
      creditsPaid: claim.creditsPaid,
      createdAt: claim.createdAt,
      claimant: publicOwner(claim.claimedBy),
    })),
  }));

  const myClaims = claimRows.map((claim) => {
    const contactVisible = ["CONTACT_UNLOCKED", "WON", "LOST", "REFUNDED"].includes(claim.status);
    return {
      id: claim.id,
      status: claim.status,
      creditsPaid: claim.creditsPaid,
      createdAt: claim.createdAt,
      listing: {
        id: claim.listing.id,
        title: claim.listing.title,
        summary: claim.listing.summary,
        serviceSlug: claim.listing.serviceSlug,
        city: claim.listing.city,
        province: claim.listing.province,
        budgetMin: claim.listing.budgetMin,
        budgetMax: claim.listing.budgetMax,
        contactUnlockPriceCredits: claim.listing.contactUnlockPriceCredits,
        owner: publicOwner(claim.listing.tenant),
        contact: contactVisible
          ? {
              name: claim.listing.lead.name,
              phone: claim.listing.lead.phone,
              email: claim.listing.lead.email,
              address: claim.listing.lead.address,
              notes: claim.listing.lead.notes,
            }
          : null,
      },
    };
  });

  return NextResponse.json({
    tenant,
    eligibleLeads,
    available,
    owned,
    myClaims,
  });
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

  const leadId = cleanText(body.leadId, 100);
  const title = cleanText(body.title, 140);
  const summary = cleanText(body.summary, 2000);
  const serviceSlug = cleanText(body.serviceSlug, 80);
  const city = cleanText(body.city, 100);
  const province = cleanText(body.province, 100);
  const exclusive = body.exclusive === true;
  const maxClaims = exclusive ? 1 : Math.min(Math.max(Number(body.maxClaims) || 3, 1), 5);
  const contactUnlockPriceCredits = Math.min(
    Math.max(Math.round(Number(body.contactUnlockPriceCredits) || 1), 0),
    25
  );
  const expiresInDays = Math.min(Math.max(Math.round(Number(body.expiresInDays) || 7), 1), 30);
  const budgetMin = optionalMoney(body.budgetMin);
  const budgetMax = optionalMoney(body.budgetMax);

  const errors: string[] = [];
  if (!leadId) errors.push("Select a lead.");
  if (title.length < 5) errors.push("Title must contain at least 5 characters.");
  if (summary.length < 20) errors.push("Summary must contain at least 20 characters.");
  if (!SERVICE_CATALOG.some((service) => service.slug === serviceSlug)) {
    errors.push("Select a supported service.");
  }
  if (city.length < 2) errors.push("City is required.");
  if (province.length < 2) errors.push("Province is required.");
  if (budgetMin != null && budgetMax != null && budgetMin > budgetMax) {
    errors.push("Minimum budget cannot exceed maximum budget.");
  }

  if (errors.length > 0) {
    return NextResponse.json({ error: "Validation failed.", details: errors }, { status: 422 });
  }

  const lead = await prisma.lead.findFirst({
    where: {
      id: leadId,
      tenantId: user.tenantId,
      status: { in: ["NEW", "CONTACTED", "VERIFIED"] },
    },
    include: { leadListing: { select: { id: true } } },
  });

  if (!lead) return NextResponse.json({ error: "Lead not found." }, { status: 404 });
  if (lead.leadListing) {
    return NextResponse.json({ error: "This lead is already listed in the network." }, { status: 409 });
  }

  const listing = await prisma.leadListing.create({
    data: {
      tenantId: user.tenantId,
      leadId: lead.id,
      title,
      summary,
      serviceSlug,
      city,
      province,
      budgetMin,
      budgetMax,
      exclusive,
      maxClaims,
      contactUnlockPriceCredits,
      expiresAt: new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000),
    },
  });

  return NextResponse.json({ listing }, { status: 201 });
}
