import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getAppSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const params = req.nextUrl.searchParams;
  const query = (params.get("q") ?? "").trim().toLowerCase();
  const status = (params.get("status") ?? "").trim().toUpperCase();
  const vacancyId = (params.get("vacancyId") ?? "").trim();

  const applications = await prisma.lead.findMany({
    where: {
      tenantId: user.tenantId,
      source: "JOB_BOARD",
      ...(status && ["NEW", "CONTACTED", "VERIFIED", "REJECTED", "CONVERTED"].includes(status)
        ? { status: status as "NEW" | "CONTACTED" | "VERIFIED" | "REJECTED" | "CONVERTED" }
        : {}),
      ...(vacancyId ? { sourceLeadId: { startsWith: `vacancy:${vacancyId}:` } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 250,
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      city: true,
      address: true,
      jobType: true,
      notes: true,
      status: true,
      sourceLeadId: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  const filtered = query
    ? applications.filter((application) =>
        [
          application.name,
          application.email,
          application.phone,
          application.city,
          application.address,
          application.jobType,
          application.notes,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(query)
      )
    : applications;

  const vacancyIds = Array.from(
    new Set(
      filtered
        .map((application) => application.sourceLeadId?.split(":")[1])
        .filter((value): value is string => Boolean(value))
    )
  );

  const vacancies = vacancyIds.length
    ? await prisma.vacancy.findMany({
        where: {
          id: { in: vacancyIds },
          profile: { tenantId: user.tenantId },
        },
        select: { id: true, slug: true, title: true, status: true },
      })
    : [];
  const vacancyMap = new Map(vacancies.map((vacancy) => [vacancy.id, vacancy]));

  return NextResponse.json({
    data: filtered.map((application) => {
      const applicationVacancyId = application.sourceLeadId?.split(":")[1] ?? null;
      return {
        ...application,
        vacancy: applicationVacancyId ? vacancyMap.get(applicationVacancyId) ?? null : null,
      };
    }),
    meta: {
      count: filtered.length,
      statuses: {
        new: filtered.filter((item) => item.status === "NEW").length,
        contacted: filtered.filter((item) => item.status === "CONTACTED").length,
        shortlisted: filtered.filter((item) => item.status === "VERIFIED").length,
        rejected: filtered.filter((item) => item.status === "REJECTED").length,
      },
    },
  });
}
