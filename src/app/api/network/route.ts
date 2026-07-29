import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { recordAuditEvent, requestIp } from "@/lib/audit";
import { getCreditWalletSnapshot } from "@/lib/credits";
import { SERVICE_CATALOG } from "@/lib/marketplace-config";
import { prisma } from "@/lib/prisma";
import { getAppSessionUser } from "@/lib/session";

const ACTIVE_CLAIM_STATUSES = ["REQUESTED", "APPROVED", "CONTACT_UNLOCKED", "WON", "LOST"] as const;

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
    profileStatus: string;
  } | null;
}) {
  const published = tenant.contractorProfile?.profileStatus === "PUBLISHED";
  return {
    businessName: published
      ? tenant.contractorProfile?.displayName || tenant.businessName
      : tenant.businessName,
    profileSlug: published ? tenant.contractorProfile?.slug ?? null : null,
    verificationStatus: published
      ? tenant.contractorProfile?.verificationStatus ?? "UNVERIFIED"
      : "UNVERIFIED",
  };
}

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getAppSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const now = new Date();
  const [tenant, eligibleLeads, availableRows, ownedRows, claimRows, walletSnapshot] =
    await Promise.all([
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
          project: null,
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
                select: {
                  slug: true,
                  displayName: true,
                  verificationStatus: true,
                  profileStatus: true,
                },
              },
            },
          },
          claims: {
            select: { tenantId: true, status: true },
          },
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
                    select: {
                      slug: true,
                      displayName: true,
                      verificationStatus: true,
                      profileStatus: true,
                    },
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
                    select: {
                      slug: true,
                      displayName: true,
                      verificationStatus: true,
                      profileStatus: true,
                    },
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
      getCreditWalletSnapshot(user.tenantId),
    ]);

  const available = availableRows
    .filter((row) => {
      const activeClaims = row.claims.filter((claim) =>
        ACTIVE_CLAIM_STATUSES.includes(
          claim.status as (typeof ACTIVE_CLAIM_STATUSES)[number]
        )
      );
      if (row.exclusive && activeClaims.length > 0) {
        return activeClaims.some((claim) => claim.tenantId === user.tenantId);
      }
      return (
        activeClaims.length < row.maxClaims ||
        activeClaims.some((claim) => claim.tenantId === user.tenantId)
      );
    })
    .map((row) => {
      const activeClaims = row.claims.filter((claim) =>
        ACTIVE_CLAIM_STATUSES.includes(
          claim.status as (typeof ACTIVE_CLAIM_STATUSES)[number]
        )
      );
      return {
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
        claimCount: activeClaims.length,
        contactUnlockPriceCredits: row.contactUnlockPriceCredits,
        expiresAt: row.expiresAt,
        createdAt: row.createdAt,
        owner: publicOwner(row.tenant),
        myClaim: row.claims.find((claim) => claim.tenantId === user.tenantId) ?? null,
      };
    });

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
    const contactVisible = ["CONTACT_UNLOCKED", "WON", "LOST", "REFUNDED"].includes(
      claim.status
    );
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
    wallet: {
      balance: walletSnapshot.wallet.balance,
      lifetimePurchased: walletSnapshot.wallet.lifetimePurchased,
      lifetimeSpent: walletSnapshot.wallet.lifetimeSpent,
      transactions: walletSnapshot.transactions.map((transaction) => ({
        id: transaction.id,
        type: transaction.type,
        amount: transaction.amount,
        balanceAfter: transaction.balanceAfter,
        description: transaction.description,
        referenceType: transaction.referenceType,
        referenceId: transaction.referenceId,
        createdAt: transaction.createdAt,
      })),
    },
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
  const maxClaimsRaw = Number(body.maxClaims ?? (exclusive ? 1 : 3));
  const maxClaims = exclusive
    ? 1
    : Math.min(Math.max(Math.round(maxClaimsRaw || 3), 1), 5);
  const contactUnlockPriceCredits = Math.min(
    Math.max(Math.round(Number(body.contactUnlockPriceCredits) || 1), 0),
    25
  );
  const expiresInDays = Math.min(
    Math.max(Math.round(Number(body.expiresInDays) || 7), 1),
    30
  );
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

  try {
    const listing = await prisma.$transaction(async (tx) => {
      const lead = await tx.lead.findFirst({
        where: {
          id: leadId,
          tenantId: user.tenantId,
          status: { in: ["NEW", "CONTACTED", "VERIFIED"] },
          leadListing: null,
          project: null,
        },
        select: { id: true, name: true },
      });

      if (!lead) throw new Error("LEAD_UNAVAILABLE");

      const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);
      const created = await tx.leadListing.create({
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
          expiresAt,
          status: "OPEN",
        },
      });

      await recordAuditEvent(
        {
          actor: { type: "USER", id: user.id, email: user.email },
          tenantId: user.tenantId,
          action: "LEAD_LISTING_PUBLISHED",
          targetType: "LEAD_LISTING",
          targetId: created.id,
          metadata: {
            leadId: lead.id,
            leadName: lead.name,
            serviceSlug,
            city,
            province,
            budgetMin,
            budgetMax,
            exclusive,
            maxClaims,
            contactUnlockPriceCredits,
            expiresAt: expiresAt.toISOString(),
          },
          ipAddress: requestIp(req.headers),
        },
        tx
      );

      return created;
    });

    return NextResponse.json({ listing }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json(
        { error: "This lead is already listed in the network." },
        { status: 409 }
      );
    }
    if (error instanceof Error && error.message === "LEAD_UNAVAILABLE") {
      return NextResponse.json(
        { error: "This lead cannot be published or is already assigned." },
        { status: 409 }
      );
    }
    console.error("Lead listing publication failed", error);
    return NextResponse.json({ error: "Unable to publish lead listing." }, { status: 500 });
  }
}
