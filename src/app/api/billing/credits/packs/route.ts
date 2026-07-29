import { NextResponse } from "next/server";
import { getCreditPacks, publicCreditPack } from "@/lib/credit-packs";
import { getAppSessionUser } from "@/lib/session";

export async function GET() {
  const user = await getAppSessionUser();
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const packs = getCreditPacks().map(publicCreditPack);
  return NextResponse.json({
    data: packs,
    meta: {
      count: packs.length,
      configured: packs.length > 0,
      currencies: Array.from(new Set(packs.map((pack) => pack.currency))),
    },
  });
}
