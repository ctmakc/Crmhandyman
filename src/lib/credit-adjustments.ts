import "server-only";

import type { CreditTransactionType, Prisma } from "@prisma/client";
import { ensureCreditWallet, InsufficientCreditsError } from "@/lib/credits";

export async function adjustCredits(
  tx: Prisma.TransactionClient,
  input: {
    tenantId: string;
    amount: number;
    type: Extract<CreditTransactionType, "CREDIT_PURCHASE" | "ADJUSTMENT">;
    idempotencyKey: string;
    description: string;
    referenceType?: string;
    referenceId?: string;
  }
) {
  if (!Number.isInteger(input.amount) || input.amount === 0 || Math.abs(input.amount) > 100_000) {
    throw new Error("Credit adjustment must be a non-zero integer within the allowed range.");
  }
  if (input.type === "CREDIT_PURCHASE" && input.amount < 0) {
    throw new Error("Credit purchases cannot have a negative amount.");
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

  if (input.amount < 0) {
    const result = await tx.creditWallet.updateMany({
      where: {
        id: wallet.id,
        balance: { gte: Math.abs(input.amount) },
      },
      data: {
        balance: { decrement: Math.abs(input.amount) },
      },
    });
    if (result.count !== 1) {
      const current = await tx.creditWallet.findUniqueOrThrow({ where: { id: wallet.id } });
      throw new InsufficientCreditsError(Math.abs(input.amount), current.balance);
    }
  } else {
    await tx.creditWallet.update({
      where: { id: wallet.id },
      data: {
        balance: { increment: input.amount },
        ...(input.type === "CREDIT_PURCHASE"
          ? { lifetimePurchased: { increment: input.amount } }
          : {}),
      },
    });
  }

  const updatedWallet = await tx.creditWallet.findUniqueOrThrow({ where: { id: wallet.id } });
  const transaction = await tx.creditTransaction.create({
    data: {
      walletId: wallet.id,
      type: input.type,
      amount: input.amount,
      balanceAfter: updatedWallet.balance,
      referenceType: input.referenceType ?? "ADMIN",
      referenceId: input.referenceId ?? input.tenantId,
      description: input.description,
      idempotencyKey: input.idempotencyKey,
    },
  });

  return { transaction, wallet: updatedWallet, replayed: false };
}
