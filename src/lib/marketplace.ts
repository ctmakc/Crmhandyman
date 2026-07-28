import { prisma } from "@/lib/prisma";

export type PublicService = {
  slug: string;
  name: string;
  category: string;
  description: string | null;
  priceFrom: number | null;
  isPrimary: boolean;
};

export type PublicServiceArea = {
  city: string;
  province: string;
  postalPrefix: string | null;
  radiusKm: number;
};

export type PublicReview = {
  id: string;
  authorName: string;
  rating: number;
  title: string | null;
  body: string;
  source: string;
  createdAt: Date;
};

export type PublicContractor = {
  id: string;
  slug: string;
  displayName: string;
  headline: string | null;
  description: string | null;
  logoUrl: string | null;
  coverUrl: string | null;
  phone: string | null;
  publicEmail: string | null;
  website: string | null;
  city: string;
  province: string;
  postalCode: string | null;
  country: string;
  latitude: number | null;
  longitude: number | null;
  serviceRadiusKm: number;
  yearsInBusiness: number | null;
  emergencyService: boolean;
  minimumJobValue: number | null;
  languages: string;
  insuranceVerified: boolean;
  licenceVerified: boolean;
  identityVerified: boolean;
  verificationStatus: string;
  averageRating: number;
  reviewCount: number;
  responseTimeMinutes: number | null;
  completedJobs: number;
  seoTitle: string | null;
  seoDescription: string | null;
  services: PublicService[];
  serviceAreas: PublicServiceArea[];
  reviews: PublicReview[];
  portfolio: Array<{
    id: string;
    title: string;
    description: string | null;
    imageUrl: string;
    city: string | null;
    serviceSlug: string | null;
    completedAt: Date | null;
  }>;
};

export type PublicVacancy = {
  id: string;
  slug: string;
  title: string;
  description: string;
  serviceSlug: string;
  employmentType: string;
  city: string;
  province: string;
  compensationMin: number | null;
  compensationMax: number | null;
  compensationUnit: string;
  isRemote: boolean;
  validThrough: Date | null;
  createdAt: Date;
  company: {
    name: string;
    slug: string;
    logoUrl: string | null;
    verificationStatus: string;
  };
};

export const SERVICE_CATALOG = [
  { slug: "general-handyman", name: "General handyman", category: "General repairs" },
  { slug: "drywall-repair", name: "Drywall repair", category: "Interior" },
  { slug: "interior-painting", name: "Interior painting", category: "Painting" },
  { slug: "exterior-painting", name: "Exterior painting", category: "Painting" },
  { slug: "bathroom-renovation", name: "Bathroom renovation", category: "Renovation" },
  { slug: "kitchen-renovation", name: "Kitchen renovation", category: "Renovation" },
  { slug: "basement-finishing", name: "Basement finishing", category: "Renovation" },
  { slug: "deck-building", name: "Deck building and repair", category: "Exterior" },
  { slug: "fence-repair", name: "Fence repair", category: "Exterior" },
  { slug: "flooring-installation", name: "Flooring installation", category: "Interior" },
  { slug: "tile-installation", name: "Tile installation", category: "Interior" },
  { slug: "carpentry", name: "Carpentry", category: "Carpentry" },
] as const;

export const CANADIAN_MARKETS = [
  { province: "Ontario", provinceSlug: "ontario", city: "Ottawa", citySlug: "ottawa" },
  { province: "Ontario", provinceSlug: "ontario", city: "Kanata", citySlug: "kanata" },
  { province: "Ontario", provinceSlug: "ontario", city: "Toronto", citySlug: "toronto" },
  { province: "Ontario", provinceSlug: "ontario", city: "Mississauga", citySlug: "mississauga" },
  { province: "Ontario", provinceSlug: "ontario", city: "Hamilton", citySlug: "hamilton" },
  { province: "Quebec", provinceSlug: "quebec", city: "Montreal", citySlug: "montreal" },
  { province: "Alberta", provinceSlug: "alberta", city: "Calgary", citySlug: "calgary" },
  { province: "Alberta", provinceSlug: "alberta", city: "Edmonton", citySlug: "edmonton" },
  { province: "British Columbia", provinceSlug: "british-columbia", city: "Vancouver", citySlug: "vancouver" },
] as const;

export function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function titleFromSlug(value: string): string {
  return value
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function normalize(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

export async function getPublicContractors(filters: {
  service?: string;
  city?: string;
  province?: string;
  query?: string;
  limit?: number;
} = {}): Promise<PublicContractor[]> {
  try {
    const rows = await prisma.contractorProfile.findMany({
      where: { profileStatus: "PUBLISHED" },
      include: {
        services: true,
        serviceAreas: true,
        reviews: {
          where: { isVisible: true },
          orderBy: { createdAt: "desc" },
          take: 8,
        },
        portfolio: {
          where: { isPublished: true },
          orderBy: { createdAt: "desc" },
          take: 8,
        },
      },
      orderBy: [{ averageRating: "desc" }, { reviewCount: "desc" }, { completedJobs: "desc" }],
      take: Math.min(Math.max(filters.limit ?? 100, 1), 250),
    });

    const service = normalize(filters.service);
    const city = normalize(filters.city);
    const province = normalize(filters.province);
    const query = normalize(filters.query);

    return rows.filter((row) => {
      const matchesService =
        !service || row.services.some((item) => normalize(item.slug) === service);
      const matchesCity =
        !city ||
        normalize(row.city) === city ||
        row.serviceAreas.some((area) => normalize(area.city) === city);
      const matchesProvince =
        !province ||
        normalize(row.province) === province ||
        row.serviceAreas.some((area) => normalize(area.province) === province);
      const haystack = [
        row.displayName,
        row.headline,
        row.description,
        row.city,
        row.province,
        ...row.services.map((item) => `${item.name} ${item.category}`),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const matchesQuery = !query || haystack.includes(query);

      return matchesService && matchesCity && matchesProvince && matchesQuery;
    });
  } catch (error) {
    console.error("Unable to load public contractors", error);
    return [];
  }
}

export async function getPublicContractor(slug: string): Promise<PublicContractor | null> {
  try {
    return await prisma.contractorProfile.findFirst({
      where: { slug, profileStatus: "PUBLISHED" },
      include: {
        services: { orderBy: [{ isPrimary: "desc" }, { name: "asc" }] },
        serviceAreas: { orderBy: [{ province: "asc" }, { city: "asc" }] },
        reviews: {
          where: { isVisible: true },
          orderBy: { createdAt: "desc" },
          take: 50,
        },
        portfolio: {
          where: { isPublished: true },
          orderBy: { createdAt: "desc" },
          take: 24,
        },
      },
    });
  } catch (error) {
    console.error("Unable to load contractor profile", error);
    return null;
  }
}

export async function getPublicVacancies(filters: {
  service?: string;
  city?: string;
  province?: string;
  limit?: number;
} = {}): Promise<PublicVacancy[]> {
  try {
    const rows = await prisma.vacancy.findMany({
      where: {
        status: "PUBLISHED",
        OR: [{ validThrough: null }, { validThrough: { gte: new Date() } }],
      },
      include: { profile: true },
      orderBy: { createdAt: "desc" },
      take: Math.min(Math.max(filters.limit ?? 100, 1), 250),
    });

    const service = normalize(filters.service);
    const city = normalize(filters.city);
    const province = normalize(filters.province);

    return rows
      .filter(
        (row) =>
          (!service || normalize(row.serviceSlug) === service) &&
          (!city || normalize(row.city) === city) &&
          (!province || normalize(row.province) === province)
      )
      .map((row) => ({
        id: row.id,
        slug: row.slug,
        title: row.title,
        description: row.description,
        serviceSlug: row.serviceSlug,
        employmentType: row.employmentType,
        city: row.city,
        province: row.province,
        compensationMin: row.compensationMin,
        compensationMax: row.compensationMax,
        compensationUnit: row.compensationUnit,
        isRemote: row.isRemote,
        validThrough: row.validThrough,
        createdAt: row.createdAt,
        company: {
          name: row.profile.displayName,
          slug: row.profile.slug,
          logoUrl: row.profile.logoUrl,
          verificationStatus: row.profile.verificationStatus,
        },
      }));
  } catch (error) {
    console.error("Unable to load vacancies", error);
    return [];
  }
}

export async function getPublicVacancy(slug: string): Promise<PublicVacancy | null> {
  const vacancies = await getPublicVacancies({ limit: 250 });
  return vacancies.find((vacancy) => vacancy.slug === slug) ?? null;
}

export async function getMarketplaceStats() {
  try {
    const [contractors, openJobs, vacancies, reviews] = await Promise.all([
      prisma.contractorProfile.count({ where: { profileStatus: "PUBLISHED" } }),
      prisma.marketplaceJob.count({ where: { status: { in: ["OPEN", "MATCHING"] } } }),
      prisma.vacancy.count({ where: { status: "PUBLISHED" } }),
      prisma.review.count({ where: { isVisible: true } }),
    ]);

    return { contractors, openJobs, vacancies, reviews };
  } catch {
    return { contractors: 0, openJobs: 0, vacancies: 0, reviews: 0 };
  }
}

export function formatCompensation(vacancy: PublicVacancy): string | null {
  if (vacancy.compensationMin == null && vacancy.compensationMax == null) return null;

  const unit = vacancy.compensationUnit.toLowerCase();
  const min = vacancy.compensationMin == null ? null : Math.round(vacancy.compensationMin);
  const max = vacancy.compensationMax == null ? null : Math.round(vacancy.compensationMax);

  if (min != null && max != null) return `$${min}–$${max} / ${unit}`;
  if (min != null) return `From $${min} / ${unit}`;
  return `Up to $${max} / ${unit}`;
}
