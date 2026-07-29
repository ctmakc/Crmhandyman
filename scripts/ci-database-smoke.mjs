import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for the database smoke test.");

const prisma = new PrismaClient({
  adapter: new PrismaBetterSqlite3({ url: databaseUrl }),
});

async function main() {
  const suffix = randomUUID().slice(0, 8);
  const owner = await prisma.tenant.create({
    data: {
      slug: `ci-owner-${suffix}`,
      businessName: "CI Owner",
      ownerEmail: `owner-${suffix}@example.test`,
    },
  });
  const claimantA = await prisma.tenant.create({
    data: {
      slug: `ci-claimant-a-${suffix}`,
      businessName: "CI Claimant A",
      ownerEmail: `claimant-a-${suffix}@example.test`,
    },
  });
  const claimantB = await prisma.tenant.create({
    data: {
      slug: `ci-claimant-b-${suffix}`,
      businessName: "CI Claimant B",
      ownerEmail: `claimant-b-${suffix}@example.test`,
    },
  });

  const wallet = await prisma.creditWallet.create({
    data: { tenantId: claimantA.id, balance: 10 },
  });
  await prisma.creditTransaction.create({
    data: {
      walletId: wallet.id,
      type: "WELCOME",
      amount: 10,
      balanceAfter: 10,
      description: "CI welcome credits",
      idempotencyKey: `ci-welcome:${claimantA.id}`,
    },
  });

  await assert.rejects(
    prisma.creditTransaction.create({
      data: {
        walletId: wallet.id,
        type: "WELCOME",
        amount: 10,
        balanceAfter: 20,
        description: "Duplicate CI welcome credits",
        idempotencyKey: `ci-welcome:${claimantA.id}`,
      },
    }),
    /Unique constraint|unique constraint/i
  );

  const bucketKey = `ci-rate-limit:${suffix}`;
  const now = Date.now();
  const expiry = now + 60_000;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const rows = await prisma.$queryRawUnsafe(
      `INSERT INTO RateLimitBucket ("key", "count", "windowStart", "expiresAt", "updatedAt")
       VALUES (?, 1, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT("key") DO UPDATE SET
         "count" = CASE WHEN RateLimitBucket."expiresAt" <= ? THEN 1 ELSE RateLimitBucket."count" + 1 END,
         "windowStart" = CASE WHEN RateLimitBucket."expiresAt" <= ? THEN ? ELSE RateLimitBucket."windowStart" END,
         "expiresAt" = CASE WHEN RateLimitBucket."expiresAt" <= ? THEN ? ELSE RateLimitBucket."expiresAt" END,
         "updatedAt" = CURRENT_TIMESTAMP
       RETURNING "count", "expiresAt"`,
      bucketKey,
      now,
      expiry,
      now,
      now,
      now,
      now,
      expiry
    );
    assert.equal(Number(rows[0].count), attempt);
    assert.equal(Number(rows[0].expiresAt), expiry);
  }

  const emailKey = `ci-email:${suffix}`;
  const emailId = randomUUID();
  const emailInsert = `INSERT OR IGNORE INTO EmailOutbox (
    "id", "idempotencyKey", "toEmail", "subject", "textBody", "status",
    "attempts", "maxAttempts", "nextAttemptAt", "createdAt", "updatedAt"
  ) VALUES (?, ?, ?, ?, ?, 'PENDING', 0, 8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`;
  const firstEmailInsert = await prisma.$executeRawUnsafe(
    emailInsert,
    emailId,
    emailKey,
    `outbox-${suffix}@example.test`,
    "CI outbox delivery",
    "CI outbox message"
  );
  const duplicateEmailInsert = await prisma.$executeRawUnsafe(
    emailInsert,
    randomUUID(),
    emailKey,
    `other-${suffix}@example.test`,
    "Duplicate CI outbox delivery",
    "This row must be ignored"
  );
  assert.equal(firstEmailInsert, 1);
  assert.equal(duplicateEmailInsert, 0);

  const outboxRows = await prisma.$queryRawUnsafe(
    `SELECT "id", "status", "attempts", "maxAttempts" FROM EmailOutbox WHERE "idempotencyKey" = ?`,
    emailKey
  );
  assert.equal(outboxRows.length, 1);
  assert.equal(outboxRows[0].id, emailId);
  assert.equal(outboxRows[0].status, "PENDING");
  assert.equal(Number(outboxRows[0].attempts), 0);
  assert.equal(Number(outboxRows[0].maxAttempts), 8);

  const lead = await prisma.lead.create({
    data: {
      tenantId: owner.id,
      name: "CI Test Customer",
      city: "Ottawa",
      source: "MANUAL",
    },
  });
  const listing = await prisma.leadListing.create({
    data: {
      tenantId: owner.id,
      leadId: lead.id,
      title: "CI Test Lead",
      summary: "Database smoke test lead listing with enough detail.",
      serviceSlug: "general-handyman",
      city: "Ottawa",
      province: "Ontario",
    },
  });
  const claimA = await prisma.leadClaim.create({
    data: { listingId: listing.id, tenantId: claimantA.id, status: "CONTACT_UNLOCKED" },
  });
  const claimB = await prisma.leadClaim.create({
    data: { listingId: listing.id, tenantId: claimantB.id, status: "APPROVED" },
  });

  const disputeId = randomUUID();
  const createdAt = new Date();
  const slaDueAt = new Date(createdAt.getTime() + 72 * 60 * 60 * 1000);
  await prisma.$executeRawUnsafe(
    `INSERT INTO NetworkDispute (
      id, claimId, openedByTenantId, respondentTenantId, category, summary,
      evidenceUrls, status, slaDueAt, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, '[]', 'OPEN', ?, ?, ?)`,
    disputeId,
    claimA.id,
    claimantA.id,
    owner.id,
    "INVALID_CONTACT",
    "CI dispute validates the one-open-case trigger.",
    slaDueAt,
    createdAt,
    createdAt
  );

  await assert.rejects(
    prisma.$executeRawUnsafe(
      `INSERT INTO NetworkDispute (
        id, claimId, openedByTenantId, respondentTenantId, category, summary,
        evidenceUrls, status, slaDueAt, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, '[]', 'OPEN', ?, ?, ?)`,
      randomUUID(),
      claimB.id,
      claimantB.id,
      owner.id,
      "OTHER",
      "A second unresolved dispute for this listing must fail.",
      slaDueAt,
      createdAt,
      createdAt
    ),
    /unresolved dispute already exists/i
  );

  console.log(
    "Database smoke checks passed: ledger idempotency, rate limits, email outbox and dispute trigger."
  );
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
