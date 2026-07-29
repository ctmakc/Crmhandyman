import { NextRequest, NextResponse } from "next/server";
import { adjustCredits } from "@/lib/credit-adjustments";
import { InsufficientCreditsError } from "@/lib/credits";
import { prisma } from "@/lib/prisma";
import { getSuperAdminUser } from "@/lib/super-admin";

function text(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export async function GET() {
  const admin = await getSuperAdminUser();
  if (!admin) return NextResponse.json({ error: "Super-admin access required." }, { status: 403 });

  const tenants = await prisma.tenant.findMany({
    select: {
      id: true,
      slug: true,
      businessName: true,
      plan: true,
      creditWallet: {
        select: {
          balance: true,
          lifetimePurchased: true,
          lifetimeSpent: true,
          updatedAt: true,
          transactions: {
            orderBy: { createdAt: "desc" },
            take: 5,
            select: {
              id: true,
              type: true,
              amount: true,
              balanceAfter: true,
              description: true,
              idempotencyKey: true,
              createdAt: true,
            },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 250,
  });

  return NextResponse.json({ data: tenants });
}

export async function POST(req: NextRequest) {
  const admin = await getSuperAdminUser();
  if (!admin) return NextResponse.json({ error: "Super-admin access required." }, { status: 403 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const tenantId = text(body.tenantId, 100);
  const amount = Number(body.amount);
  const type = text(body.type, 40).toUpperCase();
  const description = text(body.description, 500);
  const idempotencyKey = text(body.idempotencyKey, 200);
  const referenceId = text(body.referenceId, 200) || tenantId;

  const errors: string[] = [];
  if (!tenantId) errors.push("Tenant is required.");
  if (!Number.isInteger(amount) || amount === 0 || Math.abs(amount) > 100_000) {
    errors.push("Amount must be a non-zero integer between -100000 and 100000.");
  }
  if (!new Set(["CREDIT_PURCHASE", "ADJUSTMENT"]).has(type)) {
    errors.push("Type must be CREDIT_PURCHASE or ADJUSTMENT.");
  }
  if (description.length < 5) errors.push("Description must contain at least 5 characters.");
  if (idempotencyKey.length < 8) errors.push("A stable idempotency key is required.");
  if (type === "CREDIT_PURCHASE" && amount < 0) {
    errors.push("Credit purchases cannot be negative.");
  }

  if (errors.length > 0) {
    return NextResponse.json({ error: "Validation failed.", details: errors }, { status: 422 });
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, businessName: true },
  });
  if (!tenant) return NextResponse.json({ error: "Tenant not found." }, { status: 404 });

  try {
    const result = await prisma.$transaction((tx) =>
      adjustCredits(tx, {
        tenantId: tenant.id,
        amount,
        type: type as "CREDIT_PURCHASE" | "ADJUSTMENT",
        idempotencyKey,
        description,
        referenceType: type === "CREDIT_PURCHASE" ? "PAYMENT" : "ADMIN",
        referenceId,
      })
    );

    return NextResponse.json({
      tenant: { id: tenant.id, businessName: tenant.businessName },
      wallet: result.wallet,
      transaction: result.transaction,
      replayed: result.replayed,
      adjustedBy: admin.email,
    });
  } catch (error) {
    if (error instanceof InsufficientCreditsError) {
      return NextResponse.json(
        {
          error: "Adjustment would make the balance negative.",
          required: error.required,
          available: error.available,
        },
        { status: 409 }
      );
    }
    console.error("Credit adjustment failed", error);
    return NextResponse.json({ error: "Unable to adjust credits." }, { status: 500 });
  }
}
