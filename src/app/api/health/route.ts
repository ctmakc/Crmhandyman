import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const started = Date.now();
  try {
    await prisma.$queryRawUnsafe("SELECT 1");
    return NextResponse.json(
      {
        status: "ok",
        database: "ok",
        uptimeSeconds: Math.floor(process.uptime()),
        version: process.env.APP_VERSION ?? "dev",
        latencyMs: Date.now() - started,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("HEALTHCHECK_DATABASE_FAILED", error);
    return NextResponse.json(
      { status: "degraded", database: "error", latencyMs: Date.now() - started },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
