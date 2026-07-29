import { NextRequest, NextResponse } from "next/server";
import { validCoordinates } from "@/lib/geo";
import { findNearbyContractors } from "@/lib/nearby-contractors";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const coordinates = validCoordinates(params.get("latitude"), params.get("longitude"));
  const radiusRaw = Number(params.get("radiusKm") || 50);
  const radiusKm = Number.isFinite(radiusRaw) ? Math.min(Math.max(radiusRaw, 1), 250) : 50;

  if (!coordinates && !params.get("postalCode") && !params.get("city")) {
    return NextResponse.json(
      { error: "Provide coordinates, a Canadian postal code or a city." },
      { status: 422 }
    );
  }

  const matches = await findNearbyContractors({
    coordinates,
    postalCode: params.get("postalCode") || undefined,
    city: params.get("city") || undefined,
    province: params.get("province") || undefined,
    service: params.get("service") || undefined,
    radiusKm,
    limit: Number(params.get("limit") || 100),
  });

  return NextResponse.json(
    {
      data: matches.map((match) => ({
        ...match.contractor,
        distanceKm: match.distanceKm,
        matchReason: match.matchReason,
      })),
      meta: {
        count: matches.length,
        radiusKm,
        origin: coordinates
          ? { type: "COORDINATES", ...coordinates }
          : params.get("postalCode")
            ? { type: "POSTAL", postalCode: params.get("postalCode") }
            : {
                type: "CITY",
                city: params.get("city"),
                province: params.get("province"),
              },
      },
    },
    {
      headers: {
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120",
      },
    }
  );
}
