import "server-only";

import { prisma } from "@/lib/prisma";

export type PublicWorkerSkill = {
  slug: string;
  name: string;
  yearsExperience: number | null;
};

export type PublicWorker = {
  id: string;
  slug: string;
  publicName: string;
  city: string;
  province: string;
  country: string;
  headline: string;
  summary: string;
  yearsExperience: number | null;
  employmentTypes: string[];
  hourlyRateMin: number | null;
  hourlyRateMax: number | null;
  hasVehicle: boolean;
  hasTools: boolean;
  languages: string;
  availability: string | null;
  verificationStatus: string;
  skills: PublicWorkerSkill[];
  updatedAt: Date;
};

function normalize(value: string | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function toPublicWorker(row: {
  id: string;
  slug: string;
  publicName: string;
  city: string;
  province: string;
  country: string;
  headline: string;
  summary: string;
  yearsExperience: number | null;
  employmentTypes: string;
  hourlyRateMin: number | null;
  hourlyRateMax: number | null;
  hasVehicle: boolean;
  hasTools: boolean;
  languages: string;
  availability: string | null;
  verificationStatus: string;
  updatedAt: Date;
  skills: PublicWorkerSkill[];
}): PublicWorker {
  return {
    id: row.id,
    slug: row.slug,
    publicName: row.publicName,
    city: row.city,
    province: row.province,
    country: row.country,
    headline: row.headline,
    summary: row.summary,
    yearsExperience: row.yearsExperience,
    employmentTypes: row.employmentTypes.split(",").map((value) => value.trim()).filter(Boolean),
    hourlyRateMin: row.hourlyRateMin,
    hourlyRateMax: row.hourlyRateMax,
    hasVehicle: row.hasVehicle,
    hasTools: row.hasTools,
    languages: row.languages,
    availability: row.availability,
    verificationStatus: row.verificationStatus,
    skills: row.skills,
    updatedAt: row.updatedAt,
  };
}

export async function getPublicWorkers(
  filters: {
    query?: string;
    city?: string;
    province?: string;
    skill?: string;
    employmentType?: string;
    limit?: number;
  } = {}
): Promise<PublicWorker[]> {
  try {
    const rows = await prisma.workerProfile.findMany({
      where: {
        profileStatus: "PUBLISHED",
        consentToPublic: true,
        verificationStatus: { not: "SUSPENDED" },
      },
      select: {
        id: true,
        slug: true,
        publicName: true,
        city: true,
        province: true,
        country: true,
        headline: true,
        summary: true,
        yearsExperience: true,
        employmentTypes: true,
        hourlyRateMin: true,
        hourlyRateMax: true,
        hasVehicle: true,
        hasTools: true,
        languages: true,
        availability: true,
        verificationStatus: true,
        updatedAt: true,
        skills: {
          select: {
            slug: true,
            name: true,
            yearsExperience: true,
          },
          orderBy: { name: "asc" },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: Math.min(Math.max(filters.limit ?? 250, 1), 250),
    });

    const query = normalize(filters.query);
    const city = normalize(filters.city);
    const province = normalize(filters.province);
    const skill = normalize(filters.skill);
    const employmentType = normalize(filters.employmentType).toUpperCase();

    return rows
      .filter((row) => {
        const haystack = [
          row.publicName,
          row.headline,
          row.summary,
          row.city,
          row.province,
          row.languages,
          row.availability,
          ...row.skills.map((item) => `${item.name} ${item.slug}`),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return (
          (!query || haystack.includes(query)) &&
          (!city || normalize(row.city) === city) &&
          (!province || normalize(row.province) === province) &&
          (!skill ||
            row.skills.some(
              (item) => normalize(item.slug) === skill || normalize(item.name).includes(skill)
            )) &&
          (!employmentType ||
            row.employmentTypes
              .split(",")
              .map((value) => value.trim().toUpperCase())
              .includes(employmentType))
        );
      })
      .sort((a, b) => {
        const verificationDelta =
          Number(b.verificationStatus === "VERIFIED") -
          Number(a.verificationStatus === "VERIFIED");
        if (verificationDelta !== 0) return verificationDelta;
        return b.updatedAt.getTime() - a.updatedAt.getTime();
      })
      .map(toPublicWorker);
  } catch (error) {
    console.error("Unable to load public worker profiles", error);
    return [];
  }
}

export async function getPublicWorker(slug: string): Promise<PublicWorker | null> {
  try {
    const row = await prisma.workerProfile.findFirst({
      where: {
        slug,
        profileStatus: "PUBLISHED",
        consentToPublic: true,
        verificationStatus: { not: "SUSPENDED" },
      },
      select: {
        id: true,
        slug: true,
        publicName: true,
        city: true,
        province: true,
        country: true,
        headline: true,
        summary: true,
        yearsExperience: true,
        employmentTypes: true,
        hourlyRateMin: true,
        hourlyRateMax: true,
        hasVehicle: true,
        hasTools: true,
        languages: true,
        availability: true,
        verificationStatus: true,
        updatedAt: true,
        skills: {
          select: {
            slug: true,
            name: true,
            yearsExperience: true,
          },
          orderBy: { name: "asc" },
        },
      },
    });

    return row ? toPublicWorker(row) : null;
  } catch (error) {
    console.error("Unable to load public worker profile", error);
    return null;
  }
}

export function formatWorkerRate(worker: PublicWorker) {
  if (worker.hourlyRateMin == null && worker.hourlyRateMax == null) return null;
  if (worker.hourlyRateMin != null && worker.hourlyRateMax != null) {
    return `$${Math.round(worker.hourlyRateMin)}–$${Math.round(worker.hourlyRateMax)} / hour`;
  }
  if (worker.hourlyRateMin != null) return `From $${Math.round(worker.hourlyRateMin)} / hour`;
  return `Up to $${Math.round(worker.hourlyRateMax ?? 0)} / hour`;
}
