import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { seedDemoData } from "@/lib/demo-seed";

function slugify(str: string) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

async function uniqueSlug(base: string) {
  let slug = slugify(base);
  let i = 0;
  while (await prisma.tenant.findUnique({ where: { slug } })) {
    slug = `${slugify(base)}-${++i}`;
  }
  return slug;
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { businessName, email, password, plan } = body;

  if (!businessName || !email || !password) {
    return NextResponse.json({ error: "businessName, email, and password are required" }, { status: 400 });
  }

  const slug = await uniqueSlug(businessName);
  const isPaid = plan === "paid";

  // Demo: expires in 7 days
  const expiresAt = isPaid ? null : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const hashedPassword = await bcrypt.hash(password, 12);

  const tenant = await prisma.tenant.create({
    data: {
      slug,
      businessName,
      ownerEmail: email,
      plan: isPaid ? "PAID" : "DEMO",
      expiresAt,
    },
  });

  const admin = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      name: businessName,
      email,
      password: hashedPassword,
      role: "ADMIN",
    },
  });

  // Seed demo data for all new accounts
  await seedDemoData(tenant.id, admin.id);

  return NextResponse.json({ slug, tenantId: tenant.id, plan: tenant.plan }, { status: 201 });
}
