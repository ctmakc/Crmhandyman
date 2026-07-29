import { NextRequest, NextResponse } from "next/server";
import { getPublicWorkers } from "@/lib/workers";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const workers = await getPublicWorkers({
    query: params.get("q") || undefined,
    city: params.get("city") || undefined,
    province: params.get("province") || undefined,
    skill: params.get("skill") || undefined,
    employmentType: params.get("employmentType") || undefined,
    limit: Number(params.get("limit") || 100),
  });

  return NextResponse.json(
    {
      data: workers,
      meta: {
        count: workers.length,
        privacy: "Private email, phone, full legal name and resume URLs are excluded.",
      },
    },
    {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    }
  );
}
