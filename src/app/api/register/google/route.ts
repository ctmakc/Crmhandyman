import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { uniqueSlug } from "@/lib/workspace-slug";

export const dynamic = "force-dynamic";

const SUPER_ADMIN_EMAILS = (process.env.SUPER_ADMIN_EMAILS || "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

/**
 * Finish a Google sign-up by naming the workspace.
 *
 * The visitor is already through Google — the session carries a googleSub and a verified
 * email but no desk. This turns that into a PENDING workspace with the visitor as its
 * ADMIN, then leaves it for an operator to approve (scripts/approve-tenant.ts). Nothing
 * here opens the doors: a self-serve workspace never becomes usable without a human.
 *
 * The password column is filled with a random hash no one holds — this account signs in
 * through Google, and an unusable password is safer than a nullable one.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const u = session?.user as any;

  if (!u?.needsWorkspace || !u.googleSub || !u.email) {
    return NextResponse.json({ error: "No Google sign-up is in progress" }, { status: 401 });
  }

  const email = String(u.email).trim().toLowerCase();
  if (SUPER_ADMIN_EMAILS.includes(email)) {
    return NextResponse.json({ error: "That account cannot open a workspace here" }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  const businessName = typeof body?.businessName === "string" ? body.businessName.trim() : "";
  if (businessName.length < 2) {
    return NextResponse.json({ error: "Enter your business name" }, { status: 400 });
  }

  // A second finish for the same Google account must not mint a second workspace: if the
  // link already exists, point the visitor at whatever state it is in.
  const existing = await prisma.user.findUnique({
    where: { googleSub: u.googleSub },
    include: { tenant: { select: { slug: true, status: true } } },
  });
  if (existing) {
    return NextResponse.json(
      { slug: existing.tenant.slug, status: existing.tenant.status, alreadyLinked: true },
      { status: 200 }
    );
  }

  const slug = await uniqueSlug(businessName);
  const unusablePassword = await bcrypt.hash(crypto.randomBytes(24).toString("hex"), 12);

  const tenant = await prisma.tenant.create({
    data: {
      slug,
      businessName,
      ownerEmail: email,
      plan: "DEMO",
      status: "PENDING",
    },
  });

  await prisma.user.create({
    data: {
      tenantId: tenant.id,
      name: (u.name as string) || businessName,
      email,
      password: unusablePassword,
      googleSub: u.googleSub,
      role: "ADMIN",
    },
  });

  return NextResponse.json({ slug, status: "PENDING" }, { status: 201 });
}
