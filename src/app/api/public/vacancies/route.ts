import { NextRequest, NextResponse } from "next/server";
import { getPublicVacancies } from "@/lib/marketplace";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const vacancies = await getPublicVacancies({
    city: params.get("city") || undefined,
    province: params.get("province") || undefined,
    service: params.get("service") || undefined,
    limit: Number(params.get("limit") || 100),
  });

  return NextResponse.json(
    {
      data: vacancies,
      meta: { count: vacancies.length },
    },
    {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    }
  );
}
