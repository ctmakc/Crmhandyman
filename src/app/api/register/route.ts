import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { seedDemoData } from "@/lib/demo-seed";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { RESERVED_LABELS } from "@/lib/tenant-slug";

const TRIAL_DAYS = Number(process.env.TRIAL_DAYS || 7);

const SUPER_ADMIN_EMAILS = (process.env.SUPER_ADMIN_EMAILS || "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

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
  // Reserved labels are infrastructure hostnames (crm, www, api…): a workspace minted
  // under one would be unreachable by subdomain and would shadow the front door.
  while (RESERVED_LABELS.has(slug) || (await prisma.tenant.findUnique({ where: { slug } }))) {
    slug = `${slugify(base)}-${++i}`;
  }
  return slug;
}

/**
 * Self-serve signup, with a switch.
 *
 * On a real domain the open form is how a stranger walks in and opens a workspace on
 * the contractor's own host — it happened during review, and the operator had no way to
 * turn it off. Production is closed unless SELF_SERVE_SIGNUP says otherwise; local
 * development stays open so the register flow can be worked on and tested.
 */
function signupOpen() {
  const raw = (process.env.SELF_SERVE_SIGNUP || "").trim().toLowerCase();
  if (raw) return raw === "on" || raw === "true" || raw === "1";
  return process.env.NODE_ENV !== "production";
}

export async function POST(req: NextRequest) {
  if (!signupOpen())
    return NextResponse.json(
      { error: "Signups are closed here. Ask the operator to open a workspace for you." },
      { status: 403 }
    );

  const limited = await rateLimit(`register:${clientIp(req)}`, 5, 60 * 60 * 1000);
  if (!limited.ok) {
    return NextResponse.json(
      { error: "Too many signups from this address — try again later" },
      { status: 429, headers: { "Retry-After": String(limited.retryAfter) } }
    );
  }

  const body = await req.json();
  const { businessName, email, password } = body;

  if (!businessName || !email || !password) {
    return NextResponse.json({ error: "Fill in the business name, the email and the password" }, { status: 400 });
  }

  const normalizedEmail = String(email).trim().toLowerCase();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return NextResponse.json({ error: "That email address is not valid" }, { status: 400 });
  }

  if (String(password).length < 10) {
    return NextResponse.json(
      { error: "Password must be at least 10 characters" },
      { status: 400 }
    );
  }

  // Platform operators are recognised by email alone. Letting anyone open a workspace on
  // one of those addresses handed them the super-admin panel over every tenant.
  if (SUPER_ADMIN_EMAILS.includes(normalizedEmail)) {
    return NextResponse.json({ error: "That email cannot be used to sign up" }, { status: 400 });
  }

  const slug = await uniqueSlug(businessName);

  // Signup only ever opens a trial. Paid plans are set by the operator or by a payment
  // webhook — self-service «plan: paid» in the request body was a free upgrade.
  const expiresAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);

  const hashedPassword = await bcrypt.hash(password, 12);

  const tenant = await prisma.tenant.create({
    data: {
      slug,
      businessName,
      ownerEmail: normalizedEmail,
      plan: "DEMO",
      expiresAt,
    },
  });

  const admin = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      name: businessName,
      email: normalizedEmail,
      password: hashedPassword,
      role: "ADMIN",
    },
  });

  const sample = await seedDemoData(tenant.id, admin.id);

  // The sample worker's password is shown once here and never recoverable afterwards.
  return NextResponse.json(
    { slug, plan: tenant.plan, expiresAt, sampleWorker: sample },
    { status: 201 }
  );
}
