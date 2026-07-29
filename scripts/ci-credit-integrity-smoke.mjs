import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for the credit integrity smoke test.");

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

async function main() {
  const suffix = randomUUID().slice(0, 8);
  const tenant = await prisma.tenant.create({
    data: {
      slug: `ci-credit-${suffix}`,
      businessName: "CI Credit Integrity",
      ownerEmail: `credit-${suffix}@example.test`,
    },
  });

  await expectTrigger(
    prisma.creditWallet.create({
      data: { tenantId: tenant.id, balance: -1 },
    }),
    "cannot be negative"
  );

  const wallet = await prisma.creditWallet.create({
    data: { tenantId: tenant.id, balance: 10 },
  });
  await prisma.creditTransaction.create({
    data: {
      walletId: wallet.id,
      type: "WELCOME",
      amount: 10,
      balanceAfter: 10,
      description: "CI welcome credits",
      idempotencyKey: `ci-credit-welcome:${suffix}`,
    },
  });

  await expectTrigger(
    prisma.creditWallet.update({
      where: { id: wallet.id },
      data: { balance: -1 },
    }),
    "cannot be negative"
  );
  await expectTrigger(
    prisma.creditTransaction.create({
      data: {
        walletId: wallet.id,
        type: "ADJUSTMENT",
        amount: 1,
        balanceAfter: 11,
        description: "Mismatched balance",
        idempotencyKey: `ci-credit-mismatch:${suffix}`,
      },
    }),
    "must match wallet balance"
  );
  await expectTrigger(
    prisma.creditTransaction.create({
      data: {
        walletId: wallet.id,
        type: "LEAD_UNLOCK",
        amount: 1,
        balanceAfter: 10,
        description: "Invalid positive unlock",
        idempotencyKey: `ci-credit-positive-unlock:${suffix}`,
      },
    }),
    "cannot have a positive amount"
  );

  const debitResult = await prisma.creditWallet.updateMany({
    where: { id: wallet.id, balance: { gte: 3 } },
    data: {
      balance: { decrement: 3 },
      lifetimeSpent: { increment: 3 },
    },
  });
  assert.equal(debitResult.count, 1);
  await prisma.creditTransaction.create({
    data: {
      walletId: wallet.id,
      type: "LEAD_UNLOCK",
      amount: -3,
      balanceAfter: 7,
      description: "CI lead unlock",
      idempotencyKey: `ci-credit-debit:${suffix}`,
    },
  });

  const insufficientResult = await prisma.creditWallet.updateMany({
    where: { id: wallet.id, balance: { gte: 8 } },
    data: { balance: { decrement: 8 } },
  });
  assert.equal(insufficientResult.count, 0);

  await prisma.creditWallet.update({
    where: { id: wallet.id },
    data: { balance: { increment: 3 } },
  });
  await prisma.creditTransaction.create({
    data: {
      walletId: wallet.id,
      type: "REFUND",
      amount: 3,
      balanceAfter: 10,
      description: "CI lead refund",
      idempotencyKey: `ci-credit-refund:${suffix}`,
    },
  });

  const [finalWallet, transactions] = await Promise.all([
    prisma.creditWallet.findUniqueOrThrow({ where: { id: wallet.id } }),
    prisma.creditTransaction.findMany({ where: { walletId: wallet.id } }),
  ]);
  assert.equal(finalWallet.balance, 10);
  assert.equal(finalWallet.lifetimeSpent, 3);
  assert.equal(
    transactions.reduce((sum, transaction) => sum + transaction.amount, 0),
    finalWallet.balance
  );

  console.log("Credit integrity smoke checks passed: non-negative balance, debit, refund and ledger consistency.");
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
