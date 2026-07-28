import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { seedDemoData } from "@/lib/demo-seed";
import { slugify } from "@/lib/marketplace-config";

const signupLog = new Map<string, number[]>();
const WINDOW_MS = 60 * 60 * 1000;
const MAX_SIGNUPS_PER_HOUR = 3;

function rateLimited(ip: string) {
  const now = Date.now();
  const recent = (signupLog.get(ip) ?? []).filter((timestamp) => now - timestamp < WINDOW_MS);
  if (recent.length >= MAX_SIGNUPS_PER_HOUR) {
    signupLog.set(ip, recent);
    return true;
  }
  recent.push(now);
  signupLog.set(ip, recent);
  return false;
}

async function uniqueSlug(base: string) {
  const normalized = slugify(base).slice(0, 40) || "contractor";
  let slug = normalized;
  let suffix = 1;

  while (await prisma.tenant.findUnique({ where: { slug }, select: { id: true } })) {
    slug = `${normalized.slice(0, 34)}-${suffix++}`;
  }
  return slug;
}

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";

  if (rateLimited(ip)) {
    return NextResponse.json(
      { error: "Too many registration attempts. Please try again later." },
      { status: 429 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  if (typeof body.companyWebsite === "string" && body.companyWebsite.trim()) {
    return NextResponse.json({ ok: true }, { status: 202 });
  }

  const businessName = typeof body.businessName === "string" ? body.businessName.trim().slice(0, 120) : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase().slice(0, 160) : "";
  const password = typeof body.password === "string" ? body.password : "";
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const errors: string[] = [];
  if (businessName.length < 2) errors.push("Business name must be at least 2 characters.");
  if (!validEmail) errors.push("A valid email is required.");
  if (password.length < 8 || password.length > 128) {
    errors.push("Password must contain between 8 and 128 characters.");
  }

  if (errors.length > 0) {
    return NextResponse.json({ error: "Validation failed.", details: errors }, { status: 422 });
  }

  const hashedPassword = await bcrypt.hash(password, 12);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const slug = await uniqueSlug(attempt === 0 ? businessName : `${businessName}-${Date.now()}`);

    try {
      const result = await prisma.$transaction(async (tx) => {
        const tenant = await tx.tenant.create({
          data: {
            slug,
            businessName,
            ownerEmail: email,
            plan: "DEMO",
            expiresAt,
          },
        });

        const admin = await tx.user.create({
          data: {
            tenantId: tenant.id,
            name: businessName,
            email,
            password: hashedPassword,
            role: "ADMIN",
          },
        });

        return { tenant, admin };
      });

      try {
        await seedDemoData(result.tenant.id, result.admin.id);
      } catch (seedError) {
        console.error("Unable to seed demo data", seedError);
      }

      return NextResponse.json(
        {
          slug: result.tenant.slug,
          tenantId: result.tenant.id,
          plan: result.tenant.plan,
          expiresAt: result.tenant.expiresAt,
        },
        { status: 201 }
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        continue;
      }
      console.error("Registration failed", error);
      return NextResponse.json({ error: "Registration failed." }, { status: 500 });
    }
  }

  return NextResponse.json({ error: "Unable to allocate a workspace slug." }, { status: 409 });
}
