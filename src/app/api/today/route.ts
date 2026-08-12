import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sessionTenant } from "@/lib/session";

/**
 * Today's stops for field mode.
 *
 * A worker sees their own board; an admin sees the whole day. Unfinished work from
 * previous days is carried forward — a job that was not closed yesterday is still a
 * stop today, and hiding it is how jobs get lost.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { tenantId, id: userId, role } = sessionTenant(session);
  const isAdmin = role === "ADMIN";

  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);

  const projects = await prisma.project.findMany({
    where: {
      tenantId,
      status: { in: ["SCHEDULED", "IN_PROGRESS", "COMPLETED"] },
      scheduledDate: { lte: endOfToday },
      ...(isAdmin ? {} : { assignedToId: userId }),
    },
    include: {
      client: { select: { equipment: true } },
    },
    orderBy: { scheduledDate: "asc" },
  });

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const relevant = projects.filter((p) => {
    if (!p.scheduledDate) return false;
    // Today's work, plus anything older that was never closed out.
    if (p.scheduledDate >= startOfToday) return true;
    return p.status !== "COMPLETED";
  });

  return NextResponse.json(
    relevant.map((p) => ({
      id: p.id,
      title: p.title,
      clientName: p.clientName,
      address: p.address,
      phone: p.phone,
      jobType: p.jobType,
      status: p.status,
      scheduledDate: p.scheduledDate,
      description: p.description,
      assignedToId: p.assignedToId,
      equipment: (p.client?.equipment ?? []).map((e) => ({
        kind: e.kind,
        brand: e.brand,
        model: e.model,
        serial: e.serial,
      })),
    }))
  );
}
