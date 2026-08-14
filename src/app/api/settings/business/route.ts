import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/guard";
import { record } from "@/lib/audit";

const FIELDS = [
  "businessName",
  "businessAddress",
  "businessPhone",
  "businessEmail",
  "hstNumber",
  "paymentInstructions",
] as const;

/** The action log is a screen the owner reads out loud in an argument with a client. */
const FIELD_WORD: Record<string, string> = {
  businessName: "name",
  businessAddress: "address",
  businessPhone: "phone",
  businessEmail: "email",
  hstNumber: "HST number",
  paymentInstructions: "payment instructions",
};

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const { tenantId } = guard.identity;

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: Object.fromEntries(FIELDS.map((f) => [f, true])) as Record<string, true>,
  });
  if (!tenant) return NextResponse.json({ error: "That record is gone — it was deleted, or the link points at another workspace" }, { status: 404 });

  return NextResponse.json(tenant);
}

export async function PUT(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const { tenantId, id: actorId } = guard.identity;

  const body = await req.json();

  const data: Record<string, string | null> = {};
  for (const field of FIELDS) {
    if (body[field] === undefined) continue;
    const value = String(body[field] ?? "").trim();
    // An emptied field clears the line off the paper rather than printing a blank label.
    data[field] = value.length > 0 ? value : null;
  }

  // The wordmark is the one line the document cannot render without.
  if (data.businessName === null) {
    return NextResponse.json({ error: "Business name is required" }, { status: 400 });
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing changed on this form" }, { status: 400 });
  }

  const tenant = await prisma.tenant.update({
    where: { id: tenantId },
    data,
    select: Object.fromEntries(FIELDS.map((f) => [f, true])) as Record<string, true>,
  });

  await record({
    tenantId,
    actor: { id: actorId },
    action: "tenant.details",
    entity: "Tenant",
    entityId: tenantId,
    summary: `Updated business details (${Object.keys(data).map((k) => FIELD_WORD[k] ?? k).join(", ")})`,
  });

  return NextResponse.json(tenant);
}
