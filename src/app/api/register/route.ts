import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { seedDemoData } from "@/lib/demo-seed";
import { consumeRateLimit, rateLimitHeaders, requestIp } from "@/lib/rate-limit";
import { writeAuditEvent } from "@/lib/audit";

const RESERVED_SLUGS = new Set([
  "www", "app", "api", "admin", "mail", "smtp", "support", "billing", "status", "demo", "register", "login",
]);

function slugify(str: string) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

async function uniqueSlug(businessName: string) {
  const normalized = slugify(businessName);
  const base = !normalized || RESERVED_SLUGS.has(normalized) ? `business-${randomUUID().slice(0, 8)}` : normalized;
  if (!(await prisma.tenant.findUnique({ where: { slug: base }, select: { id: true } }))) return base;

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const candidate = `${base.slice(0, 31)}-${randomUUID().slice(0, 8)}`;
    if (!(await prisma.tenant.findUnique({ where: { slug: candidate }, select: { id: true } }))) return candidate;
  }
  throw new Error("Could not allocate tenant slug");
}

export async function POST(req: NextRequest) {
  let limit;
  try {
    limit = await consumeRateLimit({
      scope: "public-register",
      identifier: requestIp(req),
      limit: 5,
      windowMs: 60 * 60 * 1000,
    });
  } catch (error) {
    console.error("REGISTER_RATE_LIMIT_FAILED", error);
    return NextResponse.json({ error: "Registration controls unavailable" }, { status: 503 });
  }
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many registration attempts" }, { status: 429, headers: rateLimitHeaders(limit) });
  }

  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  const businessName = String(body?.businessName ?? "").trim();
  const email = String(body?.email ?? "").trim().toLowerCase();
  const password = String(body?.password ?? "");

  if (!businessName || businessName.length > 160 || !email || !email.includes("@") || password.length < 10) {
    return NextResponse.json(
      { error: "Valid businessName/email and a password of at least 10 characters are required" },
      { status: 400, headers: rateLimitHeaders(limit) }
    );
  }

  const slug = await uniqueSlug(businessName);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const hashedPassword = await bcrypt.hash(password, 12);

  let tenant: { id: string; slug: string; plan: "DEMO" | "PAID" };
  let admin: { id: string };
  try {
    ({ tenant, admin } = await prisma.$transaction(async (tx) => {
      // Public callers can never activate a paid plan. Paid state belongs to a
      // verified billing/admin path, not to a JSON field supplied by signup.
      const createdTenant = await tx.tenant.create({
        data: {
          slug,
          businessName,
          ownerEmail: email,
          plan: "DEMO",
          expiresAt,
        },
        select: { id: true, slug: true, plan: true },
      });
      const createdAdmin = await tx.user.create({
        data: {
          tenantId: createdTenant.id,
          name: businessName,
          email,
          password: hashedPassword,
          role: "ADMIN",
        },
        select: { id: true },
      });
      return { tenant: createdTenant, admin: createdAdmin };
    }));
  } catch (error) {
    console.error("REGISTER_CREATE_FAILED", error);
    return NextResponse.json({ error: "Could not create account" }, { status: 409, headers: rateLimitHeaders(limit) });
  }

  // Demo fixtures are non-authoritative convenience data. A seed failure must not
  // strand the owner outside an account that was already created transactionally.
  try {
    await seedDemoData(tenant.id, admin.id);
  } catch (error) {
    console.error("REGISTER_DEMO_SEED_FAILED", error);
  }

  await writeAuditEvent({
    tenantId: tenant.id,
    actorEmail: email,
    action: "tenant.registered",
    entityType: "tenant",
    entityId: tenant.id,
    summary: "Demo tenant registered",
    metadata: { slug: tenant.slug },
  });

  return NextResponse.json(
    { slug: tenant.slug, tenantId: tenant.id, plan: tenant.plan },
    { status: 201, headers: rateLimitHeaders(limit) }
  );
}
