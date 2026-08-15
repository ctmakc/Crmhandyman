import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { listAuditEvents } from "@/lib/audit";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const user = session.user as any;
  if (user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const limit = Number(searchParams.get("limit") ?? "100");
  const rows = await listAuditEvents({
    tenantId: user.tenantId as string,
    limit: Number.isFinite(limit) ? limit : 100,
    entityType: searchParams.get("entityType"),
    entityId: searchParams.get("entityId"),
  });

  return NextResponse.json(rows, { headers: { "Cache-Control": "no-store" } });
}
