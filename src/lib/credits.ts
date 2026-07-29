import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const INITIAL_NETWORK_CREDITS = 10;

export class InsufficientCreditsError extends Error {
  constructor(public readonly required: number, public readonly available: number) {
    super(`Insufficient credits: ${available} available, ${required} required.`);
    this.name = "InsufficientCreditsError";
  }
}

export async function ensureCreditWallet(
  tx: Prisma.TransactionClient,
  tenantId: string,
  initialBalance = INITIAL_NETWORK_CREDITS
) {
  const existing = await tx.creditWallet.findUnique({ where: { tenantId } });
  if (existing) return existing;

  const wallet = await tx.creditWallet.create({
    data: {
      tenantId,
      balance: initialBalance,
      lifetimePurchased: 0,
      lifetimeSpent: 0,
    },
  });

  if (initialBalance > 0) {
    await tx.creditTransaction.create({
      data: {
        walletId: wallet.id,
        type: "WELCOME",
        amount: initialBalance,
        balanceAfter: initialBalance,
        referenceType: "TENANT",
        referenceId: tenantId,
        description: "Initial contractor network credits",
        idempotencyKey: `welcome:${tenantId}`,
      },
    });
  }

  return wallet;
}

export async function debitCredits(
  tx: Prisma.TransactionClient,
  input: {
    tenantId: string;
    amount: number;
    idempotencyKey: string;
    referenceType: string;
    referenceId: string;
    description: string;
  }
) {
  if (!Number.isInteger(input.amount) || input.amount < 0) {
    throw new Error("Credit debit amount must be a non-negative integer.");
  }

  const wallet = await ensureCreditWallet(tx, input.tenantId);
  const existing = await tx.creditTransaction.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
  });
  if (existing) {
    return {
      transaction: existing,
      wallet: await tx.creditWallet.findUniqueOrThrow({ where: { id: wallet.id } }),
      replayed: true,
    };
  }

  if (input.amount === 0) {
    const transaction = await tx.creditTransaction.create({
      data: {
        walletId: wallet.id,
        type: "LEAD_UNLOCK",
        amount: 0,
        balanceAfter: wallet.balance,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
        description: input.description,
        idempotencyKey: input.idempotencyKey,
      },
    });
    return { transaction, wallet, replayed: false };
  }

  const result = await tx.creditWallet.updateMany({
    where: {
      id: wallet.id,
      balance: { gte: input.amount },
    },
    data: {
      balance: { decrement: input.amount },
      lifetimeSpent: { increment: input.amount },
    },
  });

  if (result.count !== 1) {
    const current = await tx.creditWallet.findUniqueOrThrow({ where: { id: wallet.id } });
    throw new InsufficientCreditsError(input.amount, current.balance);
  }

  const updatedWallet = await tx.creditWallet.findUniqueOrThrow({ where: { id: wallet.id } });
  const transaction = await tx.creditTransaction.create({
    data: {
      walletId: wallet.id,
      type: "LEAD_UNLOCK",
      amount: -input.amount,
      balanceAfter: updatedWallet.balance,
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      description: input.description,
      idempotencyKey: input.idempotencyKey,
    },
  });

  return { transaction, wallet: updatedWallet, replayed: false };
}

export async function refundCredits(
  tx: Prisma.TransactionClient,
  input: {
    tenantId: string;
    amount: number;
    idempotencyKey: string;
    referenceType: string;
    referenceId: string;
    description: string;
  }
) {
  if (!Number.isInteger(input.amount) || input.amount < 0) {
    throw new Error("Credit refund amount must be a non-negative integer.");
  }

  const wallet = await ensureCreditWallet(tx, input.tenantId);
  const existing = await tx.creditTransaction.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
  });
  if (existing) {
    return {
      transaction: existing,
      wallet: await tx.creditWallet.findUniqueOrThrow({ where: { id: wallet.id } }),
      replayed: true,
    };
  }

  const updatedWallet =
    input.amount === 0
      ? wallet
      : await tx.creditWallet.update({
          where: { id: wallet.id },
          data: { balance: { increment: input.amount } },
        });

  const transaction = await tx.creditTransaction.create({
    data: {
      walletId: wallet.id,
      type: "REFUND",
      amount: input.amount,
      balanceAfter: updatedWallet.balance,
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      description: input.description,
      idempotencyKey: input.idempotencyKey,
    },
  });

  return { transaction, wallet: updatedWallet, replayed: false };
}

export async function getCreditWalletSnapshot(tenantId: string) {
  return prisma.$transaction(async (tx) => {
    const wallet = await ensureCreditWallet(tx, tenantId);
    const transactions = await tx.creditTransaction.findMany({
      where: { walletId: wallet.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return { wallet, transactions };
  });
}
