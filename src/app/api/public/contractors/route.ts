import { NextRequest, NextResponse } from "next/server";
import { getPublicContractors } from "@/lib/marketplace";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const contractors = await getPublicContractors({
    query: params.get("q") || undefined,
    city: params.get("city") || undefined,
    province: params.get("province") || undefined,
    service: params.get("service") || undefined,
    limit: Number(params.get("limit") || 100),
  });

  return NextResponse.json(
    {
      data: contractors,
      meta: {
        count: contractors.length,
        filters: {
          q: params.get("q"),
          city: params.get("city"),
          province: params.get("province"),
          service: params.get("service"),
        },
      },
    },
    {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    }
  );
}
