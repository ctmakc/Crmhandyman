import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sessionTenant } from "@/lib/session";

/**
 * "This address has been here before."
 *
 * Before a tech drives out, the one thing worth knowing is what was done here last
 * time and what iron is in the basement. Matching is by client when the job is linked,
 * and falls back to the street line for jobs created before Wave 2.
 */
export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "You are signed out — sign in again" }, { status: 401 });
  const { tenantId } = sessionTenant(session);

  const project = await prisma.project.findFirst({
    where: { id: params.id, tenantId },
    select: { id: true, clientId: true, address: true },
  });
  if (!project) return NextResponse.json({ error: "That record is gone — it was deleted, or the link points at another workspace" }, { status: 404 });

  const street = (project.address || "").split(",")[0].trim();

  const previous = await prisma.project.findMany({
    where: {
      tenantId,
      id: { not: project.id },
      ...(project.clientId
        ? { clientId: project.clientId }
        : street
          ? { address: { contains: street } }
          : { id: "never" }),
    },
    orderBy: [{ completedDate: "desc" }, { scheduledDate: "desc" }],
    take: 8,
    select: {
      id: true,
      title: true,
      jobType: true,
      status: true,
      scheduledDate: true,
      completedDate: true,
    },
  });

  const equipment = project.clientId
    ? await prisma.equipment.findMany({
        where: { tenantId, clientId: project.clientId },
        orderBy: { installedAt: "desc" },
      })
    : [];

  return NextResponse.json({ previous, equipment, clientId: project.clientId });
}
