import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for the lead-claim smoke test.");

const prisma = new PrismaClient({
  adapter: new PrismaBetterSqlite3({ url: databaseUrl }),
});

function triggerMessage(error) {
  return (
    error?.meta?.driverAdapterError?.cause?.originalMessage ||
    error?.cause?.originalMessage ||
    String(error)
  );
}

async function expectTrigger(promise, expected) {
  await assert.rejects(promise, (error) =>
    String(triggerMessage(error)).toLowerCase().includes(expected.toLowerCase())
  );
}

async function createTenant(label, suffix) {
  return prisma.tenant.create({
    data: {
      slug: `ci-${label}-${suffix}`,
      businessName: `CI ${label}`,
      ownerEmail: `${label}-${suffix}@example.test`,
    },
  });
}

async function main() {
  const suffix = randomUUID().slice(0, 8);
  const [owner, claimantA, claimantB, claimantC] = await Promise.all([
    createTenant("claim-owner", suffix),
    createTenant("claim-a", suffix),
    createTenant("claim-b", suffix),
    createTenant("claim-c", suffix),
  ]);

  const lead = await prisma.lead.create({
    data: {
      tenantId: owner.id,
      name: "Claim capacity customer",
      city: "Ottawa",
      source: "MANUAL",
    },
  });
  const listing = await prisma.leadListing.create({
    data: {
      tenantId: owner.id,
      leadId: lead.id,
      title: "Claim capacity listing",
      summary: "A listing used to validate database-enforced claim capacity.",
      serviceSlug: "general-handyman",
      city: "Ottawa",
      province: "Ontario",
      maxClaims: 2,
      status: "OPEN",
    },
  });

  await expectTrigger(
    prisma.leadClaim.create({
      data: { listingId: listing.id, tenantId: owner.id, status: "REQUESTED" },
    }),
    "cannot claim its own"
  );

  await prisma.leadClaim.create({
    data: { listingId: listing.id, tenantId: claimantA.id, status: "REQUESTED" },
  });
  await prisma.leadClaim.create({
    data: { listingId: listing.id, tenantId: claimantB.id, status: "APPROVED" },
  });

  await expectTrigger(
    prisma.leadClaim.create({
      data: { listingId: listing.id, tenantId: claimantC.id, status: "REQUESTED" },
    }),
    "claim limit"
  );

  await prisma.leadClaim.updateMany({
    where: { listingId: listing.id, tenantId: claimantA.id },
    data: { status: "REJECTED" },
  });
  await prisma.leadClaim.create({
    data: { listingId: listing.id, tenantId: claimantC.id, status: "REQUESTED" },
  });

  const closedLead = await prisma.lead.create({
    data: {
      tenantId: owner.id,
      name: "Closed claim customer",
      city: "Toronto",
      source: "MANUAL",
    },
  });
  const closedListing = await prisma.leadListing.create({
    data: {
      tenantId: owner.id,
      leadId: closedLead.id,
      title: "Closed claim listing",
      summary: "A closed listing used to validate claim insertion protection.",
      serviceSlug: "general-handyman",
      city: "Toronto",
      province: "Ontario",
      status: "CLOSED",
    },
  });

  await expectTrigger(
    prisma.leadClaim.create({
      data: { listingId: closedListing.id, tenantId: claimantA.id, status: "REQUESTED" },
    }),
    "not open"
  );

  console.log("Lead-claim smoke checks passed: own-listing, capacity release and closed listing.");
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
